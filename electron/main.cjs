const { app, BrowserWindow, shell } = require("electron");
const { start } = require("./server.cjs");

let mainWindow = null;

async function createWindow() {
  const port = await start();

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
      nodeIntegration: false
    }
  });

  // Links externos (ajuda, etc.) abrem no navegador padrão, não na janela.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
