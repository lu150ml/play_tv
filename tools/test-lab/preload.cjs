const { contextBridge, ipcRenderer } = require("electron");

const subscribe = (channel) => (listener) => {
  const handler = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("testLab", {
  init: () => ipcRenderer.invoke("lab:init"),
  run: (ids, options) => ipcRenderer.invoke("lab:run", ids, options),
  cancel: () => ipcRenderer.invoke("lab:cancel"),
  watch: (enabled, options) => ipcRenderer.invoke("lab:watch", enabled, options),
  openReport: (file) => ipcRenderer.invoke("lab:open-report", file),
  readImage: (file) => ipcRenderer.invoke("lab:read-image", file),
  clearHistory: () => ipcRenderer.invoke("lab:clear-history"),
  onRunStart: subscribe("lab:run-start"),
  onStep: subscribe("lab:step"),
  onOutput: subscribe("lab:output"),
  onRunEnd: subscribe("lab:run-end"),
  onWatchTrigger: subscribe("lab:watch-trigger"),
  onError: subscribe("lab:error")
});
