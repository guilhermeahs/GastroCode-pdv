const Database = require("better-sqlite3");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { gerarSalt, hashPin } = require("../utils/security");

function resolverDataDir() {
  const customDir = String(process.env.APPGESTAO_DATA_DIR || "").trim();
  if (customDir) {
    return path.resolve(customDir);
  }

  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "AppGestaoLoja");
  }

  return path.join(os.homedir(), ".appgestaoloja");
}

const dataDir = resolverDataDir();
fs.mkdirSync(dataDir, { recursive: true });
process.env.APPGESTAO_DATA_DIR = dataDir;

const dbPath = path.join(dataDir, "appgestao.db");
const legacyDbPath = path.resolve(__dirname, "../../../appgestao.db");
const importarDbLegado = String(process.env.APPGESTAO_IMPORT_LEGACY_DB || "1").trim() !== "0";
const desabilitarSeedExemplo = String(process.env.APPGESTAO_DISABLE_SAMPLE_SEED || "0").trim() === "1";

if (importarDbLegado && !fs.existsSync(dbPath) && fs.existsSync(legacyDbPath)) {
  fs.copyFileSync(legacyDbPath, dbPath);
}
process.env.APPGESTAO_DB_PATH = dbPath;

const db = new Database(dbPath);

db.pragma("foreign_keys = ON");
const SUPORTE_FIXO = {
  nome: "GastroCode Brasil",
  telefone: "31995172257",
  email: "guilherme.honoratos08@gmail.com",
  site: ""
};

db.exec(`
  CREATE TABLE IF NOT EXISTS mesas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero INTEGER NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'LIVRE' CHECK(status IN ('LIVRE', 'OCUPADA', 'FECHANDO')),
    cliente_nome TEXT,
    observacao TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    categoria TEXT NOT NULL,
    preco REAL NOT NULL,
    estoque INTEGER NOT NULL DEFAULT 0,
    estoque_minimo INTEGER NOT NULL DEFAULT 5,
    ativo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mesa_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'ABERTO' CHECK(status IN ('ABERTO', 'FECHANDO', 'PAGO')),
    subtotal REAL NOT NULL DEFAULT 0,
    taxa_servico_percent REAL NOT NULL DEFAULT 10,
    taxa_servico_valor REAL NOT NULL DEFAULT 0,
    cobrar_couvert_artistico INTEGER NOT NULL DEFAULT 0,
    couvert_artistico_unitario REAL NOT NULL DEFAULT 0,
    couvert_artistico_total REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    pessoas INTEGER NOT NULL DEFAULT 1,
    dividir_por_pessoa INTEGER NOT NULL DEFAULT 0,
    garcom_nome_fechamento TEXT,
    forma_pagamento TEXT,
    valor_recebido REAL,
    troco REAL NOT NULL DEFAULT 0,
    opened_at TEXT DEFAULT CURRENT_TIMESTAMP,
    closed_at TEXT,
    reopened_at TEXT,
    FOREIGN KEY (mesa_id) REFERENCES mesas(id)
  );

  CREATE TABLE IF NOT EXISTS itens_pedido (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    nome_produto TEXT NOT NULL,
    quantidade INTEGER NOT NULL,
    preco_unitario REAL NOT NULL,
    total_item REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
  );

  CREATE TABLE IF NOT EXISTS transacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('PAGAMENTO', 'ESTORNO', 'REABERTURA')),
    forma_pagamento TEXT,
    valor REAL NOT NULL DEFAULT 0,
    troco REAL NOT NULL DEFAULT 0,
    observacao TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  );

  CREATE TABLE IF NOT EXISTS pedido_pagamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    forma_pagamento TEXT NOT NULL CHECK(forma_pagamento IN ('PIX', 'CREDITO', 'DEBITO', 'DINHEIRO')),
    valor REAL NOT NULL DEFAULT 0,
    valor_recebido REAL,
    troco REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  );

  CREATE TABLE IF NOT EXISTS caixa_sessoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'ABERTO' CHECK(status IN ('ABERTO', 'FECHADO')),
    saldo_inicial REAL NOT NULL DEFAULT 0,
    saldo_contado REAL,
    diferenca_fechamento REAL,
    subtotal_produtos REAL NOT NULL DEFAULT 0,
    taxa_servico_total REAL NOT NULL DEFAULT 0,
    total_vendas REAL NOT NULL DEFAULT 0,
    vendas INTEGER NOT NULL DEFAULT 0,
    opened_at TEXT DEFAULT CURRENT_TIMESTAMP,
    closed_at TEXT,
    observacao TEXT
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    apelido TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('GARCOM', 'CAIXA', 'GERENTE')),
    pin_salt TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_sessoes (
    token TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    ativo INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS caixa_movimentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessao_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('ABERTURA', 'SANGRIA', 'SUPRIMENTO', 'RETIRADA')),
    valor REAL NOT NULL DEFAULT 0,
    justificativa TEXT,
    usuario_id INTEGER,
    usuario_nome TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sessao_id) REFERENCES caixa_sessoes(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    usuario_nome TEXT,
    role TEXT,
    acao TEXT NOT NULL,
    entidade_tipo TEXT,
    entidade_id TEXT,
    detalhes_json TEXT,
    metodo TEXT,
    rota TEXT,
    status_code INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE INDEX IF NOT EXISTS idx_pedidos_status_closed_at ON pedidos(status, closed_at);
  CREATE INDEX IF NOT EXISTS idx_pedido_pagamentos_pedido ON pedido_pagamentos(pedido_id, id);
  CREATE INDEX IF NOT EXISTS idx_user_sessoes_usuario_ativo ON user_sessoes(usuario_id, ativo);
  CREATE INDEX IF NOT EXISTS idx_caixa_movimentos_sessao ON caixa_movimentos(sessao_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_data ON audit_logs(created_at);

  CREATE TABLE IF NOT EXISTS sistema_config (
    chave TEXT PRIMARY KEY,
    valor TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS licenca_ativacao (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    status TEXT NOT NULL CHECK(status IN ('ATIVA', 'EXPIRADA', 'BLOQUEADA')),
    plano TEXT NOT NULL DEFAULT 'TRIAL',
    chave_hash TEXT NOT NULL,
    chave_mascara TEXT NOT NULL,
    dispositivo_id TEXT,
    dispositivo_nome TEXT,
    ativada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em TEXT,
    ultima_validacao_em TEXT,
    offline_tolerancia_dias INTEGER NOT NULL DEFAULT 7,
    observacao TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS motoboys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS motoboy_pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    motoboy_id INTEGER,
    numero TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'DESCONHECIDO',
    payment TEXT NOT NULL DEFAULT 'ONLINE',
    external_id TEXT,
    status TEXT NOT NULL DEFAULT 'RECEBIDO',
    detalhes_json TEXT,
    data_iso TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (motoboy_id) REFERENCES motoboys(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_motoboy_pedido_numero
    ON motoboy_pedidos(motoboy_id, numero);
  CREATE INDEX IF NOT EXISTS idx_motoboy_pedido_source_numero_data
    ON motoboy_pedidos(source, numero, data_iso);
  CREATE INDEX IF NOT EXISTS idx_motoboy_pedido_source_external
    ON motoboy_pedidos(source, external_id);
  CREATE INDEX IF NOT EXISTS idx_motoboy_pedidos_data
    ON motoboy_pedidos(data_iso);
  CREATE INDEX IF NOT EXISTS idx_motoboys_nome
    ON motoboys(nome);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((col) => String(col.name) === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("caixa_sessoes", "saldo_contado", "REAL");
ensureColumn("caixa_sessoes", "diferenca_fechamento", "REAL");
ensureColumn("pedidos", "cobrar_couvert_artistico", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("pedidos", "couvert_artistico_unitario", "REAL NOT NULL DEFAULT 0");
ensureColumn("pedidos", "couvert_artistico_total", "REAL NOT NULL DEFAULT 0");
ensureColumn("pedidos", "dividir_por_pessoa", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("pedidos", "garcom_nome_fechamento", "TEXT");
ensureColumn("usuarios", "perfil_personalizado", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("usuarios", "perfil_nome", "TEXT");
ensureColumn("usuarios", "permissoes_json", "TEXT");

function ensureMotoboyPedidosAllowsNullMotoboy() {
  const columns = db.prepare("PRAGMA table_info(motoboy_pedidos)").all();
  const motoboyIdCol = columns.find((col) => String(col.name) === "motoboy_id");
  if (!motoboyIdCol) return;
  if (Number(motoboyIdCol.notnull || 0) === 0) return;

  db.exec(`
    DROP INDEX IF EXISTS idx_motoboy_pedido_unico_numero;
    DROP INDEX IF EXISTS idx_motoboy_pedido_numero;
    DROP INDEX IF EXISTS idx_motoboy_pedido_source_numero_data;
    DROP INDEX IF EXISTS idx_motoboy_pedido_source_external;
    DROP INDEX IF EXISTS idx_motoboy_pedidos_data;

    ALTER TABLE motoboy_pedidos RENAME TO motoboy_pedidos_old;

    CREATE TABLE motoboy_pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      motoboy_id INTEGER,
      numero TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'DESCONHECIDO',
      payment TEXT NOT NULL DEFAULT 'ONLINE',
      external_id TEXT,
      status TEXT NOT NULL DEFAULT 'RECEBIDO',
      detalhes_json TEXT,
      data_iso TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (motoboy_id) REFERENCES motoboys(id) ON DELETE CASCADE
    );

    INSERT INTO motoboy_pedidos (
      id, motoboy_id, numero, source, payment, external_id, status, detalhes_json, data_iso, created_at
    )
    SELECT
      id,
      motoboy_id,
      numero,
      source,
      payment,
      NULL,
      'RECEBIDO',
      NULL,
      data_iso,
      created_at
    FROM motoboy_pedidos_old;

    DROP TABLE motoboy_pedidos_old;

    CREATE INDEX IF NOT EXISTS idx_motoboy_pedido_numero
      ON motoboy_pedidos(motoboy_id, numero);
    CREATE INDEX IF NOT EXISTS idx_motoboy_pedido_source_numero_data
      ON motoboy_pedidos(source, numero, data_iso);
    CREATE INDEX IF NOT EXISTS idx_motoboy_pedido_source_external
      ON motoboy_pedidos(source, external_id);
    CREATE INDEX IF NOT EXISTS idx_motoboy_pedidos_data
      ON motoboy_pedidos(data_iso);
  `);
}

function ensureMotoboyPedidoIndexes() {
  db.exec(`
    DROP INDEX IF EXISTS idx_motoboy_pedido_unico_numero;
    DROP INDEX IF EXISTS idx_motoboy_pedido_unico_dia_source_numero;
    CREATE INDEX IF NOT EXISTS idx_motoboy_pedido_numero
      ON motoboy_pedidos(motoboy_id, numero);
    CREATE INDEX IF NOT EXISTS idx_motoboy_pedido_source_numero_data
      ON motoboy_pedidos(source, numero, data_iso);
    CREATE INDEX IF NOT EXISTS idx_motoboy_pedido_source_external
      ON motoboy_pedidos(source, external_id);
  `);
}

ensureMotoboyPedidosAllowsNullMotoboy();
ensureColumn("motoboy_pedidos", "external_id", "TEXT");
ensureColumn("motoboy_pedidos", "status", "TEXT NOT NULL DEFAULT 'RECEBIDO'");
ensureColumn("motoboy_pedidos", "detalhes_json", "TEXT");
ensureMotoboyPedidoIndexes();

if (!desabilitarSeedExemplo) {
const totalMesas = db.prepare("SELECT COUNT(*) AS total FROM mesas").get().total;
if (totalMesas === 0) {
  const insertMesa = db.prepare("INSERT INTO mesas (numero) VALUES (?)");
  for (let i = 1; i <= 12; i += 1) {
    insertMesa.run(i);
  }
}

const totalProdutos = db.prepare("SELECT COUNT(*) AS total FROM produtos").get().total;
if (totalProdutos === 0) {
  const insertProduto = db.prepare(`
    INSERT INTO produtos (nome, categoria, preco, estoque, estoque_minimo)
    VALUES (?, ?, ?, ?, ?)
  `);

  const seed = [
    ["Coca-Cola 350ml", "Bebidas", 6.5, 40, 8],
    ["Suco Natural", "Bebidas", 8.0, 20, 5],
    ["Água", "Bebidas", 4.0, 30, 5],
    ["Hambúrguer Artesanal", "Lanches", 28.0, 25, 5],
    ["Batata Frita", "Porções", 18.0, 18, 4],
    ["Pizza Calabresa", "Pizzas", 45.0, 12, 3],
    ["Pizza Frango", "Pizzas", 47.0, 10, 3],
    ["Brownie", "Sobremesas", 12.0, 15, 4]
  ];

  for (const item of seed) {
    insertProduto.run(...item);
  }
}
}

const totalUsuarios = db.prepare("SELECT COUNT(*) AS total FROM usuarios").get().total;
if (totalUsuarios === 0) {
  const insertUsuario = db.prepare(`
    INSERT INTO usuarios (nome, apelido, role, pin_salt, pin_hash, ativo)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  function seedUsuario(nome, apelido, role, pin) {
    const salt = gerarSalt();
    insertUsuario.run(nome, apelido, role, salt, hashPin(pin, salt));
  }

  seedUsuario("Gerente", "gerente", "GERENTE", "1234");
  seedUsuario("Garcom", "garcom", "GARCOM", "1111");
}

db.prepare(`
  UPDATE user_sessoes
  SET ativo = 0
  WHERE usuario_id IN (
    SELECT id FROM usuarios WHERE role = 'CAIXA'
  )
`).run();

db.prepare(`
  UPDATE usuarios
  SET ativo = 0, updated_at = CURRENT_TIMESTAMP
  WHERE role = 'CAIXA' AND ativo = 1
`).run();

const upsertConfigStmt = db.prepare(`
  INSERT INTO sistema_config (chave, valor, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(chave) DO UPDATE SET
    valor = COALESCE(sistema_config.valor, excluded.valor),
    updated_at = CURRENT_TIMESTAMP
`);

upsertConfigStmt.run("onboarding_concluido", "0");
upsertConfigStmt.run("backup_mirror_dir", "");
upsertConfigStmt.run("backup_retain_days", "30");
upsertConfigStmt.run("suporte_telefone", SUPORTE_FIXO.telefone);
upsertConfigStmt.run("suporte_email", SUPORTE_FIXO.email);
upsertConfigStmt.run("suporte_nome", SUPORTE_FIXO.nome);
upsertConfigStmt.run("suporte_site", SUPORTE_FIXO.site);

db.prepare(`
  UPDATE sistema_config
  SET valor = ?, updated_at = CURRENT_TIMESTAMP
  WHERE chave = 'suporte_telefone'
`).run(SUPORTE_FIXO.telefone);

db.prepare(`
  UPDATE sistema_config
  SET valor = ?, updated_at = CURRENT_TIMESTAMP
  WHERE chave = 'suporte_email'
`).run(SUPORTE_FIXO.email);

db.prepare(`
  UPDATE sistema_config
  SET valor = ?, updated_at = CURRENT_TIMESTAMP
  WHERE chave = 'suporte_nome'
`).run(SUPORTE_FIXO.nome);

db.prepare(`
  UPDATE sistema_config
  SET valor = ?, updated_at = CURRENT_TIMESTAMP
  WHERE chave = 'suporte_site'
`).run(SUPORTE_FIXO.site);

module.exports = db;
