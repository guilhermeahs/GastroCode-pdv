const db = require("../config/db");
const AuditModel = require("../models/Audit");
const { hashPin, pinValidoFormato } = require("../utils/security");

const usuarioByIdStmt = db.prepare(`
  SELECT id, nome, apelido, role, pin_salt, pin_hash, ativo
  FROM usuarios
  WHERE id = ?
  LIMIT 1
`);

function registrarFalha(req, acao, motivo) {
  try {
    AuditModel.registrar({
      usuario_id: req.authUser?.id ?? null,
      usuario_nome: req.authUser?.nome ?? null,
      role: req.role || null,
      acao: acao || "PIN_SENSIVEL_FALHA",
      entidade_tipo: "SEGURANCA",
      entidade_id: req.authUser?.id ?? null,
      detalhes: {
        motivo: String(motivo || "").slice(0, 160),
        rota: req.path,
        metodo: req.method
      }
    });
  } catch {}
}

function requireSensitivePin(options = {}) {
  const acaoFalha = String(options.acaoFalha || "PIN_SENSIVEL_FALHA");
  const mensagemErro = String(options.mensagemErro || "PIN de confirmacao invalido.");

  return (req, res, next) => {
    try {
      const authUserId = Number(req.authUser?.id);
      if (!Number.isFinite(authUserId)) {
        registrarFalha(req, acaoFalha, "Usuario nao autenticado");
        return res.status(401).json({ error: "Sessao invalida. Faca login novamente." });
      }

      const pin = String(req.headers["x-auth-pin"] || req.body?.pin_confirmacao || "").trim();
      if (!pinValidoFormato(pin)) {
        registrarFalha(req, acaoFalha, "PIN ausente ou formato invalido");
        return res.status(401).json({ error: mensagemErro });
      }

      const usuario = usuarioByIdStmt.get(authUserId);
      if (!usuario || Number(usuario.ativo) !== 1) {
        registrarFalha(req, acaoFalha, "Usuario inativo ou nao encontrado");
        return res.status(401).json({ error: "Sessao invalida. Faca login novamente." });
      }

      const hash = hashPin(pin, usuario.pin_salt);
      if (hash !== usuario.pin_hash) {
        registrarFalha(req, acaoFalha, "PIN incorreto");
        return res.status(401).json({ error: mensagemErro });
      }

      req.pinSensivelValidado = true;
      return next();
    } catch {
      registrarFalha(req, acaoFalha, "Erro interno ao validar PIN sensivel");
      return res.status(401).json({ error: mensagemErro });
    }
  };
}

module.exports = {
  requireSensitivePin
};
