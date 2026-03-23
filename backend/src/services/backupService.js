const fs = require("fs");
const path = require("path");
const db = require("../config/db");
const SistemaConfigModel = require("../models/SistemaConfig");

const TABELAS_BACKUP = [
  "mesas",
  "produtos",
  "pedidos",
  "itens_pedido",
  "transacoes",
  "pedido_pagamentos",
  "caixa_sessoes",
  "motoboys",
  "motoboy_pedidos",
  "usuarios",
  "caixa_movimentos",
  "user_sessoes",
  "audit_logs"
];

function tableColumns(table) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((item) => String(item.name));
}

function lerTabela(table) {
  return db.prepare(`SELECT * FROM ${table}`).all();
}

function buildBackupSnapshot() {
  const tables = {};
  for (const table of TABELAS_BACKUP) {
    tables[table] = lerTabela(table);
  }

  return {
    meta: {
      app: "GastroCodeBrasilPDV",
      versao: 2,
      criado_em: new Date().toISOString()
    },
    tables
  };
}

function resolverDataDir() {
  const dataDir = String(process.env.APPGESTAO_DATA_DIR || "").trim();
  if (dataDir) return dataDir;

  const dbPath = String(process.env.APPGESTAO_DB_PATH || "").trim();
  if (dbPath) return path.dirname(dbPath);

  return process.cwd();
}

function garantirDiretorio(caminho) {
  fs.mkdirSync(caminho, { recursive: true });
}

const BACKUPS_DIR = path.join(resolverDataDir(), "backups");
const AUTO_BACKUP_STATE_FILE = path.join(BACKUPS_DIR, "auto-backup-state.json");

function backupMirrorDirConfigurado() {
  const raw = String(SistemaConfigModel.get("backup_mirror_dir", "") || "").trim();
  if (!raw) return "";
  return path.resolve(raw);
}

function backupRetencaoDias() {
  const valor = Number(SistemaConfigModel.getNumber("backup_retain_days", 30));
  if (!Number.isFinite(valor)) return 30;
  return Math.max(7, Math.min(365, Math.round(valor)));
}

function localDateKey(data = new Date()) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function localDateTimeStamp(data = new Date()) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  const hora = String(data.getHours()).padStart(2, "0");
  const min = String(data.getMinutes()).padStart(2, "0");
  const seg = String(data.getSeconds()).padStart(2, "0");
  return `${ano}-${mes}-${dia}_${hora}-${min}-${seg}`;
}

function salvarSnapshotArquivo(snapshot, prefixo = "manual-backup") {
  garantirDiretorio(BACKUPS_DIR);
  const filename = `${prefixo}-${localDateTimeStamp()}.json`;
  const fullPath = path.join(BACKUPS_DIR, filename);
  fs.writeFileSync(fullPath, JSON.stringify(snapshot, null, 2), "utf-8");
  const output = {
    filename,
    full_path: fullPath
  };

  const mirrorDir = backupMirrorDirConfigurado();
  if (mirrorDir && path.resolve(mirrorDir) !== path.resolve(BACKUPS_DIR)) {
    try {
      garantirDiretorio(mirrorDir);
      const mirrorPath = path.join(mirrorDir, filename);
      fs.copyFileSync(fullPath, mirrorPath);
      output.espelho_path = mirrorPath;
    } catch {
      output.espelho_path = null;
    }
  }

  executarRotinaRetencao();
  return output;
}

function listarBackups(limit = 20) {
  garantirDiretorio(BACKUPS_DIR);
  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => {
      const fullPath = path.join(BACKUPS_DIR, name);
      const stat = fs.statSync(fullPath);
      return {
        arquivo: name,
        caminho: fullPath,
        tamanho_bytes: stat.size,
        atualizado_em: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.atualizado_em).getTime() - new Date(a.atualizado_em).getTime());

  return files.slice(0, Math.max(1, Math.min(200, Number(limit) || 20)));
}

function carregarSnapshotArquivo(nomeArquivo) {
  const nome = path.basename(String(nomeArquivo || "").trim());
  if (!nome || !nome.toLowerCase().endsWith(".json")) {
    throw new Error("Arquivo de backup invalido. Informe um .json da lista de backups.");
  }

  const fullPath = path.join(BACKUPS_DIR, nome);
  if (!fs.existsSync(fullPath)) {
    throw new Error("Arquivo de backup nao encontrado no diretorio local.");
  }

  const raw = fs.readFileSync(fullPath, "utf-8");
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Arquivo de backup corrompido ou invalido.");
  }

  if (!parsed || typeof parsed !== "object" || !parsed.tables || typeof parsed.tables !== "object") {
    throw new Error("Arquivo nao parece um backup valido do sistema.");
  }

  return parsed;
}

function limparBackupsAntigos(diretorio, diasRetencao) {
  if (!diretorio || !fs.existsSync(diretorio)) return;

  const msRetencao = diasRetencao * 24 * 60 * 60 * 1000;
  const agora = Date.now();
  const arquivos = fs
    .readdirSync(diretorio)
    .filter((name) => name.toLowerCase().endsWith(".json") && name !== "auto-backup-state.json")
    .map((name) => {
      const fullPath = path.join(diretorio, name);
      const stat = fs.statSync(fullPath);
      return {
        name,
        fullPath,
        mtime: stat.mtime.getTime()
      };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const manterMinimo = 25;

  arquivos.forEach((item, index) => {
    if (index < manterMinimo) return;
    if (agora - item.mtime < msRetencao) return;
    try {
      fs.unlinkSync(item.fullPath);
    } catch {}
  });
}

function executarRotinaRetencao() {
  const dias = backupRetencaoDias();
  limparBackupsAntigos(BACKUPS_DIR, dias);

  const mirrorDir = backupMirrorDirConfigurado();
  if (mirrorDir && path.resolve(mirrorDir) !== path.resolve(BACKUPS_DIR)) {
    limparBackupsAntigos(mirrorDir, dias);
  }
}

function lerEstadoAutoBackup() {
  try {
    if (!fs.existsSync(AUTO_BACKUP_STATE_FILE)) return {};
    const raw = fs.readFileSync(AUTO_BACKUP_STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function salvarEstadoAutoBackup(payload) {
  garantirDiretorio(BACKUPS_DIR);
  fs.writeFileSync(AUTO_BACKUP_STATE_FILE, JSON.stringify(payload, null, 2), "utf-8");
}

function executarBackupAutomatico(options = {}) {
  const force = Boolean(options.force);
  const hoje = localDateKey();
  const estado = lerEstadoAutoBackup();

  if (!force && estado.last_success_date === hoje) {
    return {
      executado: false,
      motivo: "ja_executado_hoje",
      ultimo_arquivo: estado.last_file || null
    };
  }

  const snapshot = buildBackupSnapshot();
  const salvo = salvarSnapshotArquivo(snapshot, "auto-backup");
  salvarEstadoAutoBackup({
    last_success_date: hoje,
    last_file: salvo.filename,
    last_run_at: new Date().toISOString()
  });

  return {
    executado: true,
    arquivo: salvo.filename,
    caminho: salvo.full_path,
    espelho_path: salvo.espelho_path || null
  };
}

let schedulerTimer = null;
let schedulerPrimingTimer = null;

function iniciarAgendadorBackupAutomatico() {
  if (schedulerTimer || schedulerPrimingTimer) return;

  const executarComLog = () => {
    try {
      const resultado = executarBackupAutomatico();
      if (resultado.executado) {
        console.log(`[backup] auto diario salvo: ${resultado.arquivo}`);
      }
    } catch (error) {
      console.error(`[backup] falha no auto-backup: ${error.message}`);
    }
  };

  schedulerPrimingTimer = setTimeout(executarComLog, 15000);
  if (typeof schedulerPrimingTimer.unref === "function") {
    schedulerPrimingTimer.unref();
  }

  schedulerTimer = setInterval(executarComLog, 30 * 60 * 1000);
  if (typeof schedulerTimer.unref === "function") {
    schedulerTimer.unref();
  }
}

module.exports = {
  TABELAS_BACKUP,
  BACKUPS_DIR,
  buildBackupSnapshot,
  salvarSnapshotArquivo,
  carregarSnapshotArquivo,
  listarBackups,
  executarBackupAutomatico,
  iniciarAgendadorBackupAutomatico,
  backupMirrorDirConfigurado,
  backupRetencaoDias
};
