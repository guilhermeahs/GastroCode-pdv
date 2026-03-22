const AuditModel = require("../models/Audit");
const LicenseService = require("../services/licenseService");

function registrarAuditoria(req, acao, detalhes = {}) {
  try {
    AuditModel.registrar({
      usuario_id: req.authUser?.id ?? null,
      usuario_nome: req.authUser?.nome ?? null,
      role: req.role || null,
      acao,
      entidade_tipo: "LICENCA",
      entidade_id: "licenca-ativacao",
      detalhes
    });
  } catch {}
}

const LicencaController = {
  status(req, res) {
    try {
      const payload = LicenseService.carregarStatus();
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ error: error.message || "Falha ao consultar licenca." });
    }
  },

  ativar(req, res) {
    try {
      const payload = LicenseService.ativarLicenca({
        chave: req.body?.chave,
        token_licenca: req.body?.token_licenca
      });

      registrarAuditoria(req, "LICENCA_ATIVADA", {
        chave_mascara: payload?.licenca?.chave_mascara || "",
        plano: payload?.licenca?.plano || "",
        dispositivo_id: payload?.licenca?.dispositivo_id || "",
        dispositivo_nome: payload?.licenca?.dispositivo_nome || "",
        expira_em: payload?.licenca?.expira_em || null
      });

      return res.json(payload);
    } catch (error) {
      const status = Number(error.statusCode || 400);
      return res.status(status).json({ error: error.message || "Falha ao ativar licenca." });
    }
  },

  bloquear(req, res) {
    try {
      const payload = LicenseService.bloquearLicenca(req.body?.motivo);
      registrarAuditoria(req, "LICENCA_BLOQUEADA", {
        motivo: req.body?.motivo || "Bloqueio manual"
      });
      return res.json(payload);
    } catch (error) {
      const status = Number(error.statusCode || 400);
      return res.status(status).json({ error: error.message || "Falha ao bloquear licenca." });
    }
  }
};

module.exports = LicencaController;
