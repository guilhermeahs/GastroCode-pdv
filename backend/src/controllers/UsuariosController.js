const db = require("../config/db");
const AuditModel = require("../models/Audit");
const { gerarSalt, hashPin, pinValidoFormato } = require("../utils/security");
const {
  CATALOGO_PERMISSOES,
  mapaPermissoesPadraoPorRole,
  normalizarMapaPermissoes,
  resolverPermissoesUsuario
} = require("../utils/permissoes");

const ROLES = ["GARCOM", "GERENTE"];

const usuariosListStmt = db.prepare(`
  SELECT
    id,
    nome,
    apelido,
    role,
    ativo,
    perfil_personalizado,
    perfil_nome,
    permissoes_json,
    created_at,
    updated_at
  FROM usuarios
  WHERE role IN ('GARCOM', 'GERENTE')
  ORDER BY
    CASE role
      WHEN 'GERENTE' THEN 1
      ELSE 2
    END,
    nome ASC
`);

const usuarioByIdStmt = db.prepare(`
  SELECT
    id,
    nome,
    apelido,
    role,
    ativo,
    pin_salt,
    pin_hash,
    perfil_personalizado,
    perfil_nome,
    permissoes_json,
    created_at,
    updated_at
  FROM usuarios
  WHERE id = ?
  LIMIT 1
`);

const totalGerentesAtivosStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM usuarios
  WHERE role = 'GERENTE' AND ativo = 1
`);

function validarRole(role) {
  const roleNorm = String(role || "").toUpperCase().trim();
  if (!ROLES.includes(roleNorm)) {
    throw new Error("Perfil invalido. Use GARCOM ou GERENTE.");
  }
  return roleNorm;
}

function validarNome(nome) {
  const txt = String(nome || "").trim();
  if (!txt || txt.length < 2) {
    throw new Error("Informe um nome valido.");
  }
  return txt.slice(0, 90);
}

function validarApelido(apelido) {
  const txt = String(apelido || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  if (!txt || txt.length < 3) {
    throw new Error("Apelido invalido. Use ao menos 3 caracteres (a-z, 0-9, . _ -).");
  }
  return txt.slice(0, 32);
}

function validarPin(pin, campo = "PIN") {
  if (!pinValidoFormato(pin)) {
    throw new Error(`${campo} invalido. Use de 4 a 8 numeros.`);
  }
  return String(pin);
}

function normalizarPerfilNome(value) {
  return String(value || "")
    .trim()
    .slice(0, 60);
}

function parsePermissoesRaw(raw) {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

function resolverPerfilPermissoes({ payload = {}, role, usuarioAtual = null }) {
  const perfilPersonalizado =
    payload.perfil_personalizado === undefined
      ? Number(usuarioAtual?.perfil_personalizado || 0) === 1
      : Boolean(payload.perfil_personalizado);

  const perfilNome = perfilPersonalizado
    ? normalizarPerfilNome(payload.perfil_nome !== undefined ? payload.perfil_nome : usuarioAtual?.perfil_nome)
    : "";

  if (!perfilPersonalizado) {
    return {
      perfilPersonalizado: false,
      perfilNome: "",
      permissoesJson: null
    };
  }

  const origemPermissoes =
    payload.permissoes && typeof payload.permissoes === "object"
      ? payload.permissoes
      : parsePermissoesRaw(usuarioAtual?.permissoes_json);

  const mapaFinal = {
    ...mapaPermissoesPadraoPorRole(role),
    ...normalizarMapaPermissoes(origemPermissoes)
  };

  return {
    perfilPersonalizado: true,
    perfilNome,
    permissoesJson: JSON.stringify(mapaFinal)
  };
}

function mapUsuarioPublico(usuario) {
  const perfil = resolverPermissoesUsuario(usuario || {});
  return {
    id: usuario.id,
    nome: usuario.nome,
    apelido: usuario.apelido,
    role: usuario.role,
    ativo: Boolean(usuario.ativo),
    perfil_personalizado: perfil.perfil_personalizado,
    perfil_nome: perfil.perfil_nome,
    permissoes: perfil.permissoes,
    created_at: usuario.created_at,
    updated_at: usuario.updated_at
  };
}

const createUsuarioTx = db.transaction((payload = {}, authUser = null) => {
  const nome = validarNome(payload.nome);
  const apelido = validarApelido(payload.apelido);
  const role = validarRole(payload.role);
  const pin = validarPin(payload.pin, "PIN");
  const perfilInfo = resolverPerfilPermissoes({ payload, role });

  const salt = gerarSalt();
  const info = db
    .prepare(`
      INSERT INTO usuarios (
        nome,
        apelido,
        role,
        pin_salt,
        pin_hash,
        ativo,
        perfil_personalizado,
        perfil_nome,
        permissoes_json,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP)
    `)
    .run(
      nome,
      apelido,
      role,
      salt,
      hashPin(pin, salt),
      perfilInfo.perfilPersonalizado ? 1 : 0,
      perfilInfo.perfilNome || null,
      perfilInfo.permissoesJson
    );

  const usuario = usuarioByIdStmt.get(info.lastInsertRowid);

  AuditModel.registrar({
    usuario_id: authUser?.id ?? null,
    usuario_nome: authUser?.nome ?? null,
    role: authUser?.role ?? "GERENTE",
    acao: "USUARIO_CRIADO",
    entidade_tipo: "USUARIO",
    entidade_id: usuario.id,
    detalhes: {
      novo_usuario: {
        id: usuario.id,
        nome: usuario.nome,
        apelido: usuario.apelido,
        role: usuario.role,
        perfil_personalizado: perfilInfo.perfilPersonalizado
      }
    }
  });

  return mapUsuarioPublico(usuario);
});

const updateUsuarioTx = db.transaction((id, payload = {}, authUser = null) => {
  const usuario = usuarioByIdStmt.get(id);
  if (!usuario) {
    throw new Error("Usuario nao encontrado.");
  }

  const nome = payload.nome !== undefined ? validarNome(payload.nome) : usuario.nome;
  const apelido = payload.apelido !== undefined ? validarApelido(payload.apelido) : usuario.apelido;
  const role = payload.role !== undefined ? validarRole(payload.role) : usuario.role;
  const ativo = payload.ativo === undefined ? Number(usuario.ativo) : payload.ativo ? 1 : 0;
  const perfilInfo = resolverPerfilPermissoes({ payload, role, usuarioAtual: usuario });

  if (usuario.role === "GERENTE" && ativo === 0) {
    const totalGerentes = Number(totalGerentesAtivosStmt.get().total || 0);
    if (totalGerentes <= 1) {
      throw new Error("Nao e permitido desativar o unico gerente ativo.");
    }
  }

  let pinSalt = usuario.pin_salt;
  let pinHash = usuario.pin_hash;
  if (payload.pin !== undefined && payload.pin !== null && payload.pin !== "") {
    const novoPin = validarPin(payload.pin, "Novo PIN");
    pinSalt = gerarSalt();
    pinHash = hashPin(novoPin, pinSalt);
  }

  db.prepare(`
    UPDATE usuarios
    SET
      nome = ?,
      apelido = ?,
      role = ?,
      ativo = ?,
      pin_salt = ?,
      pin_hash = ?,
      perfil_personalizado = ?,
      perfil_nome = ?,
      permissoes_json = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    nome,
    apelido,
    role,
    ativo,
    pinSalt,
    pinHash,
    perfilInfo.perfilPersonalizado ? 1 : 0,
    perfilInfo.perfilNome || null,
    perfilInfo.permissoesJson,
    id
  );

  if (ativo === 0) {
    db.prepare(`
      UPDATE user_sessoes
      SET ativo = 0
      WHERE usuario_id = ?
    `).run(id);
  }

  const atualizado = usuarioByIdStmt.get(id);

  AuditModel.registrar({
    usuario_id: authUser?.id ?? null,
    usuario_nome: authUser?.nome ?? null,
    role: authUser?.role ?? "GERENTE",
    acao: "USUARIO_ATUALIZADO",
    entidade_tipo: "USUARIO",
    entidade_id: id,
    detalhes: {
      usuario: {
        id: atualizado.id,
        nome: atualizado.nome,
        apelido: atualizado.apelido,
        role: atualizado.role
      },
      ativo: Boolean(atualizado.ativo),
      perfil_personalizado: Number(atualizado.perfil_personalizado || 0) === 1,
      pin_alterado: payload.pin !== undefined && payload.pin !== null && payload.pin !== ""
    }
  });

  return mapUsuarioPublico(atualizado);
});

const UsuariosController = {
  listar(req, res) {
    try {
      const usuarios = usuariosListStmt.all().map(mapUsuarioPublico);
      res.json({ usuarios, catalogo_permissoes: CATALOGO_PERMISSOES });
    } catch (error) {
      res.status(500).json({ error: error.message || "Falha ao listar usuarios." });
    }
  },

  criar(req, res) {
    try {
      const usuario = createUsuarioTx(req.body || {}, req.authUser);
      res.status(201).json(usuario);
    } catch (error) {
      const message = String(error.message || "");
      if (message.includes("UNIQUE constraint failed")) {
        return res.status(400).json({ error: "Ja existe um usuario com esse apelido." });
      }
      return res.status(400).json({ error: message || "Falha ao criar usuario." });
    }
  },

  atualizar(req, res) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "ID de usuario invalido." });
      }
      const usuario = updateUsuarioTx(id, req.body || {}, req.authUser);
      return res.json(usuario);
    } catch (error) {
      const message = String(error.message || "");
      if (message.includes("UNIQUE constraint failed")) {
        return res.status(400).json({ error: "Ja existe um usuario com esse apelido." });
      }
      return res.status(400).json({ error: message || "Falha ao atualizar usuario." });
    }
  }
};

module.exports = UsuariosController;
