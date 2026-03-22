const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function resolverCaminhosDb() {
  const appData = String(process.env.APPDATA || "").trim();
  const candidates = unique([
    path.join(appData, "GastroCode Brasil PDV", "data", "appgestao.db"),
    path.join(appData, "appgestaoloja-backend", "data", "appgestao.db"),
    path.join(appData, "AppGestaoLoja", "appgestao.db"),
    path.resolve(__dirname, "..", "..", "appgestao.db")
  ]);

  return candidates.filter((item) => fs.existsSync(item));
}

function revogarEmDb(dbPath) {
  const db = new Database(dbPath);
  try {
    const tableExists = db
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='licenca_ativacao' LIMIT 1")
      .get();

    if (!tableExists) {
      return { dbPath, status: "sem_tabela", before: null, after: null };
    }

    const before = db.prepare("SELECT id, status, updated_at FROM licenca_ativacao WHERE id = 1").get() || null;

    db.prepare(`
      UPDATE licenca_ativacao
      SET status = 'BLOQUEADA',
          observacao = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run("Bloqueio manual local");

    const after = db.prepare("SELECT id, status, updated_at FROM licenca_ativacao WHERE id = 1").get() || null;
    return { dbPath, status: "ok", before, after };
  } finally {
    db.close();
  }
}

function main() {
  const dbs = resolverCaminhosDb();
  if (dbs.length === 0) {
    console.log("Nenhum banco local encontrado para revogar licenca.");
    process.exit(0);
  }

  console.log("Revogando licenca local...");
  for (const dbPath of dbs) {
    try {
      const out = revogarEmDb(dbPath);
      console.log(`\nDB: ${out.dbPath}`);
      console.log(`Status operacao: ${out.status}`);
      console.log(`Antes: ${JSON.stringify(out.before)}`);
      console.log(`Depois: ${JSON.stringify(out.after)}`);
    } catch (error) {
      console.log(`\nDB: ${dbPath}`);
      console.log(`Erro: ${String(error?.message || error)}`);
    }
  }
}

main();
