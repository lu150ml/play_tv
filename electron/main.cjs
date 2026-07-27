const path = require("node:path");
const { app, BrowserWindow, ipcMain, protocol, safeStorage, shell } = require("electron");
const { handleProtocolRequest } = require("./server.cjs");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
]);

let mainWindow = null;
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#141414",
    autoHideMenuBar: true,
    title: "Server Xtreme",
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
  protocol.handle("app", (request) => handleProtocolRequest(request));
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
  await createWindow();
});

app.on("second-instance", () => {
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.focus();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
