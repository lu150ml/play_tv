const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { setupUpdater } = require("./updater.cjs");

test("publishes download progress and installs only when ready", () => {
  const autoUpdater = new EventEmitter();
  let installs = 0;
  autoUpdater.quitAndInstall = () => { installs += 1; };
  const states = [];
  const updater = setupUpdater({
    app: { getVersion: () => "0.3.0", isPackaged: true }, autoUpdater,
    emit: (state) => states.push(state)
  });
  assert.equal(updater.getState().supported, true);
  assert.equal(updater.getState().environment, "installed");
  autoUpdater.emit("download-progress", { percent: 42.4, transferred: 42, total: 100 });
  assert.equal(states.at(-1).percent, 42);
  updater.install();
  assert.equal(installs, 0);
  autoUpdater.emit("update-downloaded", { version: "0.3.1" });
  updater.install();
  assert.equal(installs, 1);
});

test("reports unsupported updater environments", async () => {
  const autoUpdater = new EventEmitter();
  const updater = setupUpdater({
    app: { getVersion: () => "0.3.1", isPackaged: false }, autoUpdater, emit: () => {}
  });
  assert.equal(updater.getState().status, "unsupported");
  assert.equal(updater.getState().supported, false);
  await updater.check();
  assert.equal(updater.getState().lastResult, "not-checked");
});
