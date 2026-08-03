const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { Readable } = require("node:stream");

// eslint-disable-next-line no-control-regex
const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*\x00-\x1f]/g;

function sanitizeFilename(value) {
  return String(value || "download")
    .replace(INVALID_FILENAME_CHARACTERS, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 160) || "download";
}

class DownloadManager {
  constructor({ app, dialog, shell, safeStorage, emit }) {
    this.app = app;
    this.dialog = dialog;
    this.shell = shell;
    this.safeStorage = safeStorage;
    this.emit = emit;
    this.jobs = new Map();
    this.controllers = new Map();
    this.settingsPath = path.join(app.getPath("userData"), "downloads.json");
    this.downloadDirectory = app.getPath("downloads");
    this.load();
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.settingsPath, "utf8"));
      if (typeof saved.directory === "string") this.downloadDirectory = saved.directory;
      for (const job of Array.isArray(saved.jobs) ? saved.jobs : []) {
        const status = job.status === "downloading" || job.status === "queued" ? "paused" : job.status;
        const url = this.decryptUrl(job.encryptedUrl);
        this.jobs.set(job.id, { ...job, url, status });
      }
    } catch {
      // First run or invalid legacy state.
    }
  }

  persist() {
    fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
    fs.writeFileSync(
      this.settingsPath,
      JSON.stringify({
        directory: this.downloadDirectory,
        jobs: [...this.jobs.values()].map(({ url, ...job }) => ({ ...job, encryptedUrl: this.encryptUrl(url) }))
      }, null, 2)
    );
  }

  snapshot() {
    return {
      directory: this.downloadDirectory,
      jobs: [...this.jobs.values()].map((job) => ({
        id: job.id,
        contentId: job.contentId,
        seriesId: job.seriesId,
        title: job.title,
        status: job.status,
        receivedBytes: job.receivedBytes,
        totalBytes: job.totalBytes,
        error: job.error,
        createdAt: job.createdAt,
        completedAt: job.completedAt
      }))
    };
  }

  encryptUrl(url) {
    if (!url) return "";
    if (this.safeStorage?.isEncryptionAvailable()) {
      return `safe:${this.safeStorage.encryptString(url).toString("base64")}`;
    }
    return "";
  }

  decryptUrl(value) {
    try {
      if (value?.startsWith("safe:") && this.safeStorage?.isEncryptionAvailable()) {
        return this.safeStorage.decryptString(Buffer.from(value.slice(5), "base64"));
      }
    } catch { /* The OS encryption key may have changed. */ }
    return "";
  }

  notify() {
    this.persist();
    this.emit(this.snapshot());
  }

  async chooseDirectory(window) {
    const result = await this.dialog.showOpenDialog(window, {
      title: "Escolher pasta de downloads",
      defaultPath: this.downloadDirectory,
      properties: ["openDirectory", "createDirectory"]
    });
    if (!result.canceled && result.filePaths[0]) {
      this.downloadDirectory = result.filePaths[0];
      this.notify();
    }
    return this.snapshot();
  }

  enqueue(input) {
    if (!input || !/^https?:\/\//i.test(input.url || "")) throw new Error("URL de download invalida.");
    const id = randomUUID();
    const extension = String(input.extension || path.extname(new URL(input.url).pathname) || ".mp4")
      .replace(/[^a-z0-9.]/gi, "")
      .slice(0, 10);
    const finalPath = path.join(this.downloadDirectory, `${sanitizeFilename(input.title)}-${id.slice(0, 8)}${extension.startsWith(".") ? extension : `.${extension}`}`);
    const job = {
      id,
      contentId: String(input.contentId),
      seriesId: input.seriesId ? String(input.seriesId) : undefined,
      title: String(input.title || "Download"),
      url: input.url,
      finalPath,
      partPath: `${finalPath}.part`,
      status: "queued",
      receivedBytes: 0,
      totalBytes: undefined,
      createdAt: new Date().toISOString(),
      error: undefined
    };
    this.jobs.set(id, job);
    this.notify();
    this.pump();
    return job;
  }

  pump() {
    if (this.controllers.size > 0) return;
    const next = [...this.jobs.values()].find((job) => job.status === "queued");
    if (next) void this.start(next.id);
  }

  async start(id) {
    const job = this.jobs.get(id);
    if (!job || job.status === "completed" || this.controllers.has(id)) return;
    if (!/^https?:\/\//i.test(job.url || "")) {
      job.status = "error";
      job.error = "A credencial deste download nao esta mais disponivel.";
      this.notify();
      return;
    }
    fs.mkdirSync(path.dirname(job.finalPath), { recursive: true });
    const existing = fs.existsSync(job.partPath) ? fs.statSync(job.partPath).size : 0;
    const controller = new AbortController();
    this.controllers.set(id, controller);
    Object.assign(job, { status: "downloading", receivedBytes: existing, error: undefined });
    this.notify();

    try {
      const headers = existing > 0 ? { Range: `bytes=${existing}-` } : {};
      let response = await fetch(job.url, { headers, signal: controller.signal });
      let append = existing > 0 && response.status === 206;
      if (existing > 0 && response.status === 200) {
        append = false;
        job.receivedBytes = 0;
      }
      if (!response.ok) throw new Error(`Servidor respondeu HTTP ${response.status}.`);
      const responseLength = Number(response.headers.get("content-length") || 0);
      job.totalBytes = responseLength > 0 ? job.receivedBytes + responseLength : undefined;
      if (responseLength > 0 && typeof fs.statfsSync === "function") {
        const disk = fs.statfsSync(path.dirname(job.finalPath));
        const available = Number(disk.bavail) * Number(disk.bsize);
        if (available < responseLength + 50 * 1024 * 1024) {
          throw new Error("Espaco em disco insuficiente para concluir o download.");
        }
      }
      const stream = fs.createWriteStream(job.partPath, { flags: append ? "a" : "w" });
      const reader = response.body?.getReader();
      if (!reader) throw new Error("O servidor nao forneceu dados para download.");
      let lastNotify = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!stream.write(Buffer.from(value))) await new Promise((resolve) => stream.once("drain", resolve));
          job.receivedBytes += value.byteLength;
          if (Date.now() - lastNotify > 300) {
            lastNotify = Date.now();
            this.emit(this.snapshot());
          }
        }
      } finally {
        await new Promise((resolve, reject) => stream.end((error) => (error ? reject(error) : resolve())));
      }
      fs.renameSync(job.partPath, job.finalPath);
      job.status = "completed";
      job.completedAt = new Date().toISOString();
      this.notify();
    } catch (error) {
      if (controller.signal.aborted) {
        if (job.status !== "cancelled") job.status = "paused";
        if (job.status === "cancelled") {
          try { if (fs.existsSync(job.partPath)) fs.unlinkSync(job.partPath); } catch { /* Best-effort cleanup. */ }
        }
      } else {
        job.status = "error";
        job.error = error instanceof Error ? error.message : "Falha no download.";
      }
      this.notify();
    } finally {
      this.controllers.delete(id);
      this.pump();
    }
  }

  pause(id) {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = "paused";
    this.controllers.get(id)?.abort();
    this.notify();
  }

  resume(id) {
    const job = this.jobs.get(id);
    if (!job || job.status === "completed") return;
    job.status = "queued";
    this.notify();
    this.pump();
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = "cancelled";
    this.controllers.get(id)?.abort();
    try { if (fs.existsSync(job.partPath)) fs.unlinkSync(job.partPath); } catch { /* Best-effort cleanup. */ }
    this.notify();
  }

  remove(id) {
    const job = this.jobs.get(id);
    if (!job) return;
    this.controllers.get(id)?.abort();
    for (const target of [job.partPath, job.finalPath]) {
      try { if (fs.existsSync(target)) fs.unlinkSync(target); } catch { /* Best-effort cleanup. */ }
    }
    this.jobs.delete(id);
    this.notify();
  }

  async open(id) {
    const job = this.jobs.get(id);
    if (!job || job.status !== "completed" || !fs.existsSync(job.finalPath)) throw new Error("Arquivo baixado nao encontrado.");
    return this.shell.openPath(job.finalPath);
  }

  async openDirectory() {
    fs.mkdirSync(this.downloadDirectory, { recursive: true });
    return this.shell.openPath(this.downloadDirectory);
  }

  handleProtocolRequest(request) {
    const requestUrl = new URL(request.url);
    const match = requestUrl.pathname.match(/^\/downloads\/([a-f0-9-]+)$/i);
    if (!match) return undefined;
    const job = this.jobs.get(match[1]);
    if (!job || job.status !== "completed" || !fs.existsSync(job.finalPath)) {
      return new Response("Download nao encontrado.", { status: 404 });
    }
    const size = fs.statSync(job.finalPath).size;
    const range = request.headers.get("range");
    let start = 0;
    let end = size - 1;
    let status = 200;
    const headers = { "accept-ranges": "bytes", "content-type": mediaType(job.finalPath) };
    if (range) {
      const parsed = /bytes=(\d+)-(\d*)/.exec(range);
      if (parsed) {
        start = Number(parsed[1]);
        end = parsed[2] ? Math.min(Number(parsed[2]), end) : end;
        status = 206;
        headers["content-range"] = `bytes ${start}-${end}/${size}`;
      }
    }
    if (start > end || start >= size) return new Response(null, { status: 416 });
    headers["content-length"] = String(end - start + 1);
    return new Response(Readable.toWeb(fs.createReadStream(job.finalPath, { start, end })), { status, headers });
  }
}

function mediaType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mkv") return "video/x-matroska";
  if (extension === ".webm") return "video/webm";
  if (extension === ".ts") return "video/mp2t";
  return "video/mp4";
}

module.exports = { DownloadManager, sanitizeFilename };
