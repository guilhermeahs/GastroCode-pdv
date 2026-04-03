const db = require("../config/db");

const MOTOBOY_NUMBER_REGEX = /^(?:\d{3}|\d{4}|\d{6})$/;
const PEDIDO_SELECT_FIELDS = `
  id,
  motoboy_id,
  numero,
  source,
  payment,
  external_id,
  status,
  detalhes_json,
  data_iso,
  created_at
`;

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

const motoboyByNomeStmt = db.prepare(`
  SELECT id, nome, ativo, created_at, updated_at
  FROM motoboys
  WHERE lower(nome) = lower(?)
  LIMIT 1
`);

const pedidosByMotoboyStmt = db.prepare(`
  SELECT ${PEDIDO_SELECT_FIELDS}
  FROM motoboy_pedidos
  WHERE motoboy_id = ?
  ORDER BY datetime(data_iso) DESC, id DESC
`);

const pedidosPendentesStmt = db.prepare(`
  SELECT ${PEDIDO_SELECT_FIELDS}
  FROM motoboy_pedidos
  WHERE motoboy_id IS NULL
  ORDER BY datetime(data_iso) DESC, id DESC
`);

const pedidosNumerosExistentesStmt = db.prepare(`
  SELECT numero
  FROM motoboy_pedidos
  WHERE motoboy_id = ?
`);

const pedidoBySourceNumeroStmt = db.prepare(`
  SELECT ${PEDIDO_SELECT_FIELDS}
  FROM motoboy_pedidos
  WHERE lower(source) = lower(?)
    AND lower(numero) = lower(?)
  LIMIT 1
`);

const pedidoBySourceExternalIdStmt = db.prepare(`
  SELECT ${PEDIDO_SELECT_FIELDS}
  FROM motoboy_pedidos
  WHERE lower(source) = lower(?)
    AND lower(external_id) = lower(?)
  LIMIT 1
`);

const pedidoByMotoboyNumeroStmt = db.prepare(`
  SELECT ${PEDIDO_SELECT_FIELDS}
  FROM motoboy_pedidos
  WHERE motoboy_id = ?
    AND lower(numero) = lower(?)
  LIMIT 1
`);

const pedidoPendenteByNumeroStmt = db.prepare(`
  SELECT ${PEDIDO_SELECT_FIELDS}
  FROM motoboy_pedidos
  WHERE motoboy_id IS NULL
    AND lower(numero) = lower(?)
  ORDER BY id DESC
  LIMIT 1
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
  INSERT INTO motoboy_pedidos (
    motoboy_id,
    numero,
    source,
    payment,
    external_id,
    status,
    detalhes_json,
    data_iso
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const updatePedidoByIdStmt = db.prepare(`
  UPDATE motoboy_pedidos
  SET motoboy_id = ?,
      source = ?,
      payment = ?,
      external_id = ?,
      status = ?,
      detalhes_json = ?,
      data_iso = ?
  WHERE id = ?
`);

const pedidoByIdStmt = db.prepare(`
  SELECT ${PEDIDO_SELECT_FIELDS}
  FROM motoboy_pedidos
  WHERE id = ?
  LIMIT 1
`);

const deletePedidoStmt = db.prepare(`
  DELETE FROM motoboy_pedidos
  WHERE id = ?
`);

const pedidosTotaisCountStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM motoboy_pedidos
`);

const pedidosPendentesCountStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM motoboy_pedidos
  WHERE motoboy_id IS NULL
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

function normalizarNumeroPedidoIntegracao(numero) {
  const text = String(numero || "").trim();
  if (!text || text.length > 80) {
    throw new Error("Pedido de integracao invalido.");
  }

  if (!/^[A-Za-z0-9._/#-]{2,80}$/.test(text)) {
    throw new Error("Pedido de integracao invalido.");
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

function normalizarPagamentoEntrega(value) {
  const text = String(value || "ONLINE")
    .trim()
    .toUpperCase();
  if (!text) return "ONLINE";
  return text.slice(0, 20);
}

function normalizarStatusPedido(value, fallback = "RECEBIDO") {
  const text = String(value || fallback)
    .trim()
    .toUpperCase();
  if (!text) return String(fallback || "RECEBIDO").trim().toUpperCase();
  return text.slice(0, 40);
}

function serializarDetalhesPedido(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    try {
      JSON.parse(text);
      return text;
    } catch {
      return JSON.stringify({ raw: text });
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function parseDetalhesPedido(value) {
  if (value === undefined || value === null || value === "") return null;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function hydratePedido(row) {
  if (!row || typeof row !== "object") return row;
  const detalhes = parseDetalhesPedido(row.detalhes_json);
  return {
    ...row,
    source: String(row.source || "DESCONHECIDO").toUpperCase(),
    payment: normalizarPagamentoEntrega(row.payment || "ONLINE"),
    external_id: String(row.external_id || "").trim(),
    status: normalizarStatusPedido(row.status || "RECEBIDO"),
    detalhes_json: row.detalhes_json ? String(row.detalhes_json) : "",
    detalhes: detalhes || undefined
  };
}

function filtrarMotoboys(lista = [], q = "") {
  const query = String(q || "")
    .trim()
    .toLowerCase();
  if (!query) return lista;

  return lista.filter((motoboy) => {
    const byNome = String(motoboy.nome || "").toLowerCase().includes(query);
    if (byNome) return true;
    return (motoboy.pedidos || []).some((pedido) => {
      const numero = String(pedido.numero || "").toLowerCase();
      const externalId = String(pedido.external_id || "").toLowerCase();
      const status = String(pedido.status || "").toLowerCase();
      const detalhes = pedido.detalhes && typeof pedido.detalhes === "object" ? pedido.detalhes : {};
      const clienteNome = String(detalhes?.customer?.nome || detalhes?.customer?.name || "").toLowerCase();
      const clienteDocumento = String(detalhes?.customer?.documento || "").toLowerCase();
      return (
        numero.includes(query) ||
        externalId.includes(query) ||
        status.includes(query) ||
        clienteNome.includes(query) ||
        clienteDocumento.includes(query)
      );
    });
  });
}

function filtrarPendentes(lista = [], q = "") {
  const query = String(q || "")
    .trim()
    .toLowerCase();
  if (!query) return lista;
  return lista.filter((pedido) => {
    const numero = String(pedido.numero || "").toLowerCase();
    const source = String(pedido.source || "").toLowerCase();
    const payment = String(pedido.payment || "").toLowerCase();
    const externalId = String(pedido.external_id || "").toLowerCase();
    const status = String(pedido.status || "").toLowerCase();
    const detalhes = pedido.detalhes && typeof pedido.detalhes === "object" ? pedido.detalhes : {};
    const clienteNome = String(detalhes?.cliente?.nome || detalhes?.customer_name || "").toLowerCase();
    const clienteDocumento = String(detalhes?.cliente?.documento || detalhes?.customer_document || "").toLowerCase();
    return (
      numero.includes(query) ||
      source.includes(query) ||
      payment.includes(query) ||
      externalId.includes(query) ||
      status.includes(query) ||
      clienteNome.includes(query) ||
      clienteDocumento.includes(query)
    );
  });
}

function garantirMotoboyAtivo(id) {
  const motoboyId = Number(id);
  if (!Number.isFinite(motoboyId)) {
    throw new Error("Motoboy invalido.");
  }

  const motoboy = motoboyByIdStmt.get(motoboyId);
  if (!motoboy || Number(motoboy.ativo || 0) !== 1) {
    throw new Error("Motoboy nao encontrado.");
  }
  return motoboy;
}

function resolverMotoboyIntegracao(nomeRaw) {
  const nome = String(nomeRaw || "").trim();
  if (!nome) return null;

  const nomeNormalizado = normalizarNome(nome);
  let motoboy = motoboyByNomeStmt.get(nomeNormalizado);
  if (!motoboy) {
    const insertInfo = insertMotoboyStmt.run(nomeNormalizado);
    motoboy = motoboyByIdStmt.get(insertInfo.lastInsertRowid);
  } else if (Number(motoboy.ativo || 0) !== 1) {
    updateMotoboyStmt.run(motoboy.nome, 1, motoboy.id);
    motoboy = motoboyByIdStmt.get(motoboy.id);
  }
  return motoboy || null;
}

const EntregaModel = {
  listarMotoboys(query = "") {
    const motoboys = motoboysAtivosStmt.all();

    const lista = motoboys.map((motoboy) => ({
      ...motoboy,
      pedidos: pedidosByMotoboyStmt.all(motoboy.id).map(hydratePedido)
    }));

    return filtrarMotoboys(lista, query);
  },

  listarPendentes(query = "") {
    const lista = pedidosPendentesStmt.all().map(hydratePedido);
    return filtrarPendentes(lista, query);
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
    const motoboy = garantirMotoboyAtivo(motoboyId);
    const id = Number(motoboy.id);

    const pedidosEntrada = Array.isArray(payload.pedidos) ? payload.pedidos : [];
    if (pedidosEntrada.length < 1) {
      throw new Error("Informe ao menos um pedido para adicionar.");
    }

    const existentesNoMotoboy = new Set(
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
          if (existentesNoMotoboy.has(chave)) {
            duplicados.push(numero);
            continue;
          }

          const source = String(item?.source || classificarOrigem(numero))
            .trim()
            .toUpperCase();
          const payment = normalizarPagamentoEntrega(item?.payment || "ONLINE");
          const dataIso = normalizarDataIso(item?.whenISO || payload.whenISO || "");

          const pendente = pedidoPendenteByNumeroStmt.get(numero);
          if (pendente) {
            updatePedidoByIdStmt.run(
              id,
              source || String(pendente.source || "DESCONHECIDO").toUpperCase(),
              payment || String(pendente.payment || "ONLINE").toUpperCase(),
              String(pendente.external_id || "").trim() || null,
              normalizarStatusPedido(pendente.status || "RECEBIDO"),
              serializarDetalhesPedido(pendente.detalhes_json) || null,
              dataIso || pendente.data_iso,
              pendente.id
            );
            adicionados.push(hydratePedido(pedidoByIdStmt.get(pendente.id)));
          } else {
            const info = insertPedidoStmt.run(
              id,
              numero,
              source || "DESCONHECIDO",
              payment || "ONLINE",
              null,
              "MANUAL",
              null,
              dataIso
            );
            adicionados.push(hydratePedido(pedidoByIdStmt.get(info.lastInsertRowid)));
          }

          existentesNoMotoboy.add(chave);
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

  upsertPedidosIntegracao(payload = {}) {
    const pedidosEntrada = Array.isArray(payload.pedidos) ? payload.pedidos : [];
    if (pedidosEntrada.length < 1) {
      return {
        motoboy_id: null,
        addedCount: 0,
        updatedCount: 0,
        totalProcessado: 0,
        skippedDuplicates: [],
        invalid: [],
        pedidos: []
      };
    }

    const motoboy = resolverMotoboyIntegracao(payload.motoboy || payload.nome || "");
    const targetMotoboyId = motoboy ? Number(motoboy.id) : null;

    const invalidos = [];
    const duplicados = [];
    const adicionados = [];
    let updatedCount = 0;
    let totalProcessado = 0;

    const tx = db.transaction(() => {
      for (const item of pedidosEntrada) {
        const numeroRaw = String(item?.numero || "").trim();
        try {
          const numero = normalizarNumeroPedidoIntegracao(numeroRaw);
          const source = String(item?.source || "DESCONHECIDO")
            .trim()
            .toUpperCase()
            .slice(0, 24);
          const payment = normalizarPagamentoEntrega(item?.payment || "ONLINE");
          const dataIso = normalizarDataIso(item?.whenISO || item?.dataISO || "");
          const externalId = String(
            item?.external_id || item?.externalId || item?.order_id || item?.orderId || ""
          )
            .trim()
            .slice(0, 120);
          const status = normalizarStatusPedido(item?.status || item?.order_status || "RECEBIDO");
          const detalhesJson = serializarDetalhesPedido(
            item?.detalhes_json ?? item?.detalhes ?? item?.details ?? item?.payload ?? null
          );

          const existenteByExternal =
            externalId && source
              ? pedidoBySourceExternalIdStmt.get(source || "DESCONHECIDO", externalId)
              : null;
          const existente = existenteByExternal || pedidoBySourceNumeroStmt.get(source || "DESCONHECIDO", numero);
          if (existente) {
            const motoboyDestino =
              existente.motoboy_id === null || existente.motoboy_id === undefined
                ? targetMotoboyId
                : Number(existente.motoboy_id);

            const detalhesFinal = detalhesJson || serializarDetalhesPedido(existente.detalhes_json) || null;
            updatePedidoByIdStmt.run(
              Number.isFinite(motoboyDestino) ? motoboyDestino : null,
              source || "DESCONHECIDO",
              payment || "ONLINE",
              externalId || String(existente.external_id || "").trim() || null,
              status || normalizarStatusPedido(existente.status || "RECEBIDO"),
              detalhesFinal,
              dataIso,
              existente.id
            );
            updatedCount += 1;
            duplicados.push(numero);
          } else {
            const info = insertPedidoStmt.run(
              Number.isFinite(targetMotoboyId) ? targetMotoboyId : null,
              numero,
              source || "DESCONHECIDO",
              payment || "ONLINE",
              externalId || null,
              status || "RECEBIDO",
              detalhesJson || null,
              dataIso
            );
            adicionados.push(hydratePedido(pedidoByIdStmt.get(info.lastInsertRowid)));
          }
          totalProcessado += 1;
        } catch {
          if (numeroRaw) {
            invalidos.push(numeroRaw);
          }
        }
      }
    });

    tx();

    return {
      motoboy_id: Number.isFinite(targetMotoboyId) ? targetMotoboyId : null,
      addedCount: adicionados.length,
      updatedCount,
      totalProcessado,
      skippedDuplicates: duplicados,
      invalid: invalidos,
      pedidos: adicionados
    };
  },

  atribuirPedido(motoboyId, pedidoId, payload = {}) {
    const motoboy = garantirMotoboyAtivo(motoboyId);
    const pedido = pedidoByIdStmt.get(Number(pedidoId));
    if (!pedido) {
      throw new Error("Pedido nao encontrado.");
    }

    const conflito = pedidoByMotoboyNumeroStmt.get(motoboy.id, pedido.numero);
    if (conflito && Number(conflito.id) !== Number(pedido.id)) {
      throw new Error(`Pedido #${pedido.numero} ja existe nesse motoboy.`);
    }

    const source = String(payload?.source || pedido.source || "DESCONHECIDO")
      .trim()
      .toUpperCase()
      .slice(0, 24);
    const payment = normalizarPagamentoEntrega(payload?.payment || pedido.payment || "ONLINE");
    const dataIso = normalizarDataIso(payload?.whenISO || payload?.dataISO || pedido.data_iso || "");

    updatePedidoByIdStmt.run(
      Number(motoboy.id),
      source || "DESCONHECIDO",
      payment || "ONLINE",
      String(pedido.external_id || "").trim() || null,
      normalizarStatusPedido(pedido.status || "RECEBIDO"),
      serializarDetalhesPedido(pedido.detalhes_json) || null,
      dataIso,
      pedido.id
    );
    return hydratePedido(pedidoByIdStmt.get(pedido.id));
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
    return hydratePedido(pedido);
  },

  resumo() {
    const motoboys = motoboysAtivosStmt.all();
    const totalPedidos = Number(pedidosTotaisCountStmt.get()?.total || 0);
    const pendentes = Number(pedidosPendentesCountStmt.get()?.total || 0);

    return {
      motoboys: motoboys.length,
      pedidos: totalPedidos,
      pendentes
    };
  }
};

module.exports = EntregaModel;
