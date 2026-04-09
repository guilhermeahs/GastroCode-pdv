const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopRuntime", {
  isDesktop: true,
  windowControls: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    close: () => ipcRenderer.invoke("window:close"),
    onMaximizeChanged: (callback) => {
      if (typeof callback !== "function") {
        return () => {};
      }
      const handler = (_, isMaximized) => callback(Boolean(isMaximized));
      ipcRenderer.on("window:maximized", handler);
      return () => ipcRenderer.removeListener("window:maximized", handler);
    }
  },
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
