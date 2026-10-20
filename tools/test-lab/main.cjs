// Janela do Test Lab: escolhe suites, roda, mostra a saida ao vivo, guarda
// historico e (opcional) roda os testes rapidos sozinho ao salvar arquivos.
const { app, BrowserWindow, ipcMain, shell, Notification } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { Runner, suites, ROOT } = require("./runner.cjs");
const { saveReport } = require("./report.cjs");

app.setName("Play TV X Test Lab");
const HISTORY_LIMIT = 30;
const OUTPUT_LIMIT = 200000;
const WATCHED = ["src", "electron", "tests"];

let window;
let watchers = [];
let watchTimer;
const runner = new Runner();

function historyFile() {
  return path.join(app.getPath("userData"), "history.json");
}

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(historyFile(), "utf8"));
  } catch {
    return [];
  }
}

function saveHistory(run) {
  const trimmed = {
    ...run,
    results: run.results.map((result) => ({ ...result, output: result.output.slice(-OUTPUT_LIMIT) }))
  };
  const history = [trimmed, ...loadHistory()].slice(0, HISTORY_LIMIT);
  fs.mkdirSync(path.dirname(historyFile()), { recursive: true });
  fs.writeFileSync(historyFile(), JSON.stringify(history));
  return history;
}

function send(channel, payload) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
}

for (const event of ["run-start", "step", "output"]) {
  runner.on(event, (payload) => send(`lab:${event}`, payload));
}
runner.on("run-end", (run) => {
  run.reportPath = saveReport(run);
  send("lab:run-end", { run, history: saveHistory(run) });
  if (Notification.isSupported() && window && !window.isFocused()) {
    const failed = run.results.filter((result) => result.status === "failed").map((result) => result.name);
    new Notification({
      title: failed.length ? "Testes falharam" : "Testes passaram",
      body: failed.length ? failed.join(", ") : `${run.results.length} etapas ok`
    }).show();
  }
});

function setWatch(enabled, options) {
  for (const watcher of watchers) watcher.close();
  watchers = [];
  if (!enabled) return;
  const quick = suites.filter((suite) => suite.group === "rapido").map((suite) => suite.id);
  for (const folder of WATCHED) {
    const target = path.join(ROOT, folder);
    if (!fs.existsSync(target)) continue;
    watchers.push(fs.watch(target, { recursive: true }, (_event, file) => {
      if (!file || /node_modules|\.tmp|~$/.test(file)) return;
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => {
        if (runner.running) return;
        send("lab:watch-trigger", file);
        runner.run(quick, options).catch(() => undefined);
      }, 1500);
    }));
  }
}

function createWindow() {
  window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "Play TV X · Test Lab",
    backgroundColor: "#0f1115",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  void window.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("lab:init", () => ({
    suites: suites.map(({ id, name, description, group, needsBuild, requires }) => ({ id, name, description, group, needsBuild, requires })),
    history: loadHistory(),
    root: ROOT,
    running: runner.running
  }));
  ipcMain.handle("lab:run", (_event, ids, options) => {
    runner.run(ids, options).catch((error) => send("lab:error", error.message));
  });
  ipcMain.handle("lab:cancel", () => runner.cancel());
  ipcMain.handle("lab:watch", (_event, enabled, options) => setWatch(enabled, options));
  // So abre/le arquivos dentro de test-reports/ (relatorios, prints e logs de falha).
  const insideReports = (file) => typeof file === "string" && path.resolve(file).startsWith(path.join(ROOT, "test-reports") + path.sep);
  ipcMain.handle("lab:open-report", (_event, file) => {
    if (insideReports(file)) void shell.openPath(file);
  });
  ipcMain.handle("lab:read-image", (_event, file) => {
    if (!insideReports(file) || !file.endsWith(".png") || !fs.existsSync(file)) return undefined;
    return `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
  });
  ipcMain.handle("lab:clear-history", () => {
    fs.rmSync(historyFile(), { force: true });
    return [];
  });
  createWindow();
});

app.on("window-all-closed", () => {
  runner.cancel();
  app.quit();
});
