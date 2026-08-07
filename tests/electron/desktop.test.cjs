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
    if (request.url === "/missing.mkv") {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("missing");
      return;
    }
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
      const startAndWait = async (candidates, options) => {
        let transcode;
        const ready = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("transcode state timeout")), 30000);
          const unsubscribe = bridge.media.onState((state) => {
            if (!transcode || state.id !== transcode.id) return;
            if (state.status === "ready") {
              clearTimeout(timeout);
              unsubscribe();
              resolve(state);
            } else if (state.status === "error") {
              clearTimeout(timeout);
              unsubscribe();
              reject(new Error(state.error));
            }
          });
        });
        transcode = await bridge.media.startTranscode(candidates, options);
        return { transcode, state: await ready };
      };
      const live = await startAndWait([url.replace("episode.m3u8", "episode.mkv")], { live: true });
      await bridge.media.preparePlayback();
      const releasedLiveStatus = await fetch(live.transcode.url).then((response) => response.status);
      const vod = await startAndWait([
        url.replace("episode.m3u8", "missing.mkv"),
        url.replace("episode.m3u8", "episode.mkv")
      ]);
      return {
        hasMedia: Boolean(bridge?.media?.probeStream && bridge?.media?.preparePlayback && bridge?.media?.startTranscode),
        probe: await bridge?.media?.probeStream([url]),
        live,
        releasedLiveStatus,
        transcode: vod.transcode,
        state: vod.state
      };
    }, `http://127.0.0.1:${port}/episode.m3u8`);
    assert.equal(result.hasMedia, true);
    assert.equal(result.probe.status, "available");
    assert.equal(result.probe.format, "m3u8");
    assert.equal(result.live.transcode.mode, "transcoding");
    assert.equal(result.releasedLiveStatus, 404);
    assert.equal(result.transcode.mode, "transcoding");
    assert.equal(result.state.candidateIndex, 1);
    const playlist = await window.evaluate(async (url) => (await fetch(url)).text(), result.transcode.url);
    assert.match(playlist, /^#EXTM3U/m);
    await window.evaluate(() => window.serverXtreme.media.preparePlayback());
    const releasedStatus = await window.evaluate(async (url) => (await fetch(url)).status, result.transcode.url);
    assert.equal(releasedStatus, 404);
  } finally {
    await application.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("desktop plays a 24h live channel without probing before playback", { timeout: 90000 }, async () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "play-tv-electron-live-"));
  const hlsDirectory = path.join(temporaryDirectory, "hls");
  fs.mkdirSync(hlsDirectory, { recursive: true });
  execFileSync(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc=size=320x180:rate=24:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=660:duration=4",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k", "-shortest",
    "-f", "hls", "-hls_time", "1", "-hls_list_size", "0",
    "-hls_segment_filename", path.join(hlsDirectory, "segment-%03d.ts"),
    path.join(hlsDirectory, "index.m3u8")
  ], { windowsHide: true });

  const server = http.createServer((request, response) => {
    const requestPath = request.url === "/" ? "/index.m3u8" : request.url;
    const filePath = path.join(hlsDirectory, path.basename(requestPath));
    if (!fs.existsSync(filePath)) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("missing");
      return;
    }
    response.writeHead(200, {
      "content-type": requestPath.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t"
    });
    fs.createReadStream(filePath).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const streamUrl = `http://127.0.0.1:${port}/index.m3u8`;
  const profile = path.join(temporaryDirectory, "profile");
  const application = await electron.launch({
    args: [path.resolve(__dirname, "..", ".."), `--user-data-dir=${profile}`],
    env: { ...process.env, NODE_ENV: "test", PLAY_TV_E2E: "1" }
  });

  try {
    const window = await application.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await window.addInitScript(() => {
      window.__probeCalls = 0;
      const patchProbe = () => {
        const bridge = window.serverXtreme;
        if (!bridge?.media?.probeStream || bridge.media.__probePatched) return;
        const originalProbe = bridge.media.probeStream;
        bridge.media.probeStream = (...args) => {
          window.__probeCalls += 1;
          return originalProbe(...args);
        };
        bridge.media.__probePatched = true;
      };
      patchProbe();
      setTimeout(patchProbe, 0);
    });
    await window.evaluate((url) => {
      const liveChannel = {
        id: "live-24h-local",
        providerId: "local-24h",
        source: "xtream",
        title: "24H Local Validation",
        type: "channel",
        description: "Local 24h validation channel.",
        genres: ["24H - Test"],
        categories: ["Live TV", "24H - Test"],
        providerCategoryId: "24h-test",
        quality: ["HD"],
        backdropTone: "from-slate-900 to-black",
        posterTone: "from-slate-800 to-black",
        streamUrl: url,
        streamCandidates: [url, url.replace(".m3u8", ".ts")],
        channelNumber: 24,
        currentProgram: "Live now",
        nextProgram: "Up next",
        addedAt: new Date().toISOString()
      };
      window.localStorage.setItem("server-xtreme-library", JSON.stringify({
        state: {
          catalog: [liveChannel],
          catalogSource: "mock",
          favorites: [],
          playback: {},
          watched: {},
          profiles: [{ id: "profile-live", name: "Live", avatarColor: "from-blue-500 to-cyan-500", createdAt: new Date().toISOString() }],
          activeProfileId: "profile-live",
          profileData: {
            "profile-live": { favorites: [], playback: {}, watched: {} }
          },
          sessionName: "Live Validation",
          rememberConnection: false,
          serverAccounts: {},
          activeAccountKey: null,
          streamHealth: {}
        },
        version: 2
      }));
    }, streamUrl);
    await window.goto("app://server-xtreme/watch/live-24h-local", { waitUntil: "domcontentloaded" });
    const video = window.locator("video");
    await video.waitFor({ state: "attached", timeout: 10000 });
    await video.evaluate((element) => element.play().catch(() => undefined));
    await window.waitForFunction(() => {
      const element = document.querySelector("video");
      return Boolean(element && element.currentTime > 0.25 && element.readyState >= 2);
    }, undefined, { timeout: 30000 });
    const playback = await video.evaluate((element) => ({ currentTime: element.currentTime, readyState: element.readyState }));
    assert.ok(playback.currentTime > 0.25);
    assert.ok(playback.readyState >= 2);
    const probeCalls = await window.evaluate(() => window.__probeCalls);
    assert.equal(probeCalls, 0);
  } finally {
    await application.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
