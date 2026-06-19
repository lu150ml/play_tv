import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), xtreamProxyPlugin()],
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
