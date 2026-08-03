function setupUpdater({ app, autoUpdater, emit }) {
  const portable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
  const supported = app.isPackaged && !portable;
  let state = {
    status: supported ? "idle" : "unsupported",
    version: app.getVersion(),
    supported,
    environment: !app.isPackaged ? "development" : portable ? "portable" : "installed",
    lastResult: "not-checked"
  };
  const publish = (patch) => {
    state = { ...state, ...patch };
    emit(state);
  };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("checking-for-update", () => publish({ status: "checking", error: undefined }));
  autoUpdater.on("update-available", (info) => publish({ status: "available", availableVersion: info.version, lastCheckedAt: new Date().toISOString(), lastResult: "available" }));
  autoUpdater.on("update-not-available", () => publish({ status: "idle", availableVersion: undefined, lastCheckedAt: new Date().toISOString(), lastResult: "up-to-date" }));
  autoUpdater.on("download-progress", (progress) => publish({ status: "downloading", percent: Math.round(progress.percent || 0), transferred: progress.transferred, total: progress.total }));
  autoUpdater.on("update-downloaded", (info) => publish({ status: "ready", availableVersion: info.version, percent: 100, lastResult: "available" }));
  autoUpdater.on("error", (error) => publish({ status: "error", error: error?.message || "Falha ao verificar atualizacao.", lastCheckedAt: new Date().toISOString(), lastResult: "error" }));

  return {
    getState: () => state,
    check: async () => {
      if (!supported) return state;
      await autoUpdater.checkForUpdates();
      return state;
    },
    install: () => {
      if (state.status === "ready") autoUpdater.quitAndInstall(false, true);
    }
  };
}

module.exports = { setupUpdater };
