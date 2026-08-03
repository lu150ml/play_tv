const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
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
