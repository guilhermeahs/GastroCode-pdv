const path = require("path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const LicenseCore = require("../src/licenseCore");

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 980,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: "#0b1021",
    title: "Hadassa License Admin",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

function setupIpc() {
  const projectRoot = path.resolve(__dirname, "..");

  function getPaths() {
    return LicenseCore.getVaultPaths(app.getPath("userData"), projectRoot);
  }

  ipcMain.handle("license-admin:status", async () => {
    return LicenseCore.getStatus(getPaths());
  });

  ipcMain.handle("license-admin:init-keys", async (_event, payload) => {
    const passphrase = String(payload?.passphrase || "");
    const force = Boolean(payload?.force);
    return LicenseCore.initKeys(getPaths(), passphrase, { force });
  });

  ipcMain.handle("license-admin:generate-token", async (_event, payload) => {
    const passphrase = String(payload?.passphrase || "");
    return LicenseCore.generateLicenseToken(getPaths(), payload || {}, passphrase);
  });

  ipcMain.handle("license-admin:list-issued", async (_event, payload) => {
    const limit = Number(payload?.limit || 30);
    return LicenseCore.listIssued(getPaths(), limit);
  });

  ipcMain.handle("license-admin:export-public-key", async (_event, payload) => {
    return LicenseCore.exportPublicKey(getPaths(), payload?.target_path);
  });

  ipcMain.handle("license-admin:open-vault", async () => {
    const paths = getPaths();
    await shell.openPath(paths.root);
    return { ok: true };
  });
}

app.whenReady().then(() => {
  setupIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
