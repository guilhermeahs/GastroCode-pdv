const db = require("../config/db");

const getStmt = db.prepare(`
  SELECT valor
  FROM sistema_config
  WHERE chave = ?
  LIMIT 1
`);

const setStmt = db.prepare(`
  INSERT INTO sistema_config (chave, valor, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(chave) DO UPDATE SET
    valor = excluded.valor,
    updated_at = CURRENT_TIMESTAMP
`);

const listStmt = db.prepare(`
  SELECT chave, valor
  FROM sistema_config
`);

function toText(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

const SistemaConfigModel = {
  get(chave, fallback = "") {
    const row = getStmt.get(String(chave || ""));
    if (!row) return fallback;
    return row.valor === null || row.valor === undefined ? fallback : row.valor;
  },

  getNumber(chave, fallback = 0) {
    const valor = Number(this.get(chave, fallback));
    return Number.isFinite(valor) ? valor : fallback;
  },

  getBoolean(chave, fallback = false) {
    const raw = String(this.get(chave, fallback ? "1" : "0")).trim().toLowerCase();
    if (["1", "true", "sim", "yes", "on"].includes(raw)) return true;
    if (["0", "false", "nao", "não", "off", ""].includes(raw)) return false;
    return Boolean(fallback);
  },

  set(chave, valor) {
    setStmt.run(String(chave || ""), toText(valor));
    return this.get(chave, "");
  },

  setMany(config = {}) {
    const tx = db.transaction((payload) => {
      for (const [chave, valor] of Object.entries(payload || {})) {
        setStmt.run(String(chave || ""), toText(valor));
      }
    });
    tx(config || {});
  },

  listar() {
    const rows = listStmt.all();
    const out = {};
    for (const item of rows) {
      out[item.chave] = item.valor;
    }
    return out;
  }
};

module.exports = SistemaConfigModel;

