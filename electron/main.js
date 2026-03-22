const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");

const PORT = Number(process.env.PORT || 3001);
const IS_DEV = !app.isPackaged;
const API_HEALTH_URL = `http://127.0.0.1:${PORT}/api/health`;
const UPDATER_FEED_URL = String(process.env.APPGESTAO_UPDATE_URL || "").trim();
const APPGESTAO_DISABLE_UPDATER = String(process.env.APPGESTAO_DISABLE_UPDATER || "0").trim() === "1";
const APPGESTAO_NATIVE_TOPBAR = String(process.env.APPGESTAO_NATIVE_TOPBAR || "0").trim() === "1";
const APPGESTAO_COMPENSAR_ESCALA = String(process.env.APPGESTAO_COMPENSAR_ESCALA || "1").trim() === "1";
const APP_UPDATE_YML_PATH = path.join(process.resourcesPath, "app-update.yml");
const UPDATE_URL_PADRAO_PLACEHOLDER = "https://example.com/appgestaoloja/updates";
const APP_ID = "com.appgestaoloja.desktop";

let backendStarted = false;
let backendBootError = "";
let janelaPrincipal = null;
let updaterIniciado = false;
let autoUpdaterRef = null;
let updaterIntervalRef = null;
let updaterFeedUrlManual = "";

const updaterState = {
  enabled: false,
  status: "idle",
  message: "Atualizacao ainda nao verificada.",
  versionAtual: app.getVersion(),
  versionNova: "",
  releaseName: "",
  releaseNotes: "",
  feedUrl: "",
  progress: 0
};

app.setName("GastroCode Brasil PDV");
if (process.platform === "win32" && typeof app.setAppUserModelId === "function") {
  app.setAppUserModelId(APP_ID);
}

function logMainError(mensagem, error = null) {
  try {
    const detail = error ? ` | ${String(error?.stack || error?.message || error)}` : "";
    const line = `[${new Date().toISOString()}] ${mensagem}${detail}\n`;
    let basePath = "";
    try {
      basePath = app.getPath("userData");
    } catch {
      basePath = path.join(os.tmpdir(), "gastrocode-brasil-pdv");
    }
    fs.mkdirSync(basePath, { recursive: true });
    fs.appendFileSync(path.join(basePath, "desktop-main.log"), line, "utf8");
  } catch {}
}

function logMainInfo(mensagem) {
  logMainError(mensagem);
}

function atualizarEstadoUpdater(parcial = {}) {
  Object.assign(updaterState, parcial);
  const payload = { ...updaterState };
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send("updater:status", payload);
    } catch {}
  }
}

function getUpdaterConfigPath() {
  try {
    return path.join(app.getPath("userData"), "updater-config.json");
  } catch {
    return path.join(os.tmpdir(), "gastrocode-brasil-pdv-updater-config.json");
  }
}

function carregarUpdaterConfigLocal() {
  try {
    const filePath = getUpdaterConfigPath();
    if (!fs.existsSync(filePath)) return "";
    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw || "{}");
    const url = String(json.feedUrl || "").trim();
    if (!url || !/^https?:\/\//i.test(url)) return "";
    return url;
  } catch {
    return "";
  }
}

function salvarUpdaterConfigLocal(feedUrl = "") {
  const filePath = getUpdaterConfigPath();
  const payload = {
    feedUrl: String(feedUrl || "").trim(),
    updatedAt: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function limparValorYaml(valor) {
  return String(valor || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function lerAppUpdateYml() {
  const info = {
    provider: "",
    url: "",
    owner: "",
    repo: ""
  };

  if (!fs.existsSync(APP_UPDATE_YML_PATH)) return info;

  try {
    const raw = fs.readFileSync(APP_UPDATE_YML_PATH, "utf-8");
    const linhas = raw.split(/\r?\n/);
    for (const linha of linhas) {
      const providerMatch = linha.match(/^\s*provider:\s*(.+)\s*$/i);
      if (providerMatch) {
        info.provider = limparValorYaml(providerMatch[1]).toLowerCase();
        continue;
      }
      const urlMatch = linha.match(/^\s*url:\s*(.+)\s*$/i);
      if (urlMatch) {
        info.url = limparValorYaml(urlMatch[1]);
        continue;
      }
      const ownerMatch = linha.match(/^\s*owner:\s*(.+)\s*$/i);
      if (ownerMatch) {
        info.owner = limparValorYaml(ownerMatch[1]);
        continue;
      }
      const repoMatch = linha.match(/^\s*repo:\s*(.+)\s*$/i);
      if (repoMatch) {
        info.repo = limparValorYaml(repoMatch[1]);
      }
    }
  } catch (error) {
    logMainError("Falha ao ler app-update.yml.", error);
  }

  return info;
}

function normalizarReleaseNotes(info = {}) {
  const bruto = info?.releaseNotes ?? info?.releaseInfo?.releaseNotes ?? "";

  if (Array.isArray(bruto)) {
    const linhas = bruto
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          return String(item.note || item.notes || item.message || "").trim();
        }
        return "";
      })
      .filter(Boolean);
    return linhas.join("\n");
  }

  if (bruto && typeof bruto === "object") {
    return String(bruto.note || bruto.notes || bruto.message || "").trim();
  }

  return String(bruto || "").trim();
}

function extrairDadosUpdate(info = {}) {
  return {
    versionNova: String(info?.version || info?.releaseInfo?.version || "").trim(),
    releaseName: String(info?.releaseName || info?.releaseInfo?.releaseName || "").trim(),
    releaseNotes: normalizarReleaseNotes(info)
  };
}

function prepararDataDir() {
  const dataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.APPGESTAO_DATA_DIR = dataDir;
  process.env.PORT = String(PORT);
  process.env.HOST = "127.0.0.1";
  process.env.APPGESTAO_DISABLE_SAMPLE_SEED = app.isPackaged ? "1" : "0";
  process.env.APPGESTAO_IMPORT_LEGACY_DB = app.isPackaged ? "0" : "1";
}

function iniciarBackend() {
  if (backendStarted) return true;

  const serverEntry = path.join(app.getAppPath(), "server.js");
  try {
    // Reutiliza o backend existente (Express + SQLite).
    require(serverEntry);
    backendStarted = true;
    backendBootError = "";
    return true;
  } catch (error) {
    backendStarted = false;
    backendBootError = String(error?.message || "falha desconhecida");
    logMainError("Falha ao iniciar backend local.", error);
    return false;
  }
}

function checarApiOnline() {
  return new Promise((resolve) => {
    const req = http.get(API_HEALTH_URL, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function aguardarApi(timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await checarApiOnline();
    if (ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

function criarJanelaPrincipal() {
  const isWindows = process.platform === "win32";
  const iconCandidates = [
    path.join(process.resourcesPath, "icon.ico"),
    path.join(path.dirname(process.execPath), "resources", "icon.ico"),
    path.join(process.resourcesPath, "app.asar.unpacked", "build", "icon.ico"),
    path.join(__dirname, "icon.ico"),
    path.join(process.resourcesPath, "build", "icon.ico"),
    path.join(app.getAppPath(), "build", "icon.ico"),
    path.join(__dirname, "..", "build", "icon.ico")
  ];
  const iconPath = iconCandidates.find((filePath) => fs.existsSync(filePath));

  const baseOptions = {
    width: 1480,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: "#0b1021",
    icon: iconPath || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  let win = null;
  if (isWindows && APPGESTAO_NATIVE_TOPBAR) {
    try {
      win = new BrowserWindow({
        ...baseOptions,
        titleBarStyle: "hidden",
        titleBarOverlay: {
          color: "#0f1530",
          symbolColor: "#f4f7ff",
          height: 38
        }
      });
      logMainInfo("Janela criada com barra nativa personalizada.");
    } catch (error) {
      logMainError("Falha ao criar janela com barra personalizada. Tentando modo seguro.", error);
      win = new BrowserWindow(baseOptions);
    }
  } else {
    win = new BrowserWindow(baseOptions);
  }

  if (iconPath) {
    try {
      win.setIcon(iconPath);
    } catch {}
  }

  const loadPromise = IS_DEV
    ? win.loadURL(String(process.env.ELECTRON_RENDERER_URL || "http://localhost:5173"))
    : win.loadFile(path.join(app.getAppPath(), "frontend", "dist", "index.html"));

  loadPromise.catch((error) => {
    logMainError("Falha ao carregar renderer principal.", error);
    const htmlErro = `
      <html>
        <body style="font-family:Segoe UI,Arial,sans-serif;background:#0b1021;color:#f4f7ff;padding:24px;">
          <h2>GastroCode Brasil PDV</h2>
          <p>Nao foi possivel abrir a interface principal.</p>
          <p style="color:#9fb0ff">Consulte o arquivo desktop-main.log na pasta de dados do usuario.</p>
        </body>
      </html>
    `;
    try {
      win.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(htmlErro)}`);
    } catch (innerError) {
      logMainError("Falha ao carregar fallback de erro no renderer.", innerError);
    }
  });

  win.once("ready-to-show", () => {
    try {
      win.show();
      win.focus();
      win.center();
      logMainInfo(`Janela pronta para exibir. visible=${win.isVisible()}`);
    } catch {}
  });

  win.webContents.once("did-finish-load", () => {
    if (APPGESTAO_COMPENSAR_ESCALA) {
      try {
        const display = screen.getDisplayMatching(win.getBounds());
        const escala = Number(display?.scaleFactor || 1);
        const zoom = Math.max(0.78, Math.min(1, Number((1 / escala).toFixed(2))));
        win.webContents.setZoomFactor(zoom);
        logMainInfo(`Escala detectada=${escala}; zoom aplicado=${zoom}`);
      } catch (error) {
        logMainError("Falha ao aplicar compensacao de escala.", error);
      }
    }
    logMainInfo("Renderer principal carregado com sucesso.");
    atualizarEstadoUpdater({});
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (/^https?:\/\//i.test(String(url || ""))) {
        shell.openExternal(url);
        return { action: "deny" };
      }
    } catch {}
    return { action: "allow" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const safeUrl = String(url || "");
    if (!safeUrl || safeUrl.startsWith("file://")) return;
    if (/^https?:\/\//i.test(safeUrl)) {
      event.preventDefault();
      shell.openExternal(safeUrl).catch(() => null);
    }
  });

  win.webContents.on("did-fail-load", (_event, code, description, validatedURL) => {
    logMainError(`did-fail-load (${code}) ${description} | ${validatedURL || "sem URL"}`);
  });

  win.on("closed", () => {
    logMainInfo("Janela principal fechada.");
  });

  janelaPrincipal = win;
}

function iniciarAutoUpdater() {
  if (updaterIniciado) return;
  updaterIniciado = true;

  if (APPGESTAO_DISABLE_UPDATER) {
    atualizarEstadoUpdater({
      enabled: false,
      status: "disabled",
      message: "Auto-update desativado por configuracao local (APPGESTAO_DISABLE_UPDATER=1).",
      progress: 0
    });
    return;
  }

  if (!autoUpdaterRef) {
    try {
      autoUpdaterRef = require("electron-updater").autoUpdater;
    } catch (error) {
      atualizarEstadoUpdater({
        enabled: false,
        status: "error",
        message: `Falha ao carregar updater: ${String(error?.message || "erro desconhecido")}`,
        progress: 0
      });
      return;
    }
  }

  const autoUpdater = autoUpdaterRef;

  const appUpdateYmlInfo = lerAppUpdateYml();
  const feedUrlYml = String(appUpdateYmlInfo.url || "").trim();
  const providerYml = String(appUpdateYmlInfo.provider || "").trim().toLowerCase();
  const githubYmlAtivo =
    providerYml === "github" &&
    Boolean(String(appUpdateYmlInfo.owner || "").trim()) &&
    Boolean(String(appUpdateYmlInfo.repo || "").trim());
  const feedUrlFinal = UPDATER_FEED_URL || updaterFeedUrlManual || feedUrlYml;
  const genericUrlValida =
    Boolean(feedUrlFinal) &&
    !feedUrlFinal.toLowerCase().includes(UPDATE_URL_PADRAO_PLACEHOLDER.toLowerCase());
  const feedDisplay = genericUrlValida
    ? feedUrlFinal
    : githubYmlAtivo
      ? `github:${appUpdateYmlInfo.owner}/${appUpdateYmlInfo.repo}`
      : "";
  const updaterHabilitado =
    !IS_DEV &&
    (genericUrlValida || githubYmlAtivo);

  if (!updaterHabilitado) {
    atualizarEstadoUpdater({
      enabled: false,
      status: "disabled",
      message: IS_DEV
        ? "Auto-update desativado no modo desenvolvimento."
        : "Auto-update desativado. Configure URL manual no app ou publique por GitHub Releases.",
      feedUrl: feedDisplay || "",
      progress: 0
    });
    return;
  }

  if (UPDATER_FEED_URL || updaterFeedUrlManual || providerYml === "generic") {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: feedUrlFinal
    });
  }

  autoUpdater.removeAllListeners();

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  atualizarEstadoUpdater({
    enabled: true,
    feedUrl: feedDisplay
  });

  autoUpdater.on("checking-for-update", () => {
    atualizarEstadoUpdater({
      enabled: true,
      status: "checking",
      message: "Verificando atualizacoes...",
      progress: 0,
      feedUrl: feedDisplay
    });
  });

  autoUpdater.on("update-available", (info) => {
    const dadosUpdate = extrairDadosUpdate(info);
    atualizarEstadoUpdater({
      enabled: true,
      status: "downloading",
      message: "Nova versao encontrada. Baixando...",
      versionNova: dadosUpdate.versionNova,
      releaseName: dadosUpdate.releaseName,
      releaseNotes: dadosUpdate.releaseNotes,
      feedUrl: feedDisplay,
      progress: 0
    });
  });

  autoUpdater.on("download-progress", (event) => {
    atualizarEstadoUpdater({
      enabled: true,
      status: "downloading",
      message: `Baixando atualizacao... ${Math.round(Number(event?.percent || 0))}%`,
      feedUrl: feedDisplay,
      progress: Number(event?.percent || 0)
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    const dadosUpdate = extrairDadosUpdate(info);
    atualizarEstadoUpdater({
      enabled: true,
      status: "downloaded",
      message: "Atualizacao pronta. Clique para reiniciar e instalar.",
      versionNova: dadosUpdate.versionNova || updaterState.versionNova || "",
      releaseName: dadosUpdate.releaseName || updaterState.releaseName || "",
      releaseNotes: dadosUpdate.releaseNotes || updaterState.releaseNotes || "",
      feedUrl: feedDisplay,
      progress: 100
    });
  });

  autoUpdater.on("update-not-available", () => {
    atualizarEstadoUpdater({
      enabled: true,
      status: "up-to-date",
      message: "Aplicativo atualizado.",
      versionNova: "",
      releaseName: "",
      releaseNotes: "",
      feedUrl: feedDisplay,
      progress: 100
    });
  });

  autoUpdater.on("error", (error) => {
    atualizarEstadoUpdater({
      enabled: true,
      status: "error",
      message: `Falha no auto-update: ${String(error?.message || "erro desconhecido")}`,
      feedUrl: feedDisplay,
      progress: 0
    });
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      atualizarEstadoUpdater({
        enabled: true,
        status: "error",
        message: `Falha ao verificar atualizacao: ${String(error?.message || "erro desconhecido")}`,
        feedUrl: feedDisplay
      });
    });
  }, 12000);

  if (updaterIntervalRef) {
    clearInterval(updaterIntervalRef);
    updaterIntervalRef = null;
  }

  const intervaloVerificacaoMs = 1000 * 60 * 60 * 4;
  updaterIntervalRef = setInterval(() => {
    if (!updaterState.enabled || !autoUpdaterRef) return;
    autoUpdaterRef.checkForUpdates().catch((error) => {
      atualizarEstadoUpdater({
        enabled: true,
        status: "error",
        message: `Falha ao verificar atualizacao: ${String(error?.message || "erro desconhecido")}`,
        feedUrl: feedDisplay
      });
    });
  }, intervaloVerificacaoMs);
  updaterIntervalRef.unref?.();
}

app.whenReady().then(async () => {
  logMainInfo("Bootstrap desktop iniciado.");
  try {
    prepararDataDir();
    logMainInfo(`Diretorio de dados: ${process.env.APPGESTAO_DATA_DIR || "nao definido"}`);
  } catch (error) {
    logMainError("Falha ao preparar diretorio de dados.", error);
  }

  const backendOk = iniciarBackend();
  logMainInfo(`Status bootstrap backend: ${backendOk ? "ok" : `erro (${backendBootError || "desconhecido"})`}`);
  criarJanelaPrincipal();
  logMainInfo("Janela principal solicitada.");

  if (backendOk) {
    aguardarApi().then((ok) => {
      if (!ok) {
        logMainError("Backend nao respondeu no tempo esperado.");
      }
    });
  } else {
    logMainError(`Backend indisponivel no bootstrap: ${backendBootError || "erro desconhecido"}`);
  }

  updaterFeedUrlManual = carregarUpdaterConfigLocal();
  iniciarAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      criarJanelaPrincipal();
    }
  });

  ipcMain.handle("updater:getState", () => ({ ...updaterState }));
  ipcMain.handle("updater:getConfig", () => ({
    feedUrl: updaterFeedUrlManual || ""
  }));
  ipcMain.handle("updater:setConfig", async (_event, payload = {}) => {
    const feedUrl = String(payload?.feedUrl || "").trim();
    if (feedUrl && !/^https?:\/\//i.test(feedUrl)) {
      throw new Error("URL invalida. Use http:// ou https://");
    }

    salvarUpdaterConfigLocal(feedUrl);
    updaterFeedUrlManual = feedUrl;

    if (autoUpdaterRef) {
      autoUpdaterRef.removeAllListeners();
    }
    if (updaterIntervalRef) {
      clearInterval(updaterIntervalRef);
      updaterIntervalRef = null;
    }
    updaterIniciado = false;
    iniciarAutoUpdater();

    return {
      feedUrl: updaterFeedUrlManual || "",
      updater: { ...updaterState }
    };
  });
  ipcMain.handle("updater:check", async () => {
    if (!updaterState.enabled || !autoUpdaterRef) return { ...updaterState };
    try {
      const resultado = await autoUpdaterRef.checkForUpdates();
      const dadosUpdate = extrairDadosUpdate(resultado?.updateInfo || {});
      if (dadosUpdate.versionNova || dadosUpdate.releaseNotes || dadosUpdate.releaseName) {
        atualizarEstadoUpdater({
          versionNova: dadosUpdate.versionNova || updaterState.versionNova,
          releaseName: dadosUpdate.releaseName || updaterState.releaseName,
          releaseNotes: dadosUpdate.releaseNotes || updaterState.releaseNotes
        });
      }
    } catch (error) {
      atualizarEstadoUpdater({
        status: "error",
        message: `Falha ao verificar atualizacao: ${String(error?.message || "erro desconhecido")}`
      });
    }
    return { ...updaterState };
  });
  ipcMain.handle("updater:install", async () => {
    if (!updaterState.enabled || updaterState.status !== "downloaded" || !autoUpdaterRef) {
      return { ...updaterState };
    }
    setTimeout(() => {
      autoUpdaterRef.quitAndInstall(false, true);
    }, 250);
    return { ...updaterState };
  });

  ipcMain.handle("backend:getStatus", () => ({
    ok: backendStarted,
    erro: backendBootError || ""
  }));
});

process.on("uncaughtException", (error) => {
  logMainError("uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  logMainError("unhandledRejection", reason);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
