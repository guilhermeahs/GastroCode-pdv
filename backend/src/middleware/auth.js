const db = require("../config/db");
const { resolverPermissoesUsuario, temPermissao } = require("../utils/permissoes");

const sessaoPorTokenStmt = db.prepare(`
  SELECT
    s.token,
    s.usuario_id,
    s.expires_at,
    u.id,
    u.nome,
    u.apelido,
    u.role,
    u.perfil_personalizado,
    u.perfil_nome,
    u.permissoes_json
  FROM user_sessoes s
  INNER JOIN usuarios u ON u.id = s.usuario_id
  WHERE s.token = ?
    AND s.ativo = 1
    AND u.ativo = 1
  LIMIT 1
`);

const atualizarHeartbeatSessaoStmt = db.prepare(`
  UPDATE user_sessoes
  SET last_seen_at = CURRENT_TIMESTAMP
  WHERE token = ?
`);

function roleFromHeader(req) {
  return String(req.headers["x-role"] || "GERENTE").toUpperCase();
}

function tokenFromHeader(req) {
  return String(req.headers["x-auth-token"] || "").trim();
}

function resolverAuth(req, { allowLegacy = true } = {}) {
  const token = tokenFromHeader(req);

  if (token) {
    const sessao = sessaoPorTokenStmt.get(token);
    if (!sessao) {
      const error = new Error("Sessao invalida. Faca login novamente.");
      error.statusCode = 401;
      throw error;
    }

    const expirou = new Date(sessao.expires_at).getTime() <= Date.now();
    if (expirou) {
      const error = new Error("Sessao expirada. Faca login novamente.");
      error.statusCode = 401;
      throw error;
    }

    atualizarHeartbeatSessaoStmt.run(token);
    const perfil = resolverPermissoesUsuario(sessao);

    return {
      role: String(sessao.role || "GARCOM").toUpperCase(),
      token,
      expira_em: sessao.expires_at,
      legacy: false,
      perfil_personalizado: perfil.perfil_personalizado,
      perfil_nome: perfil.perfil_nome,
      permissoes: perfil.permissoes,
      user: {
        id: sessao.id,
        nome: sessao.nome,
        apelido: sessao.apelido,
        role: String(sessao.role || "GARCOM").toUpperCase(),
        perfil_personalizado: perfil.perfil_personalizado,
        perfil_nome: perfil.perfil_nome,
        permissoes: perfil.permissoes
      }
    };
  }

  if (!allowLegacy) {
    const error = new Error("Login obrigatorio.");
    error.statusCode = 401;
    throw error;
  }

  return {
    role: roleFromHeader(req),
    token: "",
    expira_em: null,
    legacy: true,
    perfil_personalizado: false,
    perfil_nome: "",
    permissoes: resolverPermissoesUsuario({ role: roleFromHeader(req) }).permissoes,
    user: null
  };
}

function allowRoles(roles, options = {}) {
  const rolesPermitidos = Array.isArray(roles) ? roles.map((r) => String(r || "").toUpperCase()) : [];
  const permissaoNecessaria = String(options.permission || "").trim();

  return (req, res, next) => {
    try {
      const auth = resolverAuth(req, options);
      const rolePermitida = rolesPermitidos.length < 1 || rolesPermitidos.includes(auth.role);
      const possuiPermissao = permissaoNecessaria
        ? temPermissao(auth.permissoes, permissaoNecessaria)
        : true;

      if (!possuiPermissao) {
        return res.status(403).json({ error: "Permissao insuficiente para esta acao." });
      }

      if (!rolePermitida && !permissaoNecessaria) {
        return res.status(403).json({ error: "Acesso negado para este perfil." });
      }

      req.role = auth.role;
      req.auth = auth;
      req.authUser = auth.user;
      req.authLegacy = auth.legacy;
      req.authToken = auth.token;
      req.authPermissions = auth.permissoes;
      req.temPermissao = (chavePermissao) => temPermissao(auth.permissoes, chavePermissao);

      return next();
    } catch (error) {
      const status = Number(error.statusCode || 401);
      return res.status(status).json({ error: error.message || "Falha de autenticacao." });
    }
  };
}

module.exports = {
  allowRoles,
  resolverAuth
};
