const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopRuntime", {
  isDesktop: true,
  updater: {
    getState: () => ipcRenderer.invoke("updater:getState"),
    getConfig: () => ipcRenderer.invoke("updater:getConfig"),
    setConfig: (payload) => ipcRenderer.invoke("updater:setConfig", payload),
    checkNow: () => ipcRenderer.invoke("updater:check"),
    installNow: () => ipcRenderer.invoke("updater:install"),
    onStatus: (callback) => {
      if (typeof callback !== "function") {
        return () => {};
      }
      const handler = (_, payload) => callback(payload || {});
      ipcRenderer.on("updater:status", handler);
      return () => ipcRenderer.removeListener("updater:status", handler);
    }
  }
});
