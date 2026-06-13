const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bjdDesktop", {
  getAuthStatus: () => ipcRenderer.invoke("auth:get-status"),
  login: () => ipcRenderer.invoke("auth:login"),
  logout: () => ipcRenderer.invoke("auth:logout"),
  getPreferences: () => ipcRenderer.invoke("preferences:get"),
  setPreferences: (preferences) => ipcRenderer.invoke("preferences:set", preferences),
  loadAccount: (uuid = "") => ipcRenderer.invoke("account:load", { uuid }),
  loadCache: (uuid) => ipcRenderer.invoke("cache:load", { uuid }),
  clearRecords: (uuid) => ipcRenderer.invoke("cache:clear-records", { uuid }),
  updateRecords: (options) => ipcRenderer.invoke("records:update", options),
  refetchRecords: (options) => ipcRenderer.invoke("records:refetch", options),
  cancelFetch: () => ipcRenderer.invoke("records:cancel"),
  getMatchDetails: (record) => ipcRenderer.invoke("match:get", record),
  exportVisualization: (payload) => ipcRenderer.invoke("visualization:export", payload),
  onAccountCache: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("account:cache", listener);
    return () => ipcRenderer.removeListener("account:cache", listener);
  },
  onRecordsProgress: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("records:progress", listener);
    return () => ipcRenderer.removeListener("records:progress", listener);
  },
});
