const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn: defaultSpawn } = require("node:child_process");

const TOKEN_TTL = 6 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function publicError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateRemoteUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw publicError("invalid-url", "URL de midia invalida."); }
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw publicError("invalid-url", "A midia precisa usar HTTP ou HTTPS.");
  return url.toString();
}

class MediaManager {
  constructor({ app, net, ffmpegPath, spawn = defaultSpawn, emit = () => {} }) {
    this.app = app;
    this.net = net;
    this.ffmpegPath = ffmpegPath;
    this.spawn = spawn;
    this.emit = emit;
    this.images = new Map();
    this.imageTokensByUrl = new Map();
    this.transcodes = new Map();
    this.probeQueue = Promise.resolve();
    this.root = path.join(app.getPath("userData"), "media-cache");
    fs.mkdirSync(this.root, { recursive: true });
    this.pruneCache();
  }

  registerImage(remoteUrl) {
    const url = validateRemoteUrl(remoteUrl);
    const existing = this.imageTokensByUrl.get(url);
    if (existing && this.images.get(existing)?.expiresAt > Date.now()) return `app://server-xtreme/media/image/${existing}`;
    const token = crypto.randomBytes(24).toString("hex");
    this.images.set(token, { url, expiresAt: Date.now() + TOKEN_TTL });
    this.imageTokensByUrl.set(url, token);
    return `app://server-xtreme/media/image/${token}`;
  }

  probeStream(candidates) {
    const urls = Array.isArray(candidates) ? candidates.map(validateRemoteUrl).slice(0, 4) : [];
    if (urls.length === 0) return Promise.resolve({ status: "network-error", reason: "Nenhuma URL de stream foi fornecida." });
    const task = this.probeQueue.then(() => this.runProbe(urls));
    this.probeQueue = task.catch(() => {});
    return task;
  }

  async runProbe(urls) {
    let last = { status: "network-error", reason: "Nao foi possivel conectar ao servidor." };
    for (let index = 0; index < urls.length; index += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await this.net.fetch(urls[index], {
          redirect: "follow",
          signal: controller.signal,
          headers: { Range: "bytes=0-1023", "User-Agent": "Play-TV-X/0.4.3", Accept: "*/*" }
        });
        if (response.status === 401 || response.status === 403) {
          void response.body?.cancel();
          return { status: "access-denied", httpStatus: response.status, reason: "Acesso recusado pelo provedor." };
        }
        if (response.status === 404 || response.status === 410) {
          void response.body?.cancel();
          last = { status: "unavailable", httpStatus: response.status, reason: "Canal removido ou desativado pelo servidor." };
          continue;
        }
        if (response.status >= 500) {
          void response.body?.cancel();
          last = { status: "server-error", httpStatus: response.status, reason: "Servidor temporariamente indisponivel." };
          continue;
        }
        if (!response.ok && response.status !== 206) {
          void response.body?.cancel();
          last = { status: "network-error", httpStatus: response.status, reason: `Servidor respondeu HTTP ${response.status}.` };
          continue;
        }
        const reader = response.body?.getReader();
        const chunk = reader ? await reader.read() : { value: undefined };
        void reader?.cancel();
        const bytes = Buffer.from(chunk.value ?? []);
        const text = bytes.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
        const type = (response.headers.get("content-type") || "").toLowerCase();
        if (bytes.length === 0 || type.includes("text/html") || text.startsWith("<html") || text.startsWith("<!doctype")) {
          last = { status: "unavailable", httpStatus: response.status, reason: "O servidor nao retornou um stream valido." };
          continue;
        }
        const format = text.startsWith("#extm3u") || type.includes("mpegurl")
          ? "m3u8"
          : bytes[0] === 0x47 || type.includes("mp2t")
            ? "ts"
            : type.includes("mp4") || bytes.subarray(4, 8).toString("ascii") === "ftyp"
              ? "mp4"
              : "unknown";
        return { status: "available", candidateIndex: index, format, httpStatus: response.status };
      } catch (error) {
        last = error?.name === "AbortError"
          ? { status: "timeout", reason: "O servidor demorou demais para responder." }
          : { status: "network-error", reason: "Nao foi possivel conectar ao servidor." };
      } finally {
        clearTimeout(timeout);
      }
    }
    return last;
  }

  async startTranscode(remoteUrl) {
    const url = validateRemoteUrl(remoteUrl);
    await this.preflight(url);
    if (!this.ffmpegPath || !fs.existsSync(this.ffmpegPath)) throw publicError("transcoder-unavailable", "Conversor de video nao esta disponivel nesta instalacao.");
    const id = crypto.randomBytes(18).toString("hex");
    const directory = path.join(this.root, `transcode-${id}`);
    fs.mkdirSync(directory, { recursive: true });
    const playlist = path.join(directory, "index.m3u8");
    const args = [
      "-hide_banner", "-loglevel", "warning", "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
      "-i", url,
      "-map", "0:v:0?", "-map", "0:a:0?",
      "-vf", "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k", "-ac", "2",
      "-f", "hls", "-hls_time", "4", "-hls_list_size", "0", "-hls_flags", "independent_segments+temp_file",
      "-hls_segment_filename", path.join(directory, "segment-%05d.ts"), playlist
    ];
    const child = this.spawn(this.ffmpegPath, args, { windowsHide: true });
    const session = { id, child, directory, playlist, stderr: "", status: "preparing" };
    this.transcodes.set(id, session);
    child.stderr?.on("data", (chunk) => { session.stderr = `${session.stderr}${chunk}`.slice(-4000); });
    child.on("exit", (code) => {
      if (session.status !== "stopped" && code !== 0) {
        session.status = "error";
        this.emit({ id, status: "error", error: "Nao foi possivel converter este codec." });
      }
    });
    await this.waitForPlaylist(session);
    session.status = "ready";
    this.emit({ id, status: "ready" });
    return { id, url: `app://server-xtreme/media/transcode/${id}/index.m3u8`, mode: "transcoding" };
  }

  async preflight(url) {
    let response;
    try { response = await this.net.fetch(url, { redirect: "follow", headers: { Range: "bytes=0-0", "User-Agent": "Play-TV-X/0.4.2" } }); }
    catch { throw publicError("network", "Nao foi possivel conectar ao servidor do episodio."); }
    void response.body?.cancel().catch(() => {});
    if (response.status === 401 || response.status === 403) throw publicError("access-denied", "O servidor recusou o acesso ao episodio.");
    if (response.status === 404 || response.status === 410) throw publicError("not-found", "O episodio nao existe mais no servidor.");
    if (response.status >= 500) throw publicError("server", "O servidor falhou ao abrir o episodio.");
    if (!response.ok && response.status !== 206) throw publicError("http", `O servidor respondeu com HTTP ${response.status}.`);
  }

  waitForPlaylist(session) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (fs.existsSync(session.playlist) && fs.statSync(session.playlist).size > 0) { clearInterval(timer); resolve(); return; }
        if (session.status === "error" || Date.now() - started > 30000) {
          clearInterval(timer); this.stopTranscode(session.id);
          reject(publicError("transcode-failed", session.stderr.trim() || "O formato compativel nao ficou pronto a tempo."));
        }
      }, 250);
    });
  }

  stopTranscode(id) {
    const session = this.transcodes.get(id);
    if (!session) return;
    session.status = "stopped";
    session.child.kill();
    this.transcodes.delete(id);
    setTimeout(() => fs.rm(session.directory, { recursive: true, force: true }, () => {}), 500);
  }

  stopAll() { for (const id of [...this.transcodes.keys()]) this.stopTranscode(id); }

  async handleProtocolRequest(request) {
    const url = new URL(request.url);
    const imageMatch = url.pathname.match(/^\/media\/image\/([a-f0-9]+)$/);
    if (imageMatch) return this.fetchImage(imageMatch[1]);
    const mediaMatch = url.pathname.match(/^\/media\/transcode\/([a-f0-9]+)\/([a-zA-Z0-9.-]+)$/);
    if (mediaMatch) return this.readTranscode(mediaMatch[1], mediaMatch[2]);
    return undefined;
  }

  async fetchImage(token) {
    const entry = this.images.get(token);
    if (!entry || entry.expiresAt <= Date.now()) return new Response("Imagem expirada.", { status: 404 });
    const cachePath = path.join(this.root, `image-${crypto.createHash("sha256").update(entry.url).digest("hex")}`);
    const typePath = `${cachePath}.type`;
    if (fs.existsSync(cachePath)) return new Response(await fs.promises.readFile(cachePath), { headers: { "content-type": fs.existsSync(typePath) ? await fs.promises.readFile(typePath, "utf8") : "image/jpeg", "cache-control": "public, max-age=3600" } });
    try {
      const response = await this.net.fetch(entry.url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 Play-TV-X/0.4.2", Accept: "image/avif,image/webp,image/*,*/*;q=0.8" } });
      if (!response.ok) return new Response("Imagem indisponivel.", { status: response.status });
      const type = response.headers.get("content-type") || "image/jpeg";
      if (!type.startsWith("image/")) return new Response("Resposta nao e uma imagem.", { status: 415 });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_IMAGE_BYTES) return new Response("Imagem muito grande.", { status: 413 });
      await fs.promises.writeFile(cachePath, bytes); await fs.promises.writeFile(typePath, type);
      return new Response(bytes, { headers: { "content-type": type, "cache-control": "public, max-age=3600" } });
    } catch { return new Response("Falha de rede ao carregar imagem.", { status: 502 }); }
  }

  async readTranscode(id, filename) {
    const session = this.transcodes.get(id);
    if (!session) return new Response("Sessao encerrada.", { status: 404 });
    const file = path.join(session.directory, path.basename(filename));
    try {
      const bytes = await fs.promises.readFile(file);
      const type = filename.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t";
      return new Response(bytes, { headers: { "content-type": type, "cache-control": "no-store" } });
    } catch { return new Response("Segmento ainda nao disponivel.", { status: 404 }); }
  }

  pruneCache() {
    try {
      const files = fs.readdirSync(this.root).map((name) => ({ name, path: path.join(this.root, name) })).filter((entry) => entry.name.startsWith("image-"));
      const stats = files.map((entry) => ({ ...entry, stat: fs.statSync(entry.path) })).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
      let size = 0;
      for (const entry of stats) { size += entry.stat.size; if (size > 100 * 1024 * 1024) fs.rmSync(entry.path, { force: true }); }
    } catch { /* Cache cleanup is best effort. */ }
  }
}

module.exports = { MediaManager, validateRemoteUrl };
