// Servidor HTTP local embutido no app empacotado (Electron).
// Serve os arquivos estáticos do dist E reimplementa os mesmos proxies do
// vite.config.ts (/api/xtream e /api/subtitles), para que o .exe funcione
// exatamente como o ambiente de desenvolvimento, sem problemas de CORS.

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { gunzipSync } = require("node:zlib");

const DIST_DIR = path.join(__dirname, "..", "dist");

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
  ".ico": "image/x-icon",
  ".map": "application/json"
};

function sendText(res, status, text) {
  res.statusCode = status;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(text);
}

// ---------------------------------------------------------------- Xtream proxy

function buildXtreamTargetUrl(serverUrl) {
  const target = new URL(serverUrl);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
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
  const action = requestUrl.searchParams.get("action");

  if (!serverUrl || !username || !password) {
    sendText(res, 400, "Missing serverUrl, username, or password.");
    return;
  }

  const target = buildXtreamTargetUrl(serverUrl);
  target.searchParams.set("username", username);
  target.searchParams.set("password", password);
  if (action) target.searchParams.set("action", action);

  for (const [key, value] of requestUrl.searchParams.entries()) {
    if (!["serverUrl", "username", "password", "action"].includes(key)) {
      target.searchParams.set(key, value);
    }
  }

  const upstream = await fetch(target);
  const body = await upstream.text();
  res.statusCode = upstream.status;
  res.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
  res.end(body);
}

// -------------------------------------------------------------- Subtitle proxy

const CINEMETA_BASE = "https://v3-cinemeta.strem.io";
const OPENSUBS_ADDON_BASE = "https://opensubtitles-v3.strem.io";
const SUBTITLE_UA = "ServerXtreme/0.1";
const PT_LANGS = new Set(["por", "pob"]);

async function resolveImdbId(query, kind) {
  const target = `${CINEMETA_BASE}/catalog/${kind}/top/search=${encodeURIComponent(query)}.json`;
  const upstream = await fetch(target, { headers: { "User-Agent": SUBTITLE_UA } });
  if (!upstream.ok) return undefined;
  const payload = await upstream.json();
  return payload.metas?.[0]?.id;
}

function decodeSubtitle(bytes) {
  const utf8 = bytes.toString("utf-8");
  const replacementCount = (utf8.match(/�/g) ?? []).length;
  return replacementCount > 3 ? bytes.toString("latin1") : utf8;
}

function srtToVtt(srt) {
  const body = srt.replace(/\r+/g, "").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body}`;
}

async function handleSubtitleSearch(requestUrl, res) {
  const query = requestUrl.searchParams.get("query");
  if (!query) {
    sendText(res, 400, "Missing query.");
    return;
  }

  const season = requestUrl.searchParams.get("season");
  const episode = requestUrl.searchParams.get("episode");
  const isSeries = Boolean(season && episode);

  const imdbId = await resolveImdbId(query, isSeries ? "series" : "movie");
  if (!imdbId) {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([]));
    return;
  }

  const videoId = isSeries ? `${imdbId}:${season}:${episode}` : imdbId;
  const addonUrl = `${OPENSUBS_ADDON_BASE}/subtitles/${isSeries ? "series" : "movie"}/${videoId}.json`;
  const upstream = await fetch(addonUrl, { headers: { "User-Agent": SUBTITLE_UA } });
  if (!upstream.ok) {
    sendText(res, upstream.status, await upstream.text());
    return;
  }

  const payload = await upstream.json();
  const results = (payload.subtitles ?? [])
    .filter((entry) => entry.url && PT_LANGS.has(entry.lang ?? ""))
    .map((entry, index) => ({
      fileId: Buffer.from(entry.url ?? "").toString("base64url"),
      language: entry.lang === "pob" ? "Português (BR)" : "Português",
      release: `Opção ${index + 1}`,
      downloads: 0
    }));

  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(results));
}

async function handleSubtitleDownload(requestUrl, res) {
  const fileId = requestUrl.searchParams.get("fileId");
  if (!fileId) {
    sendText(res, 400, "Missing fileId.");
    return;
  }

  const link = Buffer.from(fileId, "base64url").toString("utf-8");
  if (!/^https?:\/\//.test(link)) {
    sendText(res, 400, "Invalid subtitle reference.");
    return;
  }

  const fileResponse = await fetch(link, { headers: { "User-Agent": SUBTITLE_UA } });
  let bytes = Buffer.from(await fileResponse.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    bytes = Buffer.from(gunzipSync(bytes));
  }

  res.statusCode = 200;
  res.setHeader("content-type", "text/vtt; charset=utf-8");
  res.end(srtToVtt(decodeSubtitle(bytes)));
}

// ------------------------------------------------------------- static (SPA)

function serveStatic(pathname, res) {
  const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(DIST_DIR, safePath);

  if (!filePath.startsWith(DIST_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, "index.html"); // fallback SPA (React Router)
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found.");
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", MIME[path.extname(filePath)] ?? "application/octet-stream");
    res.end(data);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, "http://127.0.0.1");

      if (requestUrl.pathname.startsWith("/api/xtream")) {
        await handleXtream(requestUrl, res);
        return;
      }
      if (requestUrl.pathname === "/api/subtitles/file") {
        await handleSubtitleDownload(requestUrl, res);
        return;
      }
      if (requestUrl.pathname.startsWith("/api/subtitles")) {
        await handleSubtitleSearch(requestUrl, res);
        return;
      }

      serveStatic(requestUrl.pathname, res);
    } catch (error) {
      sendText(res, 502, error instanceof Error ? error.message : "Internal error.");
    }
  });
}

// Sobe o servidor numa porta livre (127.0.0.1) e devolve a porta escolhida.
function start() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

module.exports = { start };
