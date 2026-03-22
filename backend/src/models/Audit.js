const db = require("../config/db");

const insertAuditStmt = db.prepare(`
  INSERT INTO audit_logs (
    usuario_id, usuario_nome, role, acao, entidade_tipo, entidade_id, detalhes_json, metodo, rota, status_code
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function safeJson(value) {
  try {
    const raw = JSON.stringify(value ?? null);
    if (!raw) return null;
    return raw.length > 6000 ? raw.slice(0, 6000) : raw;
  } catch {
    return null;
  }
}

const AuditModel = {
  registrar(evento = {}) {
    const acao = String(evento.acao || "").trim();
    if (!acao) return;

    insertAuditStmt.run(
      evento.usuario_id ?? null,
      evento.usuario_nome ? String(evento.usuario_nome).slice(0, 90) : null,
      evento.role ? String(evento.role).slice(0, 30) : null,
      acao.slice(0, 180),
      evento.entidade_tipo ? String(evento.entidade_tipo).slice(0, 60) : null,
      evento.entidade_id !== undefined && evento.entidade_id !== null
        ? String(evento.entidade_id).slice(0, 60)
        : null,
      safeJson(evento.detalhes),
      evento.metodo ? String(evento.metodo).slice(0, 12) : null,
      evento.rota ? String(evento.rota).slice(0, 180) : null,
      Number.isFinite(Number(evento.status_code)) ? Number(evento.status_code) : null
    );
  },

  listarRecentes(limit = 200) {
    const limite = Math.max(1, Math.min(1000, Number(limit) || 200));
    return db
      .prepare(`
        SELECT
          id,
          usuario_id,
          usuario_nome,
          role,
          acao,
          entidade_tipo,
          entidade_id,
          detalhes_json,
          metodo,
          rota,
          status_code,
          created_at
        FROM audit_logs
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limite)
      .map((item) => {
        let detalhes = null;
        if (item.detalhes_json) {
          try {
            detalhes = JSON.parse(item.detalhes_json);
          } catch {
            detalhes = null;
          }
        }
        return {
          ...item,
          detalhes
        };
      });
  }
};

module.exports = AuditModel;

