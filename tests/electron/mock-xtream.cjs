// Servidor Xtream Codes falso para os testes de fluxo do Play TV X. Responde ao
// player_api.php com um catalogo pequeno e serve videos gerados pelo ffmpeg.
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ffmpegPath = require("ffmpeg-static");

const USERNAME = "lab";
const PASSWORD = "lab123";

const catalog = {
  live: {
    categories: [{ category_id: "1", category_name: "Noticias Lab" }],
    items: [{ stream_id: 101, name: "Canal Teste Lab", category_id: "1", num: 1 }]
  },
  vod: {
    categories: [{ category_id: "10", category_name: "Acao Lab" }],
    items: [{ stream_id: 201, name: "Filme Teste Lab", category_id: "10", container_extension: "mp4", year: "2024" }]
  },
  series: {
    categories: [{ category_id: "20", category_name: "Drama Lab" }],
    items: [{ series_id: 301, name: "Serie Teste Lab", category_id: "20", year: "2023" }]
  }
};

function makeVideo(directory, name, seconds) {
  const target = path.join(directory, name);
  execFileSync(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `testsrc=size=320x180:rate=24:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=520:duration=${seconds}`,
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k", "-shortest",
    ...(name.endsWith(".ts") ? ["-f", "mpegts"] : ["-movflags", "+faststart"]),
    target
  ], { windowsHide: true });
  return fs.readFileSync(target);
}

function filterByCategory(items, categoryId) {
  return categoryId ? items.filter((item) => item.category_id === categoryId) : items;
}

async function startMockXtream() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "play-tv-mock-xtream-"));
  const mp4 = makeVideo(directory, "clip.mp4", 8);
  const ts = makeVideo(directory, "clip.ts", 8);
  const requests = [];

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    requests.push(url.pathname + (url.searchParams.get("action") ? `?action=${url.searchParams.get("action")}` : ""));
    const json = (status, value) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };

    if (url.pathname === "/player_api.php") {
      const valid = url.searchParams.get("username") === USERNAME && url.searchParams.get("password") === PASSWORD;
      if (!valid) return json(200, { user_info: { auth: 0, message: "Usuario ou senha invalidos." } });
      const categoryId = url.searchParams.get("category_id");
      switch (url.searchParams.get("action")) {
        case null:
          return json(200, {
            user_info: { auth: 1, username: USERNAME, status: "Active", exp_date: "1893456000", max_connections: "1" },
            server_info: { url: "127.0.0.1", port: String(server.address().port) }
          });
        case "get_live_categories": return json(200, catalog.live.categories);
        case "get_live_streams": return json(200, filterByCategory(catalog.live.items, categoryId));
        case "get_vod_categories": return json(200, catalog.vod.categories);
        case "get_vod_streams": return json(200, filterByCategory(catalog.vod.items, categoryId));
        case "get_series_categories": return json(200, catalog.series.categories);
        case "get_series": return json(200, filterByCategory(catalog.series.items, categoryId));
        case "get_vod_info":
          return json(200, {
            info: { plot: "Filme gerado para o Test Lab.", genre: "Acao", director: "Lab", duration_secs: 8, year: "2024" },
            movie_data: { stream_id: 201, container_extension: "mp4" }
          });
        case "get_series_info":
          return json(200, {
            info: {},
            episodes: {
              1: [
                { id: "401", episode_num: 1, title: "Episodio Um", container_extension: "mp4", info: { duration_secs: 8 } },
                { id: "402", episode_num: 2, title: "Episodio Dois", container_extension: "mp4", info: { duration_secs: 8 } }
              ]
            }
          });
        default: return json(200, []);
      }
    }

    const media = url.pathname.match(/^\/(live|movie|series)\/[^/]+\/[^/]+\/\d+\.(\w+)$/);
    if (media) {
      const bytes = media[2] === "ts" || media[2] === "m3u8" ? ts : media[2] === "mp4" ? mp4 : undefined;
      if (!bytes) {
        response.writeHead(404, { "content-type": "text/plain" });
        return response.end("missing");
      }
      response.writeHead(200, {
        "content-type": bytes === ts ? "video/mp2t" : "video/mp4",
        "content-length": bytes.length,
        "accept-ranges": "none"
      });
      return response.end(bytes);
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("missing");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    username: USERNAME,
    password: PASSWORD,
    catalog,
    requests,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

module.exports = { startMockXtream };
