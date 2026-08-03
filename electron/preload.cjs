const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("serverXtreme", {
  credentials: {
    save: (value) => ipcRenderer.invoke("credentials:save", value),
    load: () => ipcRenderer.invoke("credentials:load"),
    clear: () => ipcRenderer.invoke("credentials:clear")
  },
  updates: {
    getState: () => ipcRenderer.invoke("updates:get-state"),
    check: () => ipcRenderer.invoke("updates:check"),
    install: () => ipcRenderer.invoke("updates:install"),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("updates:state", listener);
      return () => ipcRenderer.removeListener("updates:state", listener);
    }
  },
  downloads: {
    getState: () => ipcRenderer.invoke("downloads:get-state"),
    chooseDirectory: () => ipcRenderer.invoke("downloads:choose-directory"),
    enqueue: (input) => ipcRenderer.invoke("downloads:enqueue", input),
    pause: (id) => ipcRenderer.invoke("downloads:pause", id),
    resume: (id) => ipcRenderer.invoke("downloads:resume", id),
    cancel: (id) => ipcRenderer.invoke("downloads:cancel", id),
    remove: (id) => ipcRenderer.invoke("downloads:remove", id),
    open: (id) => ipcRenderer.invoke("downloads:open", id),
    openDirectory: () => ipcRenderer.invoke("downloads:open-directory"),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("downloads:state", listener);
      return () => ipcRenderer.removeListener("downloads:state", listener);
    }
  }
});
