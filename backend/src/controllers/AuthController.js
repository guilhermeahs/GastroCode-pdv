const db = require("../config/db");
const { resolverAuth } = require("../middleware/auth");
const AuditModel = require("../models/Audit");
const { gerarTokenSessao, hashPin, pinValidoFormato } = require("../utils/security");
const { resolverPermissoesUsuario } = require("../utils/permissoes");

const usuarioAtivoByIdStmt = db.prepare(`
  SELECT id, nome, apelido, role, pin_salt, pin_hash, ativo, perfil_personalizado, perfil_nome, permissoes_json
  FROM usuarios
  WHERE id = ? AND ativo = 1
  LIMIT 1
`);

const usuarioAtivoByApelidoStmt = db.prepare(`
  SELECT id, nome, apelido, role, pin_salt, pin_hash, ativo, perfil_personalizado, perfil_nome, permissoes_json
  FROM usuarios
  WHERE LOWER(apelido) = LOWER(?) AND ativo = 1
  LIMIT 1
`);

const insertSessaoStmt = db.prepare(`
  INSERT INTO user_sessoes (token, usuario_id, expires_at, ativo)
  VALUES (?, ?, ?, 1)
`);

const inativarSessaoStmt = db.prepare(`
  UPDATE user_sessoes
  SET ativo = 0
  WHERE token = ?
`);

const limparSessoesExpiradasStmt = db.prepare(`
  UPDATE user_sessoes
  SET ativo = 0
  WHERE DATETIME(expires_at) <= DATETIME('now')
`);

const listarUsuariosLoginStmt = db.prepare(`
  SELECT id, nome, apelido, role, perfil_personalizado, perfil_nome, permissoes_json
  FROM usuarios
  WHERE ativo = 1
    AND role IN ('GARCOM', 'GERENTE')
  ORDER BY
    CASE role
      WHEN 'GERENTE' THEN 1
      ELSE 2
    END,
    nome ASC
`);

function adicionarHorasIso(hours) {
  const now = new Date();
  const expiry = new Date(now.getTime() + hours * 60 * 60 * 1000);
  return expiry.toISOString();
}

function maskName(name) {
  const txt = String(name || "").trim();
  return txt.slice(0, 2) + "***";
}

function mapUsuarioAuth(usuario) {
  const perfil = resolverPermissoesUsuario(usuario || {});
  return {
    id: usuario.id,
    nome: usuario.nome,
    apelido: usuario.apelido,
    role: usuario.role,
    perfil_personalizado: perfil.perfil_personalizado,
    perfil_nome: perfil.perfil_nome,
    permissoes: perfil.permissoes
  };
}

const AuthController = {
  listarUsuariosLogin(req, res) {
    try {
      res.json({ usuarios: listarUsuariosLoginStmt.all().map(mapUsuarioAuth) });
    } catch (error) {
      res.status(500).json({ error: error.message || "Falha ao listar usuarios." });
    }
  },

  login(req, res) {
    try {
      limparSessoesExpiradasStmt.run();
      const pin = String(req.body?.pin || "").trim();
      if (!pinValidoFormato(pin)) {
        return res.status(400).json({ error: "PIN invalido. Use de 4 a 8 numeros." });
      }

      let usuario = null;
      if (req.body?.usuario_id !== undefined && req.body?.usuario_id !== null && req.body?.usuario_id !== "") {
        const id = Number(req.body.usuario_id);
        usuario = Number.isFinite(id) ? usuarioAtivoByIdStmt.get(id) : null;
      }

      if (!usuario && req.body?.apelido) {
        const apelido = String(req.body.apelido || "").trim();
        if (apelido) {
          usuario = usuarioAtivoByApelidoStmt.get(apelido);
        }
      }

      if (!usuario) {
        return res.status(401).json({ error: "Usuario nao encontrado ou inativo." });
      }

      const pinHash = hashPin(pin, usuario.pin_salt);
      if (pinHash !== usuario.pin_hash) {
        AuditModel.registrar({
          usuario_id: usuario.id,
          usuario_nome: usuario.nome,
          role: usuario.role,
          acao: "LOGIN_FALHA_PIN",
          entidade_tipo: "USUARIO",
          entidade_id: usuario.id,
          detalhes: { apelido: usuario.apelido, origem: "auth/login" }
        });
        return res.status(401).json({ error: "PIN incorreto." });
      }

      const token = gerarTokenSessao();
      const expiresAt = adicionarHorasIso(12);
      insertSessaoStmt.run(token, usuario.id, expiresAt);

      AuditModel.registrar({
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        role: usuario.role,
        acao: "LOGIN_SUCESSO",
        entidade_tipo: "USUARIO",
        entidade_id: usuario.id,
        detalhes: { apelido: usuario.apelido, origem: "auth/login" }
      });

      return res.status(201).json({
        token,
        expira_em: expiresAt,
        usuario: mapUsuarioAuth(usuario)
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Falha ao autenticar." });
    }
  },

  logout(req, res) {
    try {
      const auth = resolverAuth(req, { allowLegacy: false });
      if (!auth.token) {
        return res.status(400).json({ error: "Sessao nao encontrada." });
      }

      inativarSessaoStmt.run(auth.token);

      AuditModel.registrar({
        usuario_id: auth.user?.id ?? null,
        usuario_nome: auth.user?.nome ?? null,
        role: auth.role,
        acao: "LOGOUT",
        entidade_tipo: "SESSAO",
        entidade_id: auth.token.slice(0, 12),
        detalhes: { usuario: maskName(auth.user?.nome) }
      });

      return res.json({ ok: true });
    } catch (error) {
      const status = Number(error.statusCode || 401);
      return res.status(status).json({ error: error.message || "Falha ao encerrar sessao." });
    }
  },

  me(req, res) {
    try {
      const auth = resolverAuth(req, { allowLegacy: false });
      return res.json({
        autenticado: true,
        usuario: auth.user
          ? {
              ...auth.user,
              permissoes: auth.permissoes,
              perfil_personalizado: auth.perfil_personalizado,
              perfil_nome: auth.perfil_nome
            }
          : null,
        expira_em: auth.expira_em || null
      });
    } catch (error) {
      const status = Number(error.statusCode || 401);
      return res.status(status).json({ error: error.message || "Sessao invalida." });
    }
  }
};

module.exports = AuthController;
