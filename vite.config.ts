import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), xtreamProxyPlugin(), subtitleProxyPlugin()],
  cacheDir: "/tmp/vite-play-tv",
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

// --- Legendas (OpenSubtitles REST API) -------------------------------------
//
// Provedores de legenda não liberam CORS, então o download passa por aqui
// (server-side), igual ao proxy do Xtream. Requer uma API key gratuita do
// OpenSubtitles em OPENSUBTITLES_API_KEY (https://www.opensubtitles.com/consumers).

const OPENSUBTITLES_BASE = "https://api.opensubtitles.com/api/v1";
const OPENSUBTITLES_UA = "ServerXtreme/0.1";

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

  const apiKey = process.env.OPENSUBTITLES_API_KEY;

  if (!apiKey) {
    sendText(
      response,
      503,
      "Legendas indisponiveis: defina OPENSUBTITLES_API_KEY no ambiente do servidor."
    );
    return;
  }

  const requestUrl = new URL(request.url, "http://127.0.0.1");

  try {
    if (requestUrl.pathname === "/api/subtitles/file") {
      await handleSubtitleDownload(requestUrl, response, apiKey);
      return;
    }

    await handleSubtitleSearch(requestUrl, response, apiKey);
  } catch (error) {
    sendText(
      response,
      502,
      error instanceof Error ? error.message : "Falha ao consultar o provedor de legendas."
    );
  }
}

async function handleSubtitleSearch(requestUrl: URL, response: ServerResponse, apiKey: string) {
  const query = requestUrl.searchParams.get("query");

  if (!query) {
    sendText(response, 400, "Missing query.");
    return;
  }

  const target = new URL(`${OPENSUBTITLES_BASE}/subtitles`);
  target.searchParams.set("query", query);
  target.searchParams.set(
    "languages",
    requestUrl.searchParams.get("language") ?? "pt-BR,pt"
  );

  const season = requestUrl.searchParams.get("season");
  const episode = requestUrl.searchParams.get("episode");
  if (season) target.searchParams.set("season_number", season);
  if (episode) target.searchParams.set("episode_number", episode);

  const upstream = await fetch(target, {
    headers: { "Api-Key": apiKey, "User-Agent": OPENSUBTITLES_UA }
  });

  if (!upstream.ok) {
    sendText(response, upstream.status, await upstream.text());
    return;
  }

  const payload = (await upstream.json()) as {
    data?: Array<{
      attributes?: {
        language?: string;
        release?: string;
        download_count?: number;
        files?: Array<{ file_id?: number }>;
      };
    }>;
  };

  const results = (payload.data ?? [])
    .map((entry) => ({
      fileId: String(entry.attributes?.files?.[0]?.file_id ?? ""),
      language: entry.attributes?.language ?? "?",
      release: entry.attributes?.release ?? "Sem nome",
      downloads: entry.attributes?.download_count ?? 0
    }))
    .filter((entry) => entry.fileId.length > 0);

  response.statusCode = 200;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(results));
}

async function handleSubtitleDownload(requestUrl: URL, response: ServerResponse, apiKey: string) {
  const fileId = requestUrl.searchParams.get("fileId");

  if (!fileId) {
    sendText(response, 400, "Missing fileId.");
    return;
  }

  const linkResponse = await fetch(`${OPENSUBTITLES_BASE}/download`, {
    method: "POST",
    headers: {
      "Api-Key": apiKey,
      "User-Agent": OPENSUBTITLES_UA,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ file_id: Number(fileId) })
  });

  if (!linkResponse.ok) {
    sendText(response, linkResponse.status, await linkResponse.text());
    return;
  }

  const { link } = (await linkResponse.json()) as { link?: string };

  if (!link) {
    sendText(response, 502, "Provedor nao retornou link de download.");
    return;
  }

  const fileResponse = await fetch(link, { headers: { "User-Agent": OPENSUBTITLES_UA } });
  const bytes = Buffer.from(await fileResponse.arrayBuffer());
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
