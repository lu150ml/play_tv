import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { gunzipSync } from "node:zlib";
import type { Plugin, ViteDevServer } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), xtreamProxyPlugin(), subtitleProxyPlugin()],
  build: {
    chunkSizeWarningLimit: 850
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"]
  }
});

function xtreamProxyPlugin(): Plugin {
  return {
    name: "server-xtreme-xtream-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        (request: IncomingMessage, response: ServerResponse, next: () => void) => {
          void handleXtreamProxyRequest(request, response, next);
        }
      );
    }
  };
}

async function handleXtreamProxyRequest(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void
) {
  if (!request.url?.startsWith("/api/xtream")) {
    next();
    return;
  }

  try {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const serverUrl = requestUrl.searchParams.get("serverUrl");
    const username = requestUrl.searchParams.get("username");
    const password = requestUrl.searchParams.get("password");
    const action = requestUrl.searchParams.get("action");

    if (!serverUrl || !username || !password) {
      sendText(response, 400, "Missing serverUrl, username, or password.");
      return;
    }

    const target = buildXtreamTargetUrl(serverUrl);
    target.searchParams.set("username", username);
    target.searchParams.set("password", password);

    if (action) {
      target.searchParams.set("action", action);
    }

    for (const [key, value] of requestUrl.searchParams.entries()) {
      if (!["serverUrl", "username", "password", "action"].includes(key)) {
        target.searchParams.set(key, value);
      }
    }

    const upstream = await fetch(target);
    const body = await upstream.text();

    response.statusCode = upstream.status;
    response.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
    response.end(body);
  } catch (error) {
    sendText(
      response,
      502,
      error instanceof Error ? error.message : "Could not connect to the Xtream server."
    );
  }
}

function buildXtreamTargetUrl(serverUrl: string): URL {
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

function sendText(response: ServerResponse, status: number, text: string) {
  response.statusCode = status;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end(text);
}

// --- Legendas (estilo Stremio: sem API key) --------------------------------
//
// Provedores não liberam CORS, então tudo passa por aqui (server-side), igual
// ao proxy do Xtream. Em vez de exigir uma API key do OpenSubtitles, usamos a
// mesma abordagem do Stremio, com serviços públicos e gratuitos:
//   1. Cinemeta resolve título+ano -> IMDb ID (tt...)
//   2. O addon OpenSubtitles v3 lista as legendas por IMDb ID
//   3. Baixamos o .srt/.gz, descompactamos, convertemos para VTT e corrigimos
//      o encoding.
// O catálogo Xtream não tem IMDb ID; por isso o passo 1. Como o Cinemeta é
// baseado no IMDb, o casamento por título pode falhar em conteúdos nacionais
// obscuros — mesma limitação do Stremio.

const CINEMETA_BASE = "https://v3-cinemeta.strem.io";
const OPENSUBS_ADDON_BASE = "https://opensubtitles-v3.strem.io";
const SUBTITLE_UA = "ServerXtreme/0.1";
// Códigos ISO 639-2 de português usados pelo addon.
const PT_LANGS = new Set(["por", "pob"]);

function subtitleProxyPlugin(): Plugin {
  return {
    name: "server-xtreme-subtitle-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        (request: IncomingMessage, response: ServerResponse, next: () => void) => {
          void handleSubtitleRequest(request, response, next);
        }
      );
    }
  };
}

async function handleSubtitleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void
) {
  if (!request.url?.startsWith("/api/subtitles")) {
    next();
    return;
  }

  const requestUrl = new URL(request.url, "http://127.0.0.1");

  try {
    if (requestUrl.pathname === "/api/subtitles/file") {
      await handleSubtitleDownload(requestUrl, response);
      return;
    }

    await handleSubtitleSearch(requestUrl, response);
  } catch (error) {
    sendText(
      response,
      502,
      error instanceof Error ? error.message : "Falha ao consultar o provedor de legendas."
    );
  }
}

// Resolve um título (e ano opcional) para um IMDb ID via Cinemeta.
async function resolveImdbId(query: string, kind: "movie" | "series"): Promise<string | undefined> {
  const target = `${CINEMETA_BASE}/catalog/${kind}/top/search=${encodeURIComponent(query)}.json`;
  const upstream = await fetch(target, { headers: { "User-Agent": SUBTITLE_UA } });

  if (!upstream.ok) {
    return undefined;
  }

  const payload = (await upstream.json()) as { metas?: Array<{ id?: string }> };
  return payload.metas?.[0]?.id;
}

async function handleSubtitleSearch(requestUrl: URL, response: ServerResponse) {
  const query = requestUrl.searchParams.get("query");

  if (!query) {
    sendText(response, 400, "Missing query.");
    return;
  }

  const season = requestUrl.searchParams.get("season");
  const episode = requestUrl.searchParams.get("episode");
  const isSeries = Boolean(season && episode);

  const imdbId = await resolveImdbId(query, isSeries ? "series" : "movie");

  if (!imdbId) {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify([]));
    return;
  }

  // Para séries o addon usa o formato tt123:temporada:episodio.
  const videoId = isSeries ? `${imdbId}:${season}:${episode}` : imdbId;
  const addonUrl = `${OPENSUBS_ADDON_BASE}/subtitles/${isSeries ? "series" : "movie"}/${videoId}.json`;
  const upstream = await fetch(addonUrl, { headers: { "User-Agent": SUBTITLE_UA } });

  if (!upstream.ok) {
    sendText(response, upstream.status, await upstream.text());
    return;
  }

  const payload = (await upstream.json()) as {
    subtitles?: Array<{ id?: string; url?: string; lang?: string; SubFormat?: string }>;
  };

  const results = (payload.subtitles ?? [])
    .filter((entry) => entry.url && PT_LANGS.has(entry.lang ?? ""))
    .map((entry, index) => ({
      // fileId carrega a própria URL da legenda (codificada) para o download.
      fileId: Buffer.from(entry.url ?? "").toString("base64url"),
      language: entry.lang === "pob" ? "Português (BR)" : "Português",
      release: `Opção ${index + 1}`,
      downloads: 0
    }));

  response.statusCode = 200;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(results));
}

async function handleSubtitleDownload(requestUrl: URL, response: ServerResponse) {
  const fileId = requestUrl.searchParams.get("fileId");

  if (!fileId) {
    sendText(response, 400, "Missing fileId.");
    return;
  }

  const link = Buffer.from(fileId, "base64url").toString("utf-8");

  if (!/^https?:\/\//.test(link)) {
    sendText(response, 400, "Invalid subtitle reference.");
    return;
  }

  const fileResponse = await fetch(link, { headers: { "User-Agent": SUBTITLE_UA } });
  let bytes = Buffer.from(await fileResponse.arrayBuffer());

  // Alguns links entregam .gz (magic bytes 1f 8b).
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    bytes = Buffer.from(gunzipSync(bytes));
  }

  const srt = decodeSubtitle(bytes);

  response.statusCode = 200;
  response.setHeader("content-type", "text/vtt; charset=utf-8");
  response.end(srtToVtt(srt));
}

// Legendas em PT costumam vir em Latin-1; tenta UTF-8 e cai para Latin-1 se
// aparecerem muitos caracteres de substituição.
function decodeSubtitle(bytes: Buffer): string {
  const utf8 = bytes.toString("utf-8");
  const replacementCount = (utf8.match(/�/g) ?? []).length;
  return replacementCount > 3 ? bytes.toString("latin1") : utf8;
}

function srtToVtt(srt: string): string {
  const body = srt
    .replace(/\r+/g, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body}`;
}
