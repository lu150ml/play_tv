const test = require("node:test");
const assert = require("node:assert/strict");
const { planReset, buildCleanupScript, runReset, isSafeUserDataDir } = require("./app-reset.cjs");

const fakeApp = (overrides = {}) => ({
  isPackaged: true,
  getName: () => "Play TV X",
  getPath: (name) => ({ userData: "C:\\Users\\Ana\\AppData\\Roaming\\Play TV X", exe: "C:\\Users\\Ana\\AppData\\Local\\Programs\\Play TV X\\Play TV X.exe" })[name],
  ...overrides
});

test("version installed by the installer uninstalls after wiping data", () => {
  const plan = planReset({ app: fakeApp(), env: {}, exists: () => true, platform: "win32", home: "C:\\Users\\Ana" });
  assert.equal(plan.mode, "uninstall");
  assert.equal(plan.canDeleteFolder, true);
  assert.match(buildCleanupScript(plan), /rmdir \/s \/q "C:\\Users\\Ana\\AppData\\Roaming\\Play TV X"/);
  assert.match(buildCleanupScript(plan), /start "" ".*Uninstall Play TV X\.exe"/);
});

test("portable version wipes data and reopens itself clean", () => {
  const plan = planReset({ app: fakeApp(), env: { PORTABLE_EXECUTABLE_FILE: "D:\\Apps\\Play-TV-X-0.4.23-portable.exe" }, exists: () => false, platform: "win32", home: "C:\\Users\\Ana" });
  assert.equal(plan.mode, "reset");
  assert.match(buildCleanupScript(plan), /start "" "D:\\Apps\\Play-TV-X-0\.4\.23-portable\.exe"/);
  assert.doesNotMatch(buildCleanupScript(plan), /Uninstall/);
});

test("refuses to delete shallow or home folders", () => {
  assert.equal(isSafeUserDataDir("C:\\", "C:\\Users\\Ana"), false);
  assert.equal(isSafeUserDataDir("C:\\Users", "C:\\Users\\Ana"), false);
  assert.equal(isSafeUserDataDir("C:\\Users\\Ana", "C:\\Users\\Ana"), false);
  assert.equal(isSafeUserDataDir("C:\\Users\\Ana\\AppData\\Roaming\\Play TV X", "C:\\Users\\Ana"), true);
  assert.equal(isSafeUserDataDir("C:\\Users\\Ana\\AppData\\Roaming\\Play & TV", "C:\\Users\\Ana"), false);
});

test("an unsafe data folder is never put in the cleanup script", () => {
  const app = fakeApp({ getPath: (name) => ({ userData: "C:\\Users\\Ana", exe: "C:\\App\\Play TV X.exe" })[name] });
  const plan = planReset({ app, env: {}, exists: () => false, platform: "win32", home: "C:\\Users\\Ana" });
  assert.equal(plan.canDeleteFolder, false);
  assert.doesNotMatch(buildCleanupScript(plan), /rmdir/);
});

test("runReset stops work, clears browser storage, schedules cleanup and quits", async () => {
  const calls = [];
  const session = { clearStorageData: async () => calls.push("storage"), clearCache: async () => calls.push("cache") };
  const spawned = [];
  const spawn = (command, args, options) => { spawned.push({ command, args, options }); return { unref: () => calls.push("unref") }; };
  const plan = planReset({ app: fakeApp(), env: {}, exists: () => true, platform: "win32", home: "C:\\Users\\Ana" });
  await runReset({ plan, session, stopWork: async () => calls.push("stop"), spawn, quit: () => calls.push("quit") });
  assert.deepEqual(calls.filter((entry) => entry !== "unref"), ["stop", "storage", "cache", "quit"]);
  if (process.platform === "win32") {
    assert.equal(spawned.length, 1);
    assert.equal(spawned[0].command, "cmd.exe");
    assert.equal(spawned[0].options.detached, true);
  }
});

test("runReset still quits when clearing browser storage fails", async () => {
  let quit = false;
  const session = { clearStorageData: async () => { throw new Error("busy"); }, clearCache: async () => {} };
  const plan = planReset({ app: fakeApp(), env: {}, exists: () => false, platform: "win32", home: "C:\\Users\\Ana" });
  await runReset({ plan, session, spawn: () => ({ unref() {} }), quit: () => { quit = true; } });
  assert.equal(quit, true);
});
