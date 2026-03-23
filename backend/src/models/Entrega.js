const db = require("../config/db");

const MOTOBOY_NUMBER_REGEX = /^(?:\d{3}|\d{4}|\d{6})$/;

const motoboyByIdStmt = db.prepare(`
  SELECT id, nome, ativo, created_at, updated_at
  FROM motoboys
  WHERE id = ?
  LIMIT 1
`);

const motoboysAtivosStmt = db.prepare(`
  SELECT id, nome, ativo, created_at, updated_at
  FROM motoboys
  WHERE ativo = 1
  ORDER BY nome COLLATE NOCASE ASC, id ASC
`);

const pedidosByMotoboyStmt = db.prepare(`
  SELECT id, motoboy_id, numero, source, payment, data_iso, created_at
  FROM motoboy_pedidos
  WHERE motoboy_id = ?
  ORDER BY datetime(data_iso) ASC, id ASC
`);

const pedidosNumerosExistentesStmt = db.prepare(`
  SELECT numero
  FROM motoboy_pedidos
  WHERE motoboy_id = ?
`);

const insertMotoboyStmt = db.prepare(`
  INSERT INTO motoboys (nome, ativo)
  VALUES (?, 1)
`);

const updateMotoboyStmt = db.prepare(`
  UPDATE motoboys
  SET nome = ?, ativo = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const deleteMotoboyStmt = db.prepare(`
  DELETE FROM motoboys
  WHERE id = ?
`);

const insertPedidoStmt = db.prepare(`
  INSERT INTO motoboy_pedidos (motoboy_id, numero, source, payment, data_iso)
  VALUES (?, ?, ?, ?, ?)
`);

const pedidoByIdStmt = db.prepare(`
  SELECT id, motoboy_id, numero, source, payment, data_iso, created_at
  FROM motoboy_pedidos
  WHERE id = ?
  LIMIT 1
`);

const deletePedidoStmt = db.prepare(`
  DELETE FROM motoboy_pedidos
  WHERE id = ?
`);

function classificarOrigem(numero) {
  const n = String(numero || "").trim();
  if (/^\d{3}$/.test(n)) return "ANOTA_AI";
  if (/^\d{4}$/.test(n)) return "IFOOD";
  if (/^\d{6}$/.test(n)) return "NINENINE";
  return "DESCONHECIDO";
}

function validarTexto(value, field, minLen = 1) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < minLen) {
    throw new Error(`Informe ${field}.`);
  }
  return text;
}

function normalizarNome(nome) {
  return validarTexto(nome, "nome do motoboy").slice(0, 80);
}

function normalizarNumeroPedido(numero) {
  const text = String(numero || "").trim();
  if (!MOTOBOY_NUMBER_REGEX.test(text)) {
    throw new Error("Pedido invalido. Use 3, 4 ou 6 digitos.");
  }
  return text;
}

function normalizarDataIso(value) {
  if (value === undefined || value === null || value === "") {
    return new Date().toISOString();
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Data/hora do pedido invalida.");
  }
  return parsed.toISOString();
}

function filtrarMotoboys(lista = [], q = "") {
  const query = String(q || "")
    .trim()
    .toLowerCase();
  if (!query) return lista;

  return lista.filter((motoboy) => {
    const byNome = String(motoboy.nome || "").toLowerCase().includes(query);
    if (byNome) return true;
    return (motoboy.pedidos || []).some((pedido) =>
      String(pedido.numero || "")
        .toLowerCase()
        .includes(query)
    );
  });
}

const EntregaModel = {
  listarMotoboys(query = "") {
    const motoboys = motoboysAtivosStmt.all();

    const lista = motoboys.map((motoboy) => ({
      ...motoboy,
      pedidos: pedidosByMotoboyStmt.all(motoboy.id)
    }));

    return filtrarMotoboys(lista, query);
  },

  criarMotoboy(dados = {}) {
    const nome = normalizarNome(dados.nome);
    const info = insertMotoboyStmt.run(nome);
    return motoboyByIdStmt.get(info.lastInsertRowid);
  },

  atualizarMotoboy(id, dados = {}) {
    const motoboyId = Number(id);
    if (!Number.isFinite(motoboyId)) {
      throw new Error("Motoboy invalido.");
    }

    const atual = motoboyByIdStmt.get(motoboyId);
    if (!atual) {
      throw new Error("Motoboy nao encontrado.");
    }

    const nome = dados.nome !== undefined ? normalizarNome(dados.nome) : atual.nome;
    const ativo = dados.ativo === undefined ? Number(atual.ativo || 1) : dados.ativo ? 1 : 0;
    updateMotoboyStmt.run(nome, ativo, motoboyId);
    return motoboyByIdStmt.get(motoboyId);
  },

  excluirMotoboy(id) {
    const motoboyId = Number(id);
    if (!Number.isFinite(motoboyId)) {
      throw new Error("Motoboy invalido.");
    }

    const atual = motoboyByIdStmt.get(motoboyId);
    if (!atual) {
      throw new Error("Motoboy nao encontrado.");
    }

    deleteMotoboyStmt.run(motoboyId);
    return { ok: true, motoboy_id: motoboyId };
  },

  adicionarPedidosLote(motoboyId, payload = {}) {
    const id = Number(motoboyId);
    if (!Number.isFinite(id)) {
      throw new Error("Motoboy invalido.");
    }

    const motoboy = motoboyByIdStmt.get(id);
    if (!motoboy || Number(motoboy.ativo || 0) !== 1) {
      throw new Error("Motoboy nao encontrado.");
    }

    const pedidosEntrada = Array.isArray(payload.pedidos) ? payload.pedidos : [];
    if (pedidosEntrada.length < 1) {
      throw new Error("Informe ao menos um pedido para adicionar.");
    }

    const existentes = new Set(
      pedidosNumerosExistentesStmt
        .all(id)
        .map((item) => String(item.numero || "").trim().toLowerCase())
    );

    const invalidos = [];
    const duplicados = [];
    const adicionados = [];

    const tx = db.transaction(() => {
      for (const item of pedidosEntrada) {
        const numeroRaw = String(item?.numero || "").trim();
        try {
          const numero = normalizarNumeroPedido(numeroRaw);
          const chave = numero.toLowerCase();
          if (existentes.has(chave)) {
            duplicados.push(numero);
            continue;
          }

          const source = String(item?.source || classificarOrigem(numero))
            .trim()
            .toUpperCase();
          const payment = String(item?.payment || "ONLINE")
            .trim()
            .toUpperCase()
            .slice(0, 20);
          const dataIso = normalizarDataIso(item?.whenISO || payload.whenISO || "");

          const info = insertPedidoStmt.run(id, numero, source || "DESCONHECIDO", payment || "ONLINE", dataIso);
          adicionados.push(pedidoByIdStmt.get(info.lastInsertRowid));
          existentes.add(chave);
        } catch {
          if (numeroRaw) {
            invalidos.push(numeroRaw);
          }
        }
      }
    });

    tx();

    return {
      motoboy_id: id,
      addedCount: adicionados.length,
      skippedDuplicates: duplicados,
      invalid: invalidos,
      pedidos: adicionados
    };
  },

  removerPedido(pedidoId) {
    const id = Number(pedidoId);
    if (!Number.isFinite(id)) {
      throw new Error("Pedido invalido.");
    }

    const pedido = pedidoByIdStmt.get(id);
    if (!pedido) {
      throw new Error("Pedido nao encontrado.");
    }

    deletePedidoStmt.run(id);
    return pedido;
  },

  resumo() {
    const motoboys = motoboysAtivosStmt.all();
    let totalPedidos = 0;
    for (const motoboy of motoboys) {
      const pedidos = pedidosByMotoboyStmt.all(motoboy.id);
      totalPedidos += pedidos.length;
    }

    return {
      motoboys: motoboys.length,
      pedidos: totalPedidos
    };
  }
};

module.exports = EntregaModel;
