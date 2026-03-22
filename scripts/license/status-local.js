const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function listarDbs() {
  const appData = String(process.env.APPDATA || "").trim();
  const itens = [
    path.join(appData, "GastroCode Brasil PDV", "data", "appgestao.db"),
    path.join(appData, "appgestaoloja-backend", "data", "appgestao.db"),
    path.join(appData, "AppGestaoLoja", "appgestao.db")
  ];
  return itens.filter((item) => fs.existsSync(item));
}

for (const dbPath of listarDbs()) {
  try {
    const db = new Database(dbPath, { readonly: true });
    const hasTable = db
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='licenca_ativacao' LIMIT 1")
      .get();
    const row = hasTable
      ? db.prepare("SELECT id, status, expira_em, updated_at FROM licenca_ativacao WHERE id = 1").get() || null
      : null;
    db.close();
    console.log(JSON.stringify({ dbPath, row }));
  } catch (error) {
    console.log(JSON.stringify({ dbPath, error: String(error?.message || error) }));
  }
}
