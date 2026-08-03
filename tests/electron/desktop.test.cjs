const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ffmpegPath = require("ffmpeg-static");
const { _electron: electron } = require("playwright");

test("desktop probes HLS and transcodes an incompatible episode through Electron", { timeout: 90000 }, async () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "play-tv-electron-e2e-"));
  const episodePath = path.join(temporaryDirectory, "episode.mkv");
  execFileSync(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=2",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
    "-c:v", "mpeg4", "-c:a", "mp3", "-shortest", episodePath
  ], { windowsHide: true });
  const episodeBytes = fs.readFileSync(episodePath);
  const server = http.createServer((request, response) => {
    if (request.url === "/episode.mkv") {
      response.writeHead(200, { "content-type": "video/x-matroska", "content-length": episodeBytes.length });
      response.end(episodeBytes);
      return;
    }
    response.writeHead(200, { "content-type": "application/vnd.apple.mpegurl" });
    response.end("#EXTM3U\n#EXT-X-VERSION:3\n");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const application = await electron.launch({
    args: [path.resolve(__dirname, "..", ".."), `--user-data-dir=${path.join(temporaryDirectory, "profile")}`],
    env: { ...process.env, NODE_ENV: "test", PLAY_TV_E2E: "1" }
  });
  try {
    const window = await application.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    const result = await window.evaluate(async (url) => {
      const bridge = window.serverXtreme;
      return {
        hasMedia: Boolean(bridge?.media?.probeStream && bridge?.media?.startTranscode),
        probe: await bridge?.media?.probeStream([url]),
        transcode: await bridge?.media?.startTranscode(url.replace("episode.m3u8", "episode.mkv"))
      };
    }, `http://127.0.0.1:${port}/episode.m3u8`);
    assert.equal(result.hasMedia, true);
    assert.equal(result.probe.status, "available");
    assert.equal(result.probe.format, "m3u8");
    assert.equal(result.transcode.mode, "transcoding");
    const playlist = await window.evaluate(async (url) => (await fetch(url)).text(), result.transcode.url);
    assert.match(playlist, /^#EXTM3U/m);
    await window.evaluate((id) => window.serverXtreme.media.stopTranscode(id), result.transcode.id);
  } finally {
    await application.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
