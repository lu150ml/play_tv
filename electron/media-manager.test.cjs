const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { MediaManager, validateRemoteUrl } = require("./media-manager.cjs");

test("accepts only remote HTTP media URLs", () => {
  assert.equal(validateRemoteUrl("https://example.test/a.jpg"), "https://example.test/a.jpg");
  assert.throws(() => validateRemoteUrl("file:///secret"), /HTTP/);
});

test("image registration returns opaque reusable tokens", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "play-tv-media-"));
  try {
    const manager = new MediaManager({ app: { getPath: () => root }, net: { fetch() {} }, ffmpegPath: "missing" });
    const first = manager.registerImage("https://user:secret@example.test/cover.jpg");
    assert.equal(first, manager.registerImage("https://user:secret@example.test/cover.jpg"));
    assert.equal(first.includes("secret"), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("preflight classifies denied and missing streams", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "play-tv-media-"));
  try {
    const response = (status) => ({ status, ok: false, body: { cancel: async () => {} } });
    const manager = new MediaManager({ app: { getPath: () => root }, net: { fetch: async () => response(403) }, ffmpegPath: "missing" });
    await assert.rejects(() => manager.preflight("https://example.test/video.mkv"), (error) => error.code === "access-denied");
    manager.net.fetch = async () => response(404);
    await assert.rejects(() => manager.preflight("https://example.test/video.mkv"), (error) => error.code === "not-found");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("transcode preflight accepts media without Range and rejects fake HTML", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "play-tv-media-"));
  try {
    const manager = new MediaManager({ app: { getPath: () => root }, net: { fetch: async () => new Response("<html>not video</html>", { status: 200, headers: { "content-type": "text/html" } }) }, ffmpegPath: "missing" });
    await assert.rejects(() => manager.preflight("https://example.test/episode.mp4"), (error) => error.code === "not-media");
    manager.net.fetch = async (_url, options) => {
      assert.equal(options.headers.Range, undefined);
      return new Response(Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70]), { status: 200, headers: { "content-type": "video/mp4" } });
    };
    await manager.preflight("https://example.test/episode.mp4");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("stream probe rejects fake HTML success and accepts real HLS", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "play-tv-media-"));
  try {
    const responses = [
      new Response("<html>offline</html>", { status: 200, headers: { "content-type": "text/html" } }),
      new Response("#EXTM3U\n#EXT-X-VERSION:3", { status: 200, headers: { "content-type": "application/vnd.apple.mpegurl" } })
    ];
    const manager = new MediaManager({ app: { getPath: () => root }, net: { fetch: async () => responses.shift() }, ffmpegPath: "missing" });
    const result = await manager.probeStream(["https://example.test/a.ts", "https://example.test/a.m3u8"]);
    assert.equal(result.status, "available");
    assert.equal(result.candidateIndex, 1);
    assert.equal(result.format, "m3u8");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("transcode selects the first valid candidate and passes only it to ffmpeg", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "play-tv-media-"));
  const states = [];
  let inputUrl;
  try {
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    const manager = new MediaManager({
      app: { getPath: () => root },
      net: {
        fetch: async (url) => url.endsWith("missing.mkv")
          ? new Response("missing", { status: 404 })
          : new Response(Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70]), { status: 200, headers: { "content-type": "video/mp4" } })
      },
      ffmpegPath: process.execPath,
      spawn: (_executable, args) => {
        inputUrl = args[args.indexOf("-i") + 1];
        fs.writeFileSync(args.at(-1), "#EXTM3U\n");
        return child;
      },
      emit: (state) => states.push(state),
      playlistTimeoutMs: 1000
    });
    const session = manager.startTranscode([
      "https://example.test/missing.mkv",
      "https://example.test/working.mp4"
    ]);
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error("ready state timeout")), 1500);
      const poll = setInterval(() => {
        if (states.some((state) => state.status === "ready")) {
          clearTimeout(deadline);
          clearInterval(poll);
          resolve();
        }
      }, 10);
    });
    assert.equal(inputUrl, "https://example.test/working.mp4");
    assert.equal(states.find((state) => state.status === "ready")?.candidateIndex, 1);
    manager.stopTranscode(session.id);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("candidate selection skips HTML and times out a stalled response", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "play-tv-media-"));
  try {
    const manager = new MediaManager({
      app: { getPath: () => root },
      net: {
        fetch: async (url, options) => {
          if (url.endsWith("stalled.mp4")) {
            return new Promise((_resolve, reject) => {
              options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
            });
          }
          return new Response("<html>offline</html>", { status: 200, headers: { "content-type": "text/html" } });
        }
      },
      ffmpegPath: process.execPath,
      preflightTimeoutMs: 20
    });
    await assert.rejects(
      () => manager.selectTranscodeSource(["https://example.test/fake.mp4", "https://example.test/stalled.mp4"], new AbortController().signal),
      (error) => error.code === "timeout"
    );
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("candidate selection reports a definitive error after every source is unavailable", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "play-tv-media-"));
  let calls = 0;
  try {
    const manager = new MediaManager({
      app: { getPath: () => root },
      net: { fetch: async () => { calls += 1; return new Response("missing", { status: 404 }); } },
      ffmpegPath: process.execPath
    });
    await assert.rejects(
      () => manager.selectTranscodeSource(["https://example.test/a.mp4", "https://example.test/b.mkv"], new AbortController().signal),
      (error) => error.code === "not-found"
    );
    assert.equal(calls, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("stopping source selection cancels silently and removes the session", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "play-tv-media-"));
  const states = [];
  try {
    const manager = new MediaManager({
      app: { getPath: () => root },
      net: {
        fetch: async (_url, options) => new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
        })
      },
      ffmpegPath: process.execPath,
      emit: (state) => states.push(state)
    });
    const session = manager.startTranscode(["https://example.test/stalled.mp4"]);
    manager.stopTranscode(session.id);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(manager.transcodes.has(session.id), false);
    assert.equal(states.some((state) => state.status === "error"), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
