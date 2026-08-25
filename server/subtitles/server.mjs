import { createServer } from "node:http";

const OPEN_SUBTITLES_BASE = "https://api.opensubtitles.com/api/v1";
const USER_AGENT = "PlayTV/1.0";
const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.OPENSUBTITLES_API_KEY || "";
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "http://localhost:5173,https://localhost,http://localhost")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const cache = new Map();
const rateLimits = new Map();

const server = createServer(async (request, response) => {
  setSecurityHeaders(request, response);
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  if (!allowRequest(request)) {
    sendJson(response, 429, { error: "Muitas solicitações. Tente novamente em um minuto." });
    return;
  }

  const requestUrl = new URL(request.url || "/", "http://localhost");
  try {
    if (requestUrl.pathname === "/health") {
      sendJson(response, 200, { status: "ok", subtitlesConfigured: Boolean(API_KEY) });
      return;
    }
    if (!API_KEY) {
      sendJson(response, 503, { error: "Legendas externas não configuradas." });
      return;
    }
    if (requestUrl.pathname === "/api/subtitles") {
      await searchSubtitles(requestUrl, response);
      return;
    }
    if (requestUrl.pathname === "/api/subtitles/file") {
      await downloadSubtitle(requestUrl, response);
      return;
    }
    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 502;
    sendJson(response, status, {
      error: status === 502 ? "O provedor de legendas está temporariamente indisponível." : error.message
    });
  }
});

async function searchSubtitles(requestUrl, response) {
  const query = cleanText(requestUrl.searchParams.get("query"), 160);
  const language = cleanText(requestUrl.searchParams.get("language") || "pt-BR,pt", 30);
  const season = optionalInteger(requestUrl.searchParams.get("season"), 1, 999);
  const episode = optionalInteger(requestUrl.searchParams.get("episode"), 1, 9999);
  if (!query) throw new HttpError(400, "Informe um título para buscar legendas.");

  const cacheKey = `search:${query}:${language}:${season || ""}:${episode || ""}`;
  const cached = getCache(cacheKey);
  if (cached) {
    sendJson(response, 200, cached);
    return;
  }

  const target = new URL(`${OPEN_SUBTITLES_BASE}/subtitles`);
  target.searchParams.set("query", query);
  target.searchParams.set("languages", language);
  if (season) target.searchParams.set("season_number", String(season));
  if (episode) target.searchParams.set("episode_number", String(episode));

  const payload = await fetchJson(target, { "Api-Key": API_KEY, "User-Agent": USER_AGENT }, 1_000_000);
  const results = (payload.data || []).slice(0, 20).flatMap((entry) => {
    const attributes = entry.attributes || {};
    const fileId = attributes.files?.[0]?.file_id;
    if (!fileId) return [];
    return [{
      fileId: String(fileId),
      language: cleanText(attributes.language || "?", 20),
      release: cleanText(attributes.release || "Sem nome", 180),
      downloads: Number(attributes.download_count) || 0
    }];
  });
  setCache(cacheKey, results, 5 * 60_000);
  sendJson(response, 200, results);
}

async function downloadSubtitle(requestUrl, response) {
  const fileId = requestUrl.searchParams.get("fileId");
  if (!fileId || !/^\d+$/.test(fileId)) throw new HttpError(400, "Identificador inválido.");
  const cacheKey = `file:${fileId}`;
  const cached = getCache(cacheKey);
  if (cached) {
    sendVtt(response, cached);
    return;
  }

  const linkPayload = await fetchJson(`${OPEN_SUBTITLES_BASE}/download`, {
    "Api-Key": API_KEY,
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
    Accept: "application/json"
  }, 100_000, { method: "POST", body: JSON.stringify({ file_id: Number(fileId) }) });
  if (!linkPayload.link || !/^https:\/\//i.test(linkPayload.link)) {
    throw new HttpError(502, "O provedor não retornou uma legenda válida.");
  }

  const bytes = await fetchBytes(linkPayload.link, { "User-Agent": USER_AGENT }, 2_000_000);
  const srt = decodeSubtitle(bytes);
  const vtt = srtToVtt(srt);
  setCache(cacheKey, vtt, 30 * 60_000);
  sendVtt(response, vtt);
}

async function fetchJson(url, headers, maxBytes, init = {}) {
  const bytes = await fetchBytes(url, headers, maxBytes, init);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(502, "Resposta inválida do provedor.");
  }
}

async function fetchBytes(url, headers, maxBytes, init = {}) {
  const upstream = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(10_000)
  });
  if (!upstream.ok) throw new HttpError(upstream.status, "Falha no provedor de legendas.");
  const declaredSize = Number(upstream.headers.get("content-length") || 0);
  if (declaredSize > maxBytes) throw new HttpError(413, "Resposta muito grande.");
  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new HttpError(413, "Resposta muito grande.");
  return bytes;
}

function decodeSubtitle(bytes) {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const replacements = (utf8.match(/�/g) || []).length;
  return replacements > 3 ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

function srtToVtt(srt) {
  return `WEBVTT\n\n${srt.replace(/\r+/g, "").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, maxLength);
}

function optionalInteger(value, min, max) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new HttpError(400, "Parâmetro numérico inválido.");
  return parsed;
}

function allowRequest(request) {
  const forwarded = request.headers["x-forwarded-for"];
  const ip = String(forwarded || request.socket.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const current = rateLimits.get(ip);
  if (!current || now - current.startedAt >= 60_000) {
    rateLimits.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 60;
}

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCache(key, value, ttl) {
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

function setSecurityHeaders(request, response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "no-store");
  const origin = request.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendVtt(response, value) {
  response.writeHead(200, { "Content-Type": "text/vtt; charset=utf-8" });
  response.end(value);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(`Play TV subtitle service listening on port ${PORT}\n`);
});
