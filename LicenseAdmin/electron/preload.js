const { contextBridge, ipcRenderer } = require("electron");

function invoke(channel, payload = {}) {
  return ipcRenderer.invoke(channel, payload);
}

contextBridge.exposeInMainWorld("licenseAdmin", {
  getStatus: () => invoke("license-admin:status"),
  initKeys: (payload) => invoke("license-admin:init-keys", payload),
  generateToken: (payload) => invoke("license-admin:generate-token", payload),
  listIssued: (payload) => invoke("license-admin:list-issued", payload),
  exportPublicKey: (payload) => invoke("license-admin:export-public-key", payload),
  openVault: () => invoke("license-admin:open-vault")
});
