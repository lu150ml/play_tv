const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DownloadManager, sanitizeFilename } = require("./download-manager.cjs");

test("sanitizes Windows download filenames", () => {
  assert.equal(sanitizeFilename('Serie: S01/E01?*'), "Serie_ S01_E01__");
});

test("download snapshots do not expose credentials or filesystem paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "server-xtreme-download-test-"));
  try {
    const manager = new DownloadManager({
      app: { getPath: (name) => name === "userData" ? root : path.join(root, "media") },
      dialog: {}, shell: {}, safeStorage: { isEncryptionAvailable: () => false }, emit: () => {}
    });
    manager.jobs.set("job", {
      id: "job", contentId: "movie", title: "Movie", url: "https://user:secret@example.test/movie.mp4",
      finalPath: path.join(root, "movie.mp4"), partPath: path.join(root, "movie.mp4.part"),
      status: "paused", receivedBytes: 2, createdAt: new Date().toISOString()
    });
    const serialized = JSON.stringify(manager.snapshot());
    assert.equal(serialized.includes("secret"), false);
    assert.equal(serialized.includes("finalPath"), false);
    assert.equal(serialized.includes("partPath"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
