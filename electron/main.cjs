const path = require("node:path");
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  safeStorage,
  shell
} = require("electron");
const { autoUpdater } = require("electron-updater");
const { handleProtocolRequest } = require("./server.cjs");
const { DownloadManager } = require("./download-manager.cjs");
const { setupUpdater } = require("./updater.cjs");
const { MediaManager } = require("./media-manager.cjs");
const bundledFfmpegPath = require("ffmpeg-static");
const ffmpegPath = app?.isPackaged
  ? bundledFfmpegPath.replace("app.asar", "app.asar.unpacked")
  : bundledFfmpegPath;

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
]);

let mainWindow = null;
let downloadManager;
let updater;
let mediaManager;
const gotLock = process.env.PLAY_TV_E2E === "1" || app.requestSingleInstanceLock();
if (!gotLock) app.quit();

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#141414",
    autoHideMenuBar: true,
    title: "Play TV X",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://server-xtreme/")) {
      event.preventDefault();
      if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    }
  });

  await mainWindow.loadURL("app://server-xtreme/");
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const emit = (channel, payload) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload);
  };
  downloadManager = new DownloadManager({
    app,
    dialog,
    shell,
    safeStorage,
    fetch: (url, options) => net.fetch(url, { ...options, redirect: "follow" }),
    emit: (snapshot) => emit("downloads:state", snapshot)
  });
  updater = setupUpdater({ app, autoUpdater, emit: (state) => emit("updates:state", state) });
  mediaManager = new MediaManager({ app, net, ffmpegPath, emit: (state) => emit("media:state", state) });
  protocol.handle("app", async (request) => {
    const downloadResponse = downloadManager.handleProtocolRequest(request);
    if (downloadResponse) return downloadResponse;
    const mediaResponse = await mediaManager.handleProtocolRequest(request);
    return mediaResponse ?? handleProtocolRequest(request);
  });
  ipcMain.handle("credentials:save", (_event, value) => {
    if (!safeStorage.isEncryptionAvailable()) return false;
    const encrypted = safeStorage.encryptString(String(value));
    require("node:fs").writeFileSync(
      path.join(app.getPath("userData"), "credentials.bin"),
      encrypted
    );
    return true;
  });
  ipcMain.handle("credentials:load", () => {
    try {
      return safeStorage.decryptString(
        require("node:fs").readFileSync(path.join(app.getPath("userData"), "credentials.bin"))
      );
    } catch {
      return undefined;
    }
  });
  ipcMain.handle("credentials:clear", () => {
    try {
      require("node:fs").unlinkSync(path.join(app.getPath("userData"), "credentials.bin"));
    } catch {
      // The credential file may not exist yet.
    }
  });
  ipcMain.handle("updates:get-state", () => updater.getState());
  ipcMain.handle("updates:check", () => updater.check());
  ipcMain.handle("updates:install", () => updater.install());
  ipcMain.handle("downloads:get-state", () => downloadManager.snapshot());
  ipcMain.handle("downloads:choose-directory", () => downloadManager.chooseDirectory(mainWindow));
  ipcMain.handle("downloads:enqueue", (_event, input) => downloadManager.enqueue(input));
  ipcMain.handle("downloads:pause", (_event, id) => downloadManager.pause(id));
  ipcMain.handle("downloads:resume", (_event, id) => downloadManager.resume(id));
  ipcMain.handle("downloads:cancel", (_event, id) => downloadManager.cancel(id));
  ipcMain.handle("downloads:remove", (_event, id) => downloadManager.remove(id));
  ipcMain.handle("downloads:open", (_event, id) => downloadManager.open(id));
  ipcMain.handle("downloads:open-directory", () => downloadManager.openDirectory());
  ipcMain.handle("media:register-image", (_event, url) => mediaManager.registerImage(url));
  ipcMain.handle("media:probe-stream", (_event, candidates) => mediaManager.probeStream(candidates));
  ipcMain.handle("media:prepare-playback", () => mediaManager.stopAll());
  ipcMain.handle("media:start-transcode", (_event, candidates, options) => mediaManager.startTranscode(candidates, options));
  ipcMain.handle("media:stop-transcode", (_event, id) => mediaManager.stopTranscode(id));
  await createWindow();
  if (app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE) {
    setTimeout(() => void updater.check(), 5000);
  }
});

app.on("second-instance", () => {
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.focus();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => { void mediaManager?.stopAll(); });

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
