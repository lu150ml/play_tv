function setupUpdater({ app, autoUpdater, emit }) {
  let state = { status: "idle", version: app.getVersion() };
  const publish = (patch) => {
    state = { ...state, ...patch };
    emit(state);
  };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("checking-for-update", () => publish({ status: "checking", error: undefined }));
  autoUpdater.on("update-available", (info) => publish({ status: "available", availableVersion: info.version }));
  autoUpdater.on("update-not-available", () => publish({ status: "idle", availableVersion: undefined }));
  autoUpdater.on("download-progress", (progress) => publish({ status: "downloading", percent: Math.round(progress.percent || 0), transferred: progress.transferred, total: progress.total }));
  autoUpdater.on("update-downloaded", (info) => publish({ status: "ready", availableVersion: info.version, percent: 100 }));
  autoUpdater.on("error", (error) => publish({ status: "error", error: error?.message || "Falha ao verificar atualizacao." }));

  return {
    getState: () => state,
    check: async () => {
      if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) return state;
      await autoUpdater.checkForUpdates();
      return state;
    },
    install: () => {
      if (state.status === "ready") autoUpdater.quitAndInstall(false, true);
    }
  };
}

module.exports = { setupUpdater };
