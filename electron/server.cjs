const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { gunzipSync } = require("node:zlib");
const { isIP } = require("node:net");

const DIST_DIR = path.join(__dirname, "..", "dist");
const CINEMETA_BASE = "https://v3-cinemeta.strem.io";
const OPENSUBS_ADDON_BASE = "https://opensubtitles-v3.strem.io";
const SUBTITLE_UA = "ServerXtreme/0.3.0";
const MAX_BODY_BYTES = 1024 * 1024;
const PT_LANGS = new Set(["por", "pob"]);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendText(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function buildXtreamTargetUrl(serverUrl) {
  const target = new URL(serverUrl);
  if (!new Set(["http:", "https:"]).has(target.protocol)) {
    throw new Error("Server URL must start with http:// or https://.");
  }
  target.pathname = `${target.pathname.replace(/\/player_api\.php\/?$/i, "").replace(/\/+$/, "")}/player_api.php`;
  target.search = "";
  target.hash = "";
  return target;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8").trim();
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

async function handleXtream(req, res) {
  if (req.method !== "POST") {
    sendText(res, 405, "Use POST for /api/xtream.");
    return;
  }

  const payload = await readJsonBody(req);
  const serverUrl = typeof payload.serverUrl === "string" ? payload.serverUrl : "";
  const username = typeof payload.username === "string" ? payload.username : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  const action = typeof payload.action === "string" ? payload.action : "";
  const params = payload.params && typeof payload.params === "object" ? payload.params : {};
  if (!serverUrl || !username || !password) {
    sendText(res, 400, "Missing serverUrl, username, or password.");
    return;
  }

  const target = buildXtreamTargetUrl(serverUrl);
  target.searchParams.set("username", username);
  target.searchParams.set("password", password);
  if (action) target.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
  }
  const upstream = await fetch(target);
  const body = await upstream.arrayBuffer();
  res.writeHead(upstream.status, {
    "content-type": upstream.headers.get("content-type") ?? "application/json"
  });
  res.end(Buffer.from(body));
}

async function resolveImdbId(query, kind) {
  const target = `${CINEMETA_BASE}/catalog/${kind}/top/search=${encodeURIComponent(query)}.json`;
  const upstream = await fetch(target, { headers: { "User-Agent": SUBTITLE_UA } });
  if (!upstream.ok) return undefined;
  return (await upstream.json()).metas?.[0]?.id;
}

async function handleSubtitleSearch(requestUrl, res) {
  const query = requestUrl.searchParams.get("query");
  if (!query) return sendText(res, 400, "Missing query.");
  const season = requestUrl.searchParams.get("season");
  const episode = requestUrl.searchParams.get("episode");
  const isSeries = Boolean(season && episode);
  const imdbId = await resolveImdbId(query, isSeries ? "series" : "movie");
  if (!imdbId) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end("[]");
  }

  const videoId = isSeries ? `${imdbId}:${season}:${episode}` : imdbId;
  const target = `${OPENSUBS_ADDON_BASE}/subtitles/${isSeries ? "series" : "movie"}/${videoId}.json`;
  const upstream = await fetch(target, { headers: { "User-Agent": SUBTITLE_UA } });
  if (!upstream.ok) return sendText(res, upstream.status, await upstream.text());
  const payload = await upstream.json();
  const results = (payload.subtitles ?? [])
    .filter((entry) => entry.url && PT_LANGS.has(entry.lang ?? ""))
    .map((entry, index) => ({
      fileId: Buffer.from(entry.url).toString("base64url"),
      language: entry.lang === "pob" ? "Português (BR)" : "Português",
      release: `Opção ${index + 1}`,
      downloads: 0
    }));
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(results));
}

function srtToVtt(srt) {
  return `WEBVTT\n\n${srt.replace(/\r+/g, "").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
}

async function handleSubtitleDownload(requestUrl, res) {
  const fileId = requestUrl.searchParams.get("fileId");
  if (!fileId) return sendText(res, 400, "Missing fileId.");
  const link = Buffer.from(fileId, "base64url").toString("utf-8");
  if (!/^https?:\/\//.test(link)) return sendText(res, 400, "Invalid subtitle reference.");
  const subtitleUrl = new URL(link);
  if (isPrivateHostname(subtitleUrl.hostname)) {
    return sendText(res, 400, "Private subtitle addresses are not allowed.");
  }
  const upstream = await fetch(link, { headers: { "User-Agent": SUBTITLE_UA } });
  if (!upstream.ok) return sendText(res, upstream.status, await upstream.text());
  let bytes = Buffer.from(await upstream.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
  const utf8 = bytes.toString("utf-8");
  const text = (utf8.match(/�/g) ?? []).length > 3 ? bytes.toString("latin1") : utf8;
  res.writeHead(200, { "content-type": "text/vtt; charset=utf-8" });
  res.end(srtToVtt(text));
}

function isPrivateHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  if (!isIP(normalized)) return false;
  if (
    normalized === "::1" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  )
    return true;
  const parts = normalized.split(".").map(Number);
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function serveStatic(pathname, res) {
  const decoded = decodeURIComponent(pathname);
  const candidate = path.resolve(DIST_DIR, `.${decoded}`);
  let filePath = candidate.startsWith(`${DIST_DIR}${path.sep}`) ? candidate : "";
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, "index.html");
  }
  fs.readFile(filePath, (error, data) => {
    if (error) return sendText(res, 404, "Not found.");
    res.writeHead(200, {
      "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream"
    });
    res.end(data);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, "http://127.0.0.1");
      if (requestUrl.pathname === "/api/xtream") return await handleXtream(req, res);
      if (requestUrl.pathname === "/api/subtitles/file")
        return await handleSubtitleDownload(requestUrl, res);
      if (requestUrl.pathname === "/api/subtitles")
        return await handleSubtitleSearch(requestUrl, res);
      serveStatic(requestUrl.pathname, res);
    } catch (error) {
      sendText(res, 502, error instanceof Error ? error.message : "Internal error.");
    }
  });
}

function start() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({ port: server.address().port, server });
    });
  });
}

async function handleProtocolRequest(request) {
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname === "/api/xtream") {
    if (request.method !== "POST")
      return new Response("Use POST for /api/xtream.", { status: 405 });
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES)
      return new Response("Request body is too large.", { status: 413 });
    let payload;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      return new Response("Invalid JSON body.", { status: 400 });
    }
    const { serverUrl, username, password, action, params = {} } = payload ?? {};
    if (![serverUrl, username, password].every((value) => typeof value === "string" && value)) {
      return new Response("Missing serverUrl, username, or password.", { status: 400 });
    }
    const target = buildXtreamTargetUrl(serverUrl);
    target.searchParams.set("username", username);
    target.searchParams.set("password", password);
    if (typeof action === "string" && action) target.searchParams.set("action", action);
    if (params && typeof params === "object")
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
      }
    const upstream = await fetch(target);
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" }
    });
  }

  if (requestUrl.pathname === "/api/subtitles") {
    const query = requestUrl.searchParams.get("query");
    if (!query) return new Response("Missing query.", { status: 400 });
    const season = requestUrl.searchParams.get("season");
    const episode = requestUrl.searchParams.get("episode");
    const isSeries = Boolean(season && episode);
    const imdbId = await resolveImdbId(query, isSeries ? "series" : "movie");
    if (!imdbId) return Response.json([]);
    const videoId = isSeries ? `${imdbId}:${season}:${episode}` : imdbId;
    const target = `${OPENSUBS_ADDON_BASE}/subtitles/${isSeries ? "series" : "movie"}/${videoId}.json`;
    const upstream = await fetch(target, { headers: { "User-Agent": SUBTITLE_UA } });
    if (!upstream.ok) return new Response(await upstream.text(), { status: upstream.status });
    const payload = await upstream.json();
    return Response.json(
      (payload.subtitles ?? [])
        .filter((entry) => entry.url && PT_LANGS.has(entry.lang ?? ""))
        .map((entry, index) => ({
          fileId: Buffer.from(entry.url).toString("base64url"),
          language: entry.lang === "pob" ? "Portugues (BR)" : "Portugues",
          release: `Opcao ${index + 1}`,
          downloads: 0
        }))
    );
  }

  if (requestUrl.pathname === "/api/subtitles/file") {
    const fileId = requestUrl.searchParams.get("fileId");
    if (!fileId) return new Response("Missing fileId.", { status: 400 });
    const link = Buffer.from(fileId, "base64url").toString("utf-8");
    let subtitleUrl;
    try {
      subtitleUrl = new URL(link);
    } catch {
      return new Response("Invalid subtitle reference.", { status: 400 });
    }
    if (
      !["http:", "https:"].includes(subtitleUrl.protocol) ||
      isPrivateHostname(subtitleUrl.hostname)
    )
      return new Response("Invalid subtitle reference.", { status: 400 });
    const upstream = await fetch(subtitleUrl, { headers: { "User-Agent": SUBTITLE_UA } });
    if (!upstream.ok) return new Response(await upstream.text(), { status: upstream.status });
    let bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
    return new Response(srtToVtt(bytes.toString("utf-8")), {
      headers: { "content-type": "text/vtt; charset=utf-8" }
    });
  }

  const decoded = decodeURIComponent(requestUrl.pathname);
  const candidate = path.resolve(DIST_DIR, `.${decoded}`);
  let filePath = candidate.startsWith(`${DIST_DIR}${path.sep}`) ? candidate : "";
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory())
    filePath = path.join(DIST_DIR, "index.html");
  try {
    return new Response(await fs.promises.readFile(filePath), {
      headers: { "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream" }
    });
  } catch {
    return new Response("Not found.", { status: 404 });
  }
}

module.exports = {
  createServer,
  start,
  handleProtocolRequest,
  buildXtreamTargetUrl,
  isPrivateHostname
};
