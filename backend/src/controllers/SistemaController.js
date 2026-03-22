const db = require("../config/db");
const AuditModel = require("../models/Audit");
const SistemaConfigModel = require("../models/SistemaConfig");
const BackupService = require("../services/backupService");
const { gerarSalt, hashPin } = require("../utils/security");
const SUPORTE_FIXO = {
  nome: "GastroCode Brasil",
  telefone: "31995172257",
  email: "guilherme.honoratos08@gmail.com",
  site: ""
};

const limparTudoTx = db.transaction(() => {
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    const deleteOrder = [
      "audit_logs",
      "user_sessoes",
      "caixa_movimentos",
      "pedido_pagamentos",
      "transacoes",
      "itens_pedido",
      "pedidos",
      "produtos",
      "mesas",
      "usuarios",
      "caixa_sessoes"
    ];

    for (const table of deleteOrder) {
      db.prepare(`DELETE FROM ${table}`).run();
    }

    db.prepare("DELETE FROM sqlite_sequence").run();
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
});

function inserirRows(table, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const colunasValidas = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((item) => String(item.name));
  if (colunasValidas.length === 0) return;

  const tx = db.transaction((rowsInput) => {
    for (const row of rowsInput) {
      const colunas = Object.keys(row || {}).filter((col) => colunasValidas.includes(col));
      if (colunas.length === 0) continue;
      const placeholders = colunas.map(() => "?").join(", ");
      const values = colunas.map((col) => row[col]);
      db.prepare(`INSERT INTO ${table} (${colunas.join(", ")}) VALUES (${placeholders})`).run(...values);
    }
  });

  tx(rows);
}

const restaurarBackupTx = db.transaction((backupData) => {
  const tables = backupData?.tables;
  if (!tables || typeof tables !== "object") {
    throw new Error("Arquivo de backup invalido.");
  }

  const tabelasOpcionais = new Set(["pedido_pagamentos"]);
  const faltando = BackupService.TABELAS_BACKUP.filter(
    (table) => !Array.isArray(tables[table]) && !tabelasOpcionais.has(table)
  );
  if (faltando.length > 0) {
    throw new Error(`Backup incompleto. Tabelas ausentes: ${faltando.join(", ")}`);
  }

  limparTudoTx();

  const insertOrder = [
    "mesas",
    "produtos",
    "pedidos",
    "itens_pedido",
    "transacoes",
    "pedido_pagamentos",
    "caixa_sessoes",
    "usuarios",
    "caixa_movimentos",
    "user_sessoes",
    "audit_logs"
  ];

  for (const table of insertOrder) {
    inserirRows(table, tables[table] || []);
  }
});

const resetarSistemaTx = db.transaction((options = {}) => {
  const criarMesasPadrao = Boolean(options?.criar_mesas_padrao);
  const criarProdutosPadrao = Boolean(options?.criar_produtos_padrao);

  limparTudoTx();

  const insertUsuario = db.prepare(`
    INSERT INTO usuarios (nome, apelido, role, pin_salt, pin_hash, ativo)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  const seedUsuario = (nome, apelido, role, pin) => {
    const salt = gerarSalt();
    insertUsuario.run(nome, apelido, role, salt, hashPin(pin, salt));
  };
  seedUsuario("Gerente", "gerente", "GERENTE", "1234");
  seedUsuario("Garcom", "garcom", "GARCOM", "1111");

  if (criarMesasPadrao) {
    const insertMesa = db.prepare("INSERT INTO mesas (numero) VALUES (?)");
    for (let i = 1; i <= 12; i += 1) {
      insertMesa.run(i);
    }
  }

  if (criarProdutosPadrao) {
    const insertProduto = db.prepare(`
      INSERT INTO produtos (nome, categoria, preco, estoque, estoque_minimo)
      VALUES (?, ?, ?, ?, ?)
    `);

    const seedProdutos = [
      ["Coca-Cola 350ml", "Bebidas", 6.5, 40, 8],
      ["Suco Natural", "Bebidas", 8.0, 20, 5],
      ["Agua", "Bebidas", 4.0, 30, 5],
      ["Hamburguer Artesanal", "Lanches", 28.0, 25, 5],
      ["Batata Frita", "Porcoes", 18.0, 18, 4],
      ["Pizza Calabresa", "Pizzas", 45.0, 12, 3],
      ["Pizza Frango", "Pizzas", 47.0, 10, 3],
      ["Brownie", "Sobremesas", 12.0, 15, 4]
    ];

    for (const item of seedProdutos) {
      insertProduto.run(...item);
    }
  }
});

function valorBooleano(value, fallback = false) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  if (typeof value === "boolean") return value;
  const txt = String(value).trim().toLowerCase();
  if (["1", "true", "sim", "on", "yes"].includes(txt)) return true;
  if (["0", "false", "nao", "não", "off", "no"].includes(txt)) return false;
  return Boolean(fallback);
}

function valorTexto(value, max = 140) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function valorInteiro(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const val = Math.round(n);
  return Math.max(min, Math.min(max, val));
}

function carregarConfigSistemaAtual() {
  return {
    onboarding_concluido: SistemaConfigModel.getBoolean("onboarding_concluido", false),
    backup_mirror_dir: SistemaConfigModel.get("backup_mirror_dir", ""),
    backup_retain_days: valorInteiro(
      SistemaConfigModel.getNumber("backup_retain_days", 30),
      30,
      7,
      365
    ),
    suporte_telefone: SUPORTE_FIXO.telefone,
    suporte_email: SUPORTE_FIXO.email,
    suporte_nome: SUPORTE_FIXO.nome,
    suporte_site: SUPORTE_FIXO.site
  };
}

function csvEscape(value) {
  const txt = String(value ?? "");
  return `"${txt.replaceAll('"', '""')}"`;
}

function validarPayloadBackup(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload de backup invalido.");
  }
  if (!payload.tables || typeof payload.tables !== "object") {
    throw new Error("Arquivo nao parece um backup valido do sistema.");
  }
}

const SistemaController = {
  backup(req, res) {
    try {
      const snapshot = BackupService.buildBackupSnapshot();
      AuditModel.registrar({
        usuario_id: req.authUser?.id ?? null,
        usuario_nome: req.authUser?.nome ?? null,
        role: req.role,
        acao: "BACKUP_EXPORTADO",
        entidade_tipo: "SISTEMA",
        entidade_id: "backup",
        detalhes: { tabelas: BackupService.TABELAS_BACKUP, criado_em: snapshot.meta.criado_em }
      });
      res.json(snapshot);
    } catch (error) {
      res.status(500).json({ error: error.message || "Falha ao gerar backup." });
    }
  },

  backupArquivo(req, res) {
    try {
      const snapshot = BackupService.buildBackupSnapshot();
      const arquivo = BackupService.salvarSnapshotArquivo(snapshot, "manual-backup");

      AuditModel.registrar({
        usuario_id: req.authUser?.id ?? null,
        usuario_nome: req.authUser?.nome ?? null,
        role: req.role,
        acao: "BACKUP_ARQUIVO_GERADO",
        entidade_tipo: "SISTEMA",
        entidade_id: "backup-arquivo",
        detalhes: { arquivo: arquivo.filename }
      });

      res.json({
        ok: true,
        arquivo: arquivo.filename,
        caminho: arquivo.full_path
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Falha ao gerar arquivo de backup." });
    }
  },

  listarBackups(req, res) {
    try {
      const limit = Number(req.query?.limit || 20);
      const backups = BackupService.listarBackups(limit);
      const config = carregarConfigSistemaAtual();
      return res.json({
        backups,
        diretorio: BackupService.BACKUPS_DIR,
        espelho_dir: config.backup_mirror_dir,
        retencao_dias: config.backup_retain_days
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Falha ao listar backups." });
    }
  },

  executarBackupAuto(req, res) {
    try {
      const force = Boolean(req.body?.force);
      const resultado = BackupService.executarBackupAutomatico({ force });
      AuditModel.registrar({
        usuario_id: req.authUser?.id ?? null,
        usuario_nome: req.authUser?.nome ?? null,
        role: req.role,
        acao: "BACKUP_AUTO_EXECUTADO_MANUAL",
        entidade_tipo: "SISTEMA",
        entidade_id: "backup-auto",
        detalhes: resultado
      });
      return res.json({
        ...resultado,
        espelho_dir: carregarConfigSistemaAtual().backup_mirror_dir,
        retencao_dias: carregarConfigSistemaAtual().backup_retain_days
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Falha ao executar backup automatico." });
    }
  },

  configuracoes(req, res) {
    try {
      return res.json({
        config: carregarConfigSistemaAtual()
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Falha ao carregar configuracoes do sistema." });
    }
  },

  atualizarConfiguracoes(req, res) {
    try {
      const body = req.body || {};
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "Payload invalido." });
      }

      const atual = carregarConfigSistemaAtual();
      const parcial = {};

      if ("onboarding_concluido" in body) {
        parcial.onboarding_concluido = valorBooleano(
          body.onboarding_concluido,
          atual.onboarding_concluido
        )
          ? "1"
          : "0";
      }

      if ("backup_mirror_dir" in body) {
        parcial.backup_mirror_dir = valorTexto(body.backup_mirror_dir, 360);
      }

      if ("backup_retain_days" in body) {
        parcial.backup_retain_days = String(valorInteiro(body.backup_retain_days, 30, 7, 365));
      }

      if (
        "suporte_telefone" in body ||
        "suporte_email" in body ||
        "suporte_nome" in body ||
        "suporte_site" in body
      ) {
        parcial.suporte_telefone = SUPORTE_FIXO.telefone;
        parcial.suporte_email = SUPORTE_FIXO.email;
        parcial.suporte_nome = SUPORTE_FIXO.nome;
        parcial.suporte_site = SUPORTE_FIXO.site;
      }

      if (Object.keys(parcial).length === 0) {
        return res.status(400).json({ error: "Nenhum campo valido para atualizar." });
      }

      SistemaConfigModel.setMany(parcial);
      const configAtualizada = carregarConfigSistemaAtual();

      AuditModel.registrar({
        usuario_id: req.authUser?.id ?? null,
        usuario_nome: req.authUser?.nome ?? null,
        role: req.role,
        acao: "SISTEMA_CONFIG_ATUALIZADA",
        entidade_tipo: "SISTEMA",
        entidade_id: "config",
        detalhes: { campos: Object.keys(parcial) }
      });

      return res.json({
        ok: true,
        config: configAtualizada
      });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Falha ao atualizar configuracoes do sistema." });
    }
  },

  restaurar(req, res) {
    try {
      const payload = req.body?.backup && typeof req.body.backup === "object" ? req.body.backup : req.body;
      validarPayloadBackup(payload);
      restaurarBackupTx(payload);

      AuditModel.registrar({
        usuario_id: req.authUser?.id ?? null,
        usuario_nome: req.authUser?.nome ?? null,
        role: req.role,
        acao: "BACKUP_RESTAURADO",
        entidade_tipo: "SISTEMA",
        entidade_id: "restore",
        detalhes: { restaurado_em: new Date().toISOString() }
      });

      return res.json({ ok: true, message: "Backup restaurado com sucesso." });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Falha ao restaurar backup." });
    }
  },

  restaurarArquivo(req, res) {
    try {
      const arquivo = String(req.body?.arquivo || "").trim();
      if (!arquivo) {
        return res.status(400).json({ error: "Informe o nome do arquivo de backup." });
      }

      const payload = BackupService.carregarSnapshotArquivo(arquivo);
      validarPayloadBackup(payload);
      restaurarBackupTx(payload);

      AuditModel.registrar({
        usuario_id: req.authUser?.id ?? null,
        usuario_nome: req.authUser?.nome ?? null,
        role: req.role,
        acao: "BACKUP_RESTAURADO_ARQUIVO",
        entidade_tipo: "SISTEMA",
        entidade_id: "restore-arquivo",
        detalhes: { arquivo, restaurado_em: new Date().toISOString() }
      });

      return res.json({
        ok: true,
        arquivo,
        message: "Backup restaurado com sucesso."
      });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Falha ao restaurar backup por arquivo." });
    }
  },

  auditoria(req, res) {
    try {
      const limit = Number(req.query?.limit || 200);
      const logs = AuditModel.listarRecentes(limit);
      return res.json({ logs });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Falha ao carregar auditoria." });
    }
  },

  exportarAuditoria(req, res) {
    try {
      const formato = String(req.query?.formato || "csv").trim().toLowerCase();
      const limit = Math.max(1, Math.min(5000, Number(req.query?.limit || 1500) || 1500));
      const logs = AuditModel.listarRecentes(limit).reverse();
      const agora = new Date().toISOString().slice(0, 19).replaceAll(":", "-");

      if (formato === "json") {
        return res.json({
          formato: "json",
          filename: `auditoria-${agora}.json`,
          total: logs.length,
          conteudo: JSON.stringify(logs, null, 2)
        });
      }

      const header = [
        "id",
        "created_at",
        "usuario_nome",
        "role",
        "acao",
        "metodo",
        "rota",
        "status_code",
        "entidade_tipo",
        "entidade_id",
        "detalhes_json"
      ];

      const linhas = logs.map((item) => [
        item.id,
        item.created_at,
        item.usuario_nome || "",
        item.role || "",
        item.acao || "",
        item.metodo || "",
        item.rota || "",
        item.status_code || "",
        item.entidade_tipo || "",
        item.entidade_id || "",
        item.detalhes ? JSON.stringify(item.detalhes) : ""
      ]);

      const conteudo = [header, ...linhas]
        .map((row) => row.map((cell) => csvEscape(cell)).join(","))
        .join("\n");

      return res.json({
        formato: "csv",
        filename: `auditoria-${agora}.csv`,
        total: logs.length,
        conteudo
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Falha ao exportar auditoria." });
    }
  },

  limparDados(req, res) {
    try {
      if (!req.body || req.body.confirmar !== true) {
        return res
          .status(400)
          .json({ error: "Confirmacao obrigatoria. Envie { confirmar: true }." });
      }

      const criarMesasPadrao = Boolean(req.body?.criar_mesas_padrao);
      const criarProdutosPadrao = Boolean(req.body?.criar_produtos_padrao);
      resetarSistemaTx({
        criar_mesas_padrao: criarMesasPadrao,
        criar_produtos_padrao: criarProdutosPadrao
      });

      AuditModel.registrar({
        usuario_id: req.authUser?.id ?? null,
        usuario_nome: req.authUser?.nome ?? null,
        role: req.role,
        acao: "SISTEMA_RESETADO",
        entidade_tipo: "SISTEMA",
        entidade_id: "reset",
        detalhes: {
          criar_mesas_padrao: criarMesasPadrao,
          criar_produtos_padrao: criarProdutosPadrao
        }
      });

      return res.json({
        ok: true,
        message: "Sistema limpo com sucesso.",
        logins_padrao: ["gerente/1234", "garcom/1111"],
        criar_mesas_padrao: criarMesasPadrao,
        criar_produtos_padrao: criarProdutosPadrao
      });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Falha ao limpar dados do sistema." });
    }
  }
};

module.exports = SistemaController;
