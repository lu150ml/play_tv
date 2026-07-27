const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { gunzipSync } = require("node:zlib");

const DIST_DIR = path.join(__dirname, "..", "dist");
const CINEMETA_BASE = "https://v3-cinemeta.strem.io";
const OPENSUBS_ADDON_BASE = "https://opensubtitles-v3.strem.io";
const SUBTITLE_UA = "ServerXtreme/0.2";
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
  if (!target.pathname.endsWith("/player_api.php")) {
    target.pathname = `${target.pathname.replace(/\/$/, "")}/player_api.php`;
  }
  target.search = "";
  target.hash = "";
  return target;
}

async function handleXtream(requestUrl, res) {
  const serverUrl = requestUrl.searchParams.get("serverUrl");
  const username = requestUrl.searchParams.get("username");
  const password = requestUrl.searchParams.get("password");
  if (!serverUrl || !username || !password) {
    sendText(res, 400, "Missing serverUrl, username, or password.");
    return;
  }

  const target = buildXtreamTargetUrl(serverUrl);
  for (const [key, value] of requestUrl.searchParams.entries()) {
    if (key !== "serverUrl") target.searchParams.set(key, value);
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
  const upstream = await fetch(link, { headers: { "User-Agent": SUBTITLE_UA } });
  if (!upstream.ok) return sendText(res, upstream.status, await upstream.text());
  let bytes = Buffer.from(await upstream.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
  const utf8 = bytes.toString("utf-8");
  const text = (utf8.match(/�/g) ?? []).length > 3 ? bytes.toString("latin1") : utf8;
  res.writeHead(200, { "content-type": "text/vtt; charset=utf-8" });
  res.end(srtToVtt(text));
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
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, "http://127.0.0.1");
      if (requestUrl.pathname === "/api/xtream") return await handleXtream(requestUrl, res);
      if (requestUrl.pathname === "/api/subtitles/file") return await handleSubtitleDownload(requestUrl, res);
      if (requestUrl.pathname === "/api/subtitles") return await handleSubtitleSearch(requestUrl, res);
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

module.exports = { start };
