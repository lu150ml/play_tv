const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("serverXtreme", {
  credentials: {
    save: (value) => ipcRenderer.invoke("credentials:save", value),
    load: () => ipcRenderer.invoke("credentials:load"),
    clear: () => ipcRenderer.invoke("credentials:clear")
  }
});
