const AuditModel = require("../models/Audit");

function sanitizeBody(body) {
  if (!body || typeof body !== "object") return null;
  const clone = Array.isArray(body) ? body.slice(0, 20) : { ...body };

  const sensitiveKeys = [
    "pin",
    "novo_pin",
    "senha",
    "password",
    "token",
    "backup",
    "logo_data_url",
    "chave",
    "chave_licenca",
    "license_key"
  ];
  for (const key of Object.keys(clone)) {
    const lower = key.toLowerCase();
    if (sensitiveKeys.includes(lower)) {
      clone[key] = "***";
      continue;
    }

    const value = clone[key];
    if (typeof value === "string" && value.length > 240) {
      clone[key] = `${value.slice(0, 240)}...`;
      continue;
    }

    if (value && typeof value === "object") {
      clone[key] = sanitizeBody(value);
    }
  }
  return clone;
}

function auditTrailMiddleware(req, res, next) {
  if (req.path === "/health") {
    return next();
  }

  const method = String(req.method || "").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return next();
  }

  res.on("finish", () => {
    try {
      const role = String(req.role || req.headers["x-role"] || "").toUpperCase() || null;
      const usuario = req.authUser || null;
      AuditModel.registrar({
        usuario_id: usuario?.id ?? null,
        usuario_nome: usuario?.nome ?? null,
        role,
        acao: `${method} ${req.path}`,
        entidade_tipo: "API",
        entidade_id: null,
        detalhes: {
          body: sanitizeBody(req.body),
          query: sanitizeBody(req.query),
          params: sanitizeBody(req.params)
        },
        metodo: method,
        rota: req.path,
        status_code: res.statusCode
      });
    } catch {}
  });

  return next();
}

module.exports = auditTrailMiddleware;
