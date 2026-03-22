const db = require("../config/db");

const mesaByIdStmt = db.prepare("SELECT * FROM mesas WHERE id = ?");
const mesaByNumeroStmt = db.prepare("SELECT * FROM mesas WHERE numero = ?");
const maxMesaNumeroStmt = db.prepare("SELECT COALESCE(MAX(numero), 0) AS maximo FROM mesas");
const insertMesaStmt = db.prepare("INSERT INTO mesas (numero, status) VALUES (?, 'LIVRE')");

const pedidoByIdStmt = db.prepare("SELECT * FROM pedidos WHERE id = ?");
const pedidoAtivoByMesaStmt = db.prepare(`
  SELECT *
  FROM pedidos
  WHERE mesa_id = ? AND status IN ('ABERTO', 'FECHANDO')
  ORDER BY id DESC
  LIMIT 1
`);
const pedidoPagoByMesaStmt = db.prepare(`
  SELECT *
  FROM pedidos
  WHERE mesa_id = ? AND status = 'PAGO'
  ORDER BY id DESC
  LIMIT 1
`);
const produtoAtivoByIdStmt = db.prepare("SELECT * FROM produtos WHERE id = ? AND ativo = 1");
const itemByIdPedidoStmt = db.prepare(`
  SELECT *
  FROM itens_pedido
  WHERE id = ? AND pedido_id = ?
`);
const itemByPedidoProdutoStmt = db.prepare(`
  SELECT *
  FROM itens_pedido
  WHERE pedido_id = ? AND produto_id = ?
  LIMIT 1
`);
const itensByPedidoStmt = db.prepare(`
  SELECT *
  FROM itens_pedido
  WHERE pedido_id = ?
  ORDER BY id ASC
`);
const totalItensByPedidoStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM itens_pedido
  WHERE pedido_id = ?
`);
const subtotalByPedidoStmt = db.prepare(`
  SELECT COALESCE(SUM(total_item), 0) AS subtotal
  FROM itens_pedido
  WHERE pedido_id = ?
`);
const pagamentosByPedidoStmt = db.prepare(`
  SELECT
    id,
    pedido_id,
    forma_pagamento,
    valor,
    valor_recebido,
    troco
  FROM pedido_pagamentos
  WHERE pedido_id = ?
  ORDER BY id ASC
`);
const insertPagamentoPedidoStmt = db.prepare(`
  INSERT INTO pedido_pagamentos (pedido_id, forma_pagamento, valor, valor_recebido, troco)
  VALUES (?, ?, ?, ?, ?)
`);
const deletePagamentosByPedidoStmt = db.prepare(`
  DELETE FROM pedido_pagamentos
  WHERE pedido_id = ?
`);
const totalPedidosByMesaStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM pedidos
  WHERE mesa_id = ?
`);
const pedidosByMesaStmt = db.prepare(`
  SELECT id, status
  FROM pedidos
  WHERE mesa_id = ?
  ORDER BY id ASC
`);
const pedidoPagoByIdStmt = db.prepare(`
  SELECT *
  FROM pedidos
  WHERE id = ? AND status = 'PAGO'
  LIMIT 1
`);
const deleteTransacoesByPedidoStmt = db.prepare(`
  DELETE FROM transacoes
  WHERE pedido_id = ?
`);
const deleteItensByPedidoStmt = db.prepare(`
  DELETE FROM itens_pedido
  WHERE pedido_id = ?
`);
const deletePedidoByIdStmt = db.prepare(`
  DELETE FROM pedidos
  WHERE id = ?
`);
const totalPedidosPagosByMesaStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM pedidos
  WHERE mesa_id = ? AND status = 'PAGO'
`);
const TAXA_COUVERT_MAX = 200;
const TAXA_SERVICO_PADRAO = 10;
const TAXA_SERVICO_MAX = 30;

function toPositiveInt(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function parseMesaNumero(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Numero de mesa invalido.");
  }

  return parsed;
}

function normalizarTaxaPercent(value, fallback = TAXA_SERVICO_PADRAO) {
  if (value === undefined || value === null || value === "") {
    return Number(fallback);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > TAXA_SERVICO_MAX) {
    throw new Error(`Taxa de servico invalida. Use um valor entre 0 e ${TAXA_SERVICO_MAX}.`);
  }

  return Number(parsed.toFixed(2));
}

function normalizarCouvertUnitario(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return Number(fallback || 0);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > TAXA_COUVERT_MAX) {
    throw new Error(`Couvert artistico invalido. Use um valor entre 0 e ${TAXA_COUVERT_MAX}.`);
  }

  return Number(parsed.toFixed(2));
}

function resolverCouvert(payload = {}, pedido = null) {
  const unitarioAtual = normalizarCouvertUnitario(pedido?.couvert_artistico_unitario ?? 0, 0);
  const ativoAtual = Number(pedido?.cobrar_couvert_artistico || 0) === 1;

  if (payload.cobrar_couvert_artistico === false) {
    return {
      cobrar: false,
      unitario: 0
    };
  }

  const cobrar =
    payload.cobrar_couvert_artistico === true ||
    (payload.cobrar_couvert_artistico === undefined && ativoAtual);
  const unitario = normalizarCouvertUnitario(
    payload.couvert_artistico_unitario,
    unitarioAtual
  );

  return {
    cobrar,
    unitario: cobrar ? unitario : 0
  };
}

function resolverDividirPorPessoa(payload = {}, pedido = null) {
  const atual = Number(pedido?.dividir_por_pessoa || 0) === 1;
  if (payload.dividir_conta_por_pessoa === undefined) {
    return atual;
  }
  return payload.dividir_conta_por_pessoa === true;
}

function resolverTaxaPercent(payload = {}, pedido = null) {
  const taxaAtual = normalizarTaxaPercent(
    pedido?.taxa_servico_percent ?? TAXA_SERVICO_PADRAO,
    TAXA_SERVICO_PADRAO
  );

  if (payload.cobrar_taxa_servico === false) {
    return 0;
  }

  if (
    payload.cobrar_taxa_servico === true &&
    (payload.taxa_servico_percent === undefined ||
      payload.taxa_servico_percent === null ||
      payload.taxa_servico_percent === "")
  ) {
    return taxaAtual > 0 ? taxaAtual : TAXA_SERVICO_PADRAO;
  }

  if (payload.taxa_servico_percent !== undefined) {
    return normalizarTaxaPercent(payload.taxa_servico_percent, taxaAtual);
  }

  return taxaAtual;
}

function arredondar(valor) {
  return Number(Number(valor || 0).toFixed(2));
}

function normalizarNomeGarcomFechamento(value, fallback = "") {
  const bruto = value === undefined || value === null ? fallback : value;
  return String(bruto || "")
    .trim()
    .slice(0, 60);
}

function formaPagamentoValida(formaInput) {
  const forma = String(formaInput || "").toUpperCase();
  if (!["PIX", "CREDITO", "DEBITO", "DINHEIRO"].includes(forma)) {
    throw new Error("Forma de pagamento invalida.");
  }
  return forma;
}

function normalizarPagamentos(payload = {}, totalConta = 0) {
  const totalPedido = arredondar(totalConta);
  let pagamentos = [];

  if (Array.isArray(payload.pagamentos) && payload.pagamentos.length > 0) {
    pagamentos = payload.pagamentos;
  } else if (payload.forma_pagamento) {
    pagamentos = [
      {
        forma_pagamento: payload.forma_pagamento,
        valor: totalPedido
      }
    ];
  } else {
    throw new Error("Informe ao menos uma forma de pagamento.");
  }

  const agregado = new Map();
  for (const item of pagamentos) {
    const forma = formaPagamentoValida(item?.forma_pagamento || item?.forma);
    const valor = Number(item?.valor);

    if (!Number.isFinite(valor) || valor <= 0) {
      throw new Error("Valor de pagamento invalido.");
    }

    const acumulado = Number(agregado.get(forma) || 0);
    agregado.set(forma, arredondar(acumulado + valor));
  }

  const pagamentosNormalizados = Array.from(agregado.entries()).map(([forma_pagamento, valor]) => ({
    forma_pagamento,
    valor: arredondar(valor)
  }));

  if (pagamentosNormalizados.length < 1) {
    throw new Error("Nenhum pagamento valido informado.");
  }

  const totalInformado = arredondar(
    pagamentosNormalizados.reduce((acc, item) => acc + Number(item.valor || 0), 0)
  );
  if (Math.abs(totalInformado - totalPedido) > 0.05) {
    throw new Error("A soma dos pagamentos deve ser igual ao total da conta.");
  }

  const totalDinheiro = arredondar(
    pagamentosNormalizados
      .filter((item) => item.forma_pagamento === "DINHEIRO")
      .reduce((acc, item) => acc + Number(item.valor || 0), 0)
  );

  let valorRecebidoDinheiro = 0;
  let trocoTotal = 0;

  if (totalDinheiro > 0) {
    const recebidoInput =
      payload.valor_recebido_dinheiro !== undefined &&
      payload.valor_recebido_dinheiro !== null &&
      payload.valor_recebido_dinheiro !== ""
        ? payload.valor_recebido_dinheiro
        : payload.valor_recebido;

    const recebidoNumero =
      recebidoInput === undefined || recebidoInput === null || recebidoInput === ""
        ? totalDinheiro
        : Number(recebidoInput);

    if (!Number.isFinite(recebidoNumero)) {
      throw new Error("Informe o valor recebido em dinheiro.");
    }
    if (recebidoNumero < totalDinheiro) {
      throw new Error("Valor recebido em dinheiro e menor que o valor pago em dinheiro.");
    }

    valorRecebidoDinheiro = arredondar(recebidoNumero);
    trocoTotal = arredondar(valorRecebidoDinheiro - totalDinheiro);
  }

  const valorRecebidoTotal = arredondar(
    pagamentosNormalizados
      .filter((item) => item.forma_pagamento !== "DINHEIRO")
      .reduce((acc, item) => acc + Number(item.valor || 0), 0) + valorRecebidoDinheiro
  );

  const formaPrincipal =
    pagamentosNormalizados.length === 1 ? pagamentosNormalizados[0].forma_pagamento : "MISTO";

  const pagamentosDetalhados = pagamentosNormalizados.map((item) => {
    if (item.forma_pagamento === "DINHEIRO") {
      return {
        ...item,
        valor_recebido: valorRecebidoDinheiro,
        troco: trocoTotal
      };
    }

    return {
      ...item,
      valor_recebido: null,
      troco: 0
    };
  });

  return {
    forma_principal: formaPrincipal,
    pagamentos: pagamentosDetalhados,
    valor_recebido_total: valorRecebidoTotal,
    valor_recebido_dinheiro: valorRecebidoDinheiro,
    troco_total: trocoTotal
  };
}

function pagamentosFallbackPedido(pedido) {
  const forma = String(pedido?.forma_pagamento || "").toUpperCase();
  if (!forma || forma === "MISTO") return [];
  if (!["PIX", "CREDITO", "DEBITO", "DINHEIRO"].includes(forma)) return [];
  return [
    {
      forma_pagamento: forma,
      valor: arredondar(pedido?.total || 0),
      valor_recebido:
        forma === "DINHEIRO" ? arredondar(pedido?.valor_recebido ?? pedido?.total ?? 0) : null,
      troco: forma === "DINHEIRO" ? arredondar(pedido?.troco || 0) : 0
    }
  ];
}

function listarPagamentosPedido(pedido) {
  const pedidoId = Number(pedido?.id || 0);
  if (!Number.isFinite(pedidoId) || pedidoId < 1) return [];
  const lista = pagamentosByPedidoStmt.all(pedidoId);
  if (lista.length > 0) {
    return lista.map((item) => ({
      forma_pagamento: String(item.forma_pagamento || "").toUpperCase(),
      valor: arredondar(item.valor),
      valor_recebido:
        item.valor_recebido === null || item.valor_recebido === undefined
          ? null
          : arredondar(item.valor_recebido),
      troco: arredondar(item.troco)
    }));
  }
  return pagamentosFallbackPedido(pedido);
}

function mapaPagamentosPorPedidoIds(pedidoIds = []) {
  const ids = Array.from(
    new Set(
      (pedidoIds || [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );
  const mapa = new Map();
  if (ids.length < 1) return mapa;

  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(`
      SELECT
        pedido_id,
        forma_pagamento,
        valor,
        valor_recebido,
        troco
      FROM pedido_pagamentos
      WHERE pedido_id IN (${placeholders})
      ORDER BY id ASC
    `)
    .all(...ids);

  for (const row of rows) {
    const pedidoId = Number(row.pedido_id);
    if (!mapa.has(pedidoId)) mapa.set(pedidoId, []);
    mapa.get(pedidoId).push({
      forma_pagamento: String(row.forma_pagamento || "").toUpperCase(),
      valor: arredondar(row.valor),
      valor_recebido:
        row.valor_recebido === null || row.valor_recebido === undefined
          ? null
          : arredondar(row.valor_recebido),
      troco: arredondar(row.troco)
    });
  }

  return mapa;
}

function getPedidoFormatado(pedidoId) {
  const pedido = db
    .prepare(`
      SELECT
        *,
      ROUND(
        CASE
          WHEN COALESCE(dividir_por_pessoa, 0) = 1
          THEN total / CASE WHEN pessoas < 1 THEN 1 ELSE pessoas END
          ELSE 0
        END,
        2
      ) AS total_por_pessoa
      FROM pedidos
      WHERE id = ?
    `)
    .get(pedidoId);

  if (!pedido) return null;
  return {
    ...pedido,
    pagamentos: listarPagamentosPedido(pedido)
  };
}

function recalcularPedido(pedidoId, options = {}) {
  const pedido = pedidoByIdStmt.get(pedidoId);
  if (!pedido) {
    throw new Error("Pedido nao encontrado.");
  }

  const pessoasInput = options?.pessoas;
  const taxaPercentInput = options?.taxa_servico_percent;
  const dividirPorPessoa = resolverDividirPorPessoa(options, pedido);

  const subtotal = Number(subtotalByPedidoStmt.get(pedidoId).subtotal || 0);
  const subtotalArredondado = Number(subtotal.toFixed(2));
  const pessoas = toPositiveInt(pessoasInput, toPositiveInt(pedido.pessoas, 1));
  const taxaPercent = normalizarTaxaPercent(
    taxaPercentInput,
    pedido.taxa_servico_percent ?? TAXA_SERVICO_PADRAO
  );
  const couvertInfo = resolverCouvert(options, pedido);
  const couvertTotal = couvertInfo.cobrar
    ? Number((pessoas * Number(couvertInfo.unitario || 0)).toFixed(2))
    : 0;
  const taxaServicoValor = Number((subtotalArredondado * (taxaPercent / 100)).toFixed(2));
  const total = Number((subtotalArredondado + taxaServicoValor + couvertTotal).toFixed(2));

  db.prepare(`
    UPDATE pedidos
    SET subtotal = ?, taxa_servico_percent = ?, taxa_servico_valor = ?, couvert_artistico_unitario = ?, cobrar_couvert_artistico = ?, couvert_artistico_total = ?, total = ?, pessoas = ?, dividir_por_pessoa = ?
    WHERE id = ?
  `).run(
    subtotalArredondado,
    taxaPercent,
    taxaServicoValor,
    couvertInfo.unitario,
    couvertInfo.cobrar ? 1 : 0,
    couvertTotal,
    total,
    pessoas,
    dividirPorPessoa ? 1 : 0,
    pedidoId
  );

  return getPedidoFormatado(pedidoId);
}

function getMesaComPedido(mesaId) {
  const mesa = mesaByIdStmt.get(mesaId);
  if (!mesa) {
    throw new Error("Mesa nao encontrada.");
  }

  const pedido = pedidoAtivoByMesaStmt.get(mesaId);
  const itens = pedido ? itensByPedidoStmt.all(pedido.id) : [];

  return {
    mesa,
    pedido: pedido ? getPedidoFormatado(pedido.id) : null,
    itens
  };
}

const criarMesaTx = db.transaction((numeroInput) => {
  let numeroMesa = parseMesaNumero(numeroInput);

  if (numeroMesa === null) {
    numeroMesa = Number(maxMesaNumeroStmt.get().maximo || 0) + 1;
  }

  const existente = mesaByNumeroStmt.get(numeroMesa);
  if (existente) {
    throw new Error("Ja existe uma mesa com esse numero.");
  }

  const info = insertMesaStmt.run(numeroMesa);
  return mesaByIdStmt.get(info.lastInsertRowid);
});

function excluirPedidoCompleto(pedidoId, { restaurarEstoque = false } = {}) {
  if (restaurarEstoque) {
    const itens = itensByPedidoStmt.all(pedidoId);
    for (const item of itens) {
      db.prepare(`
        UPDATE produtos
        SET estoque = estoque + ?
        WHERE id = ?
      `).run(Number(item.quantidade || 0), item.produto_id);
    }
  }

  deleteTransacoesByPedidoStmt.run(pedidoId);
  deletePagamentosByPedidoStmt.run(pedidoId);
  deleteItensByPedidoStmt.run(pedidoId);
  deletePedidoByIdStmt.run(pedidoId);
}

const excluirMesaTx = db.transaction((mesaId, options = {}) => {
  const forcar = Boolean(options?.forcar);
  const mesa = mesaByIdStmt.get(mesaId);
  if (!mesa) {
    throw new Error("Mesa nao encontrada.");
  }

  const totalPagos = Number(totalPedidosPagosByMesaStmt.get(mesaId).total || 0);
  if (totalPagos > 0) {
    throw new Error("Mesa com historico pago nao pode ser excluida. Exclua o historico primeiro.");
  }

  if (mesa.status !== "LIVRE" && !forcar) {
    throw new Error("Mesa em uso. Use exclusao forcada para remover mesa aberta.");
  }

  const pedidosMesa = pedidosByMesaStmt.all(mesaId);
  for (const pedido of pedidosMesa) {
    const restaurarEstoque = String(pedido.status || "").toUpperCase() !== "PAGO";
    excluirPedidoCompleto(pedido.id, { restaurarEstoque });
  }

  db.prepare("DELETE FROM mesas WHERE id = ?").run(mesaId);

  return { ok: true, mesa_id: mesaId, forcar };
});

const abrirMesaTx = db.transaction((mesaId, clienteNome = "") => {
  const mesa = mesaByIdStmt.get(mesaId);
  if (!mesa) {
    throw new Error("Mesa nao encontrada.");
  }
  if (mesa.status !== "LIVRE") {
    throw new Error("A mesa ja esta em uso.");
  }

  db.prepare(`
    UPDATE mesas
    SET status = 'OCUPADA', cliente_nome = ?
    WHERE id = ?
  `).run(String(clienteNome || "").trim() || null, mesaId);

  db.prepare(`
    INSERT INTO pedidos (mesa_id, status)
    VALUES (?, 'ABERTO')
  `).run(mesaId);

  return getMesaComPedido(mesaId);
});

const adicionarItemTx = db.transaction((mesaId, produtoId, quantidade) => {
  const pedido = pedidoAtivoByMesaStmt.get(mesaId);
  if (!pedido) {
    throw new Error("Nao existe pedido ativo para esta mesa.");
  }

  const produto = produtoAtivoByIdStmt.get(produtoId);
  if (!produto) {
    throw new Error("Produto nao encontrado.");
  }

  const qtd = toPositiveInt(quantidade, 1);
  if (produto.estoque < qtd) {
    throw new Error(`Estoque insuficiente para ${produto.nome}.`);
  }

  const itemExistente = itemByPedidoProdutoStmt.get(pedido.id, produto.id);

  if (itemExistente) {
    const novaQuantidade = itemExistente.quantidade + qtd;
    const novoTotal = Number((novaQuantidade * itemExistente.preco_unitario).toFixed(2));

    db.prepare(`
      UPDATE itens_pedido
      SET quantidade = ?, total_item = ?
      WHERE id = ?
    `).run(novaQuantidade, novoTotal, itemExistente.id);
  } else {
    const precoUnitario = Number(produto.preco);
    const totalItem = Number((precoUnitario * qtd).toFixed(2));

    db.prepare(`
      INSERT INTO itens_pedido (
        pedido_id, produto_id, nome_produto, quantidade, preco_unitario, total_item
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      pedido.id,
      produto.id,
      produto.nome,
      qtd,
      precoUnitario,
      totalItem
    );
  }

  db.prepare(`
    UPDATE produtos
    SET estoque = estoque - ?
    WHERE id = ?
  `).run(qtd, produto.id);

  recalcularPedido(pedido.id);

  const produtoAtualizado = produtoAtivoByIdStmt.get(produto.id);

  return {
    ...getMesaComPedido(mesaId),
    alerta_estoque: Boolean(
      produtoAtualizado && produtoAtualizado.estoque <= produtoAtualizado.estoque_minimo
    )
  };
});

const atualizarQuantidadeItemTx = db.transaction((mesaId, itemId, novaQuantidade) => {
  const pedido = pedidoAtivoByMesaStmt.get(mesaId);
  if (!pedido) {
    throw new Error("Nao existe pedido ativo para esta mesa.");
  }

  const item = itemByIdPedidoStmt.get(itemId, pedido.id);
  if (!item) {
    throw new Error("Item nao encontrado.");
  }

  const qtdNova = toPositiveInt(novaQuantidade, item.quantidade);
  const diferenca = qtdNova - item.quantidade;

  if (diferenca > 0) {
    const produto = produtoAtivoByIdStmt.get(item.produto_id);
    if (!produto || produto.estoque < diferenca) {
      throw new Error("Estoque insuficiente para aumentar a quantidade.");
    }

    db.prepare(`
      UPDATE produtos
      SET estoque = estoque - ?
      WHERE id = ?
    `).run(diferenca, item.produto_id);
  }

  if (diferenca < 0) {
    db.prepare(`
      UPDATE produtos
      SET estoque = estoque + ?
      WHERE id = ?
    `).run(Math.abs(diferenca), item.produto_id);
  }

  const novoTotal = Number((qtdNova * item.preco_unitario).toFixed(2));

  db.prepare(`
    UPDATE itens_pedido
    SET quantidade = ?, total_item = ?
    WHERE id = ?
  `).run(qtdNova, novoTotal, item.id);

  recalcularPedido(pedido.id);

  const produtoAtualizado = produtoAtivoByIdStmt.get(item.produto_id);

  return {
    ...getMesaComPedido(mesaId),
    alerta_estoque: Boolean(
      produtoAtualizado && produtoAtualizado.estoque <= produtoAtualizado.estoque_minimo
    )
  };
});

const removerItemTx = db.transaction((mesaId, itemId) => {
  const pedido = pedidoAtivoByMesaStmt.get(mesaId);
  if (!pedido) {
    throw new Error("Nao existe pedido ativo para esta mesa.");
  }

  const item = itemByIdPedidoStmt.get(itemId, pedido.id);
  if (!item) {
    throw new Error("Item nao encontrado.");
  }

  db.prepare(`
    UPDATE produtos
    SET estoque = estoque + ?
    WHERE id = ?
  `).run(item.quantidade, item.produto_id);

  db.prepare(`
    DELETE FROM itens_pedido
    WHERE id = ?
  `).run(item.id);

  recalcularPedido(pedido.id);

  return getMesaComPedido(mesaId);
});

const fecharMesaTx = db.transaction((mesaId, payload = {}) => {
  const mesa = mesaByIdStmt.get(mesaId);
  if (!mesa) {
    throw new Error("Mesa nao encontrada.");
  }

  const pedido = pedidoAtivoByMesaStmt.get(mesaId);
  if (!pedido) {
    throw new Error("Nao existe pedido ativo para esta mesa.");
  }

  const totalItens = Number(totalItensByPedidoStmt.get(pedido.id).total || 0);
  if (totalItens < 1) {
    throw new Error("Nao e possivel fechar uma mesa sem itens.");
  }

  const pessoasFinal = toPositiveInt(payload.pessoas, toPositiveInt(pedido.pessoas, 1));
  const taxaServicoPercent = resolverTaxaPercent(payload, pedido);
  const couvertInfo = resolverCouvert(payload, pedido);
  const dividirPorPessoa = resolverDividirPorPessoa(payload, pedido);
  const nomeGarcomFechamento = normalizarNomeGarcomFechamento(
    payload.garcom_nome_fechamento,
    pedido.garcom_nome_fechamento
  );

  recalcularPedido(pedido.id, {
    pessoas: pessoasFinal,
    taxa_servico_percent: taxaServicoPercent,
    cobrar_couvert_artistico: couvertInfo.cobrar,
    couvert_artistico_unitario: couvertInfo.unitario,
    dividir_conta_por_pessoa: dividirPorPessoa
  });

  db.prepare(`
    UPDATE pedidos
    SET status = 'FECHANDO', pessoas = ?, taxa_servico_percent = ?, cobrar_couvert_artistico = ?, couvert_artistico_unitario = ?, dividir_por_pessoa = ?, garcom_nome_fechamento = ?
    WHERE id = ?
  `).run(
    pessoasFinal,
    taxaServicoPercent,
    couvertInfo.cobrar ? 1 : 0,
    couvertInfo.unitario,
    dividirPorPessoa ? 1 : 0,
    nomeGarcomFechamento || null,
    pedido.id
  );

  db.prepare(`
    UPDATE mesas
    SET status = 'FECHANDO'
    WHERE id = ?
  `).run(mesaId);

  return getMesaComPedido(mesaId);
});

const retomarFechamentoTx = db.transaction((mesaId) => {
  const mesa = mesaByIdStmt.get(mesaId);
  if (!mesa) {
    throw new Error("Mesa nao encontrada.");
  }

  const pedido = pedidoAtivoByMesaStmt.get(mesaId);
  if (!pedido) {
    throw new Error("Nao existe pedido ativo para esta mesa.");
  }

  if (pedido.status !== "FECHANDO") {
    throw new Error("A mesa nao esta em fechamento.");
  }

  db.prepare(`
    UPDATE pedidos
    SET status = 'ABERTO'
    WHERE id = ?
  `).run(pedido.id);

  db.prepare(`
    UPDATE mesas
    SET status = 'OCUPADA'
    WHERE id = ?
  `).run(mesaId);

  return getMesaComPedido(mesaId);
});

const pagarMesaTx = db.transaction((mesaId, payload = {}) => {
  const pedido = pedidoAtivoByMesaStmt.get(mesaId);
  if (!pedido) {
    throw new Error("Nao existe pedido ativo para esta mesa.");
  }

  if (pedido.status !== "FECHANDO") {
    throw new Error("Coloque a conta em fechamento antes de finalizar o pagamento.");
  }

  const pessoasFinal = toPositiveInt(payload.pessoas, toPositiveInt(pedido.pessoas, 1));
  const taxaServicoPercent = resolverTaxaPercent(payload, pedido);
  const couvertInfo = resolverCouvert(payload, pedido);
  const dividirPorPessoa = resolverDividirPorPessoa(payload, pedido);

  const pedidoAtualizado = recalcularPedido(pedido.id, {
    pessoas: pessoasFinal,
    taxa_servico_percent: taxaServicoPercent,
    cobrar_couvert_artistico: couvertInfo.cobrar,
    couvert_artistico_unitario: couvertInfo.unitario,
    dividir_conta_por_pessoa: dividirPorPessoa
  });

  if (Number(pedidoAtualizado.total || 0) <= 0) {
    throw new Error("Nao e possivel pagar uma conta com total zero.");
  }

  const pagamentoInfo = normalizarPagamentos(payload, pedidoAtualizado.total);

  db.prepare(`
    UPDATE pedidos
    SET
      status = 'PAGO',
      forma_pagamento = ?,
      valor_recebido = ?,
      troco = ?,
      pessoas = ?,
      dividir_por_pessoa = ?,
      closed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    pagamentoInfo.forma_principal,
    pagamentoInfo.valor_recebido_total,
    pagamentoInfo.troco_total,
    pessoasFinal,
    dividirPorPessoa ? 1 : 0,
    pedido.id
  );

  deletePagamentosByPedidoStmt.run(pedido.id);
  for (const item of pagamentoInfo.pagamentos) {
    insertPagamentoPedidoStmt.run(
      pedido.id,
      item.forma_pagamento,
      item.valor,
      item.valor_recebido,
      item.troco
    );
  }

  db.prepare(`
    UPDATE mesas
    SET status = 'LIVRE', cliente_nome = NULL, observacao = NULL
    WHERE id = ?
  `).run(mesaId);

  db.prepare(`
    INSERT INTO transacoes (pedido_id, tipo, forma_pagamento, valor, troco, observacao)
    VALUES (?, 'PAGAMENTO', ?, ?, ?, ?)
  `).run(
    pedido.id,
    pagamentoInfo.forma_principal,
    pedidoAtualizado.total,
    pagamentoInfo.troco_total,
    `Fechamento da mesa (${pagamentoInfo.pagamentos
      .map((item) => `${item.forma_pagamento}:${arredondar(item.valor)}`)
      .join(" | ")})`
  );

  return {
    pedido: getPedidoFormatado(pedido.id),
    troco: pagamentoInfo.troco_total,
    pagamentos: pagamentoInfo.pagamentos
  };
});

const excluirHistoricoTx = db.transaction((pedidoId) => {
  const pedido = pedidoPagoByIdStmt.get(pedidoId);
  if (!pedido) {
    throw new Error("Registro de historico nao encontrado.");
  }

  excluirPedidoCompleto(pedido.id, { restaurarEstoque: false });

  return {
    ok: true,
    pedido_id: pedido.id,
    mesa_id: pedido.mesa_id
  };
});

const reabrirMesaTx = db.transaction((mesaId) => {
  const mesa = mesaByIdStmt.get(mesaId);
  if (!mesa) {
    throw new Error("Mesa nao encontrada.");
  }

  const pedidoAtivo = pedidoAtivoByMesaStmt.get(mesaId);
  if (pedidoAtivo) {
    throw new Error("A mesa ja possui pedido ativo.");
  }

  const pedidoPago = pedidoPagoByMesaStmt.get(mesaId);
  if (!pedidoPago) {
    throw new Error("Nenhuma conta paga encontrada para reabrir.");
  }

  db.prepare(`
    UPDATE pedidos
    SET
      status = 'ABERTO',
      garcom_nome_fechamento = NULL,
      forma_pagamento = NULL,
      valor_recebido = NULL,
      troco = 0,
      closed_at = NULL,
      reopened_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(pedidoPago.id);

  deletePagamentosByPedidoStmt.run(pedidoPago.id);

  db.prepare(`
    UPDATE mesas
    SET status = 'OCUPADA'
    WHERE id = ?
  `).run(mesaId);

  db.prepare(`
    INSERT INTO transacoes (pedido_id, tipo, forma_pagamento, valor, troco, observacao)
    VALUES (?, 'ESTORNO', ?, ?, 0, ?)
  `).run(
    pedidoPago.id,
    pedidoPago.forma_pagamento,
    pedidoPago.total,
    "Estorno para reabertura da mesa"
  );

  db.prepare(`
    INSERT INTO transacoes (pedido_id, tipo, forma_pagamento, valor, troco, observacao)
    VALUES (?, 'REABERTURA', NULL, 0, 0, ?)
  `).run(pedidoPago.id, "Mesa reaberta para novo consumo");

  return getMesaComPedido(mesaId);
});

const MesaModel = {
  listarMesas() {
    return db
      .prepare(`
        SELECT
          m.id,
          m.numero,
          m.status,
          m.cliente_nome,
          p.id AS pedido_id,
          p.status AS pedido_status,
          COALESCE(p.total, 0) AS total,
          COALESCE(p.pessoas, 1) AS pessoas
        FROM mesas m
        LEFT JOIN pedidos p ON p.id = (
          SELECT id
          FROM pedidos
          WHERE mesa_id = m.id AND status IN ('ABERTO', 'FECHANDO')
          ORDER BY id DESC
          LIMIT 1
        )
        ORDER BY m.numero ASC
      `)
      .all();
  },

  criarMesa(numero) {
    return criarMesaTx(numero);
  },

  excluirMesa(mesaId) {
    return excluirMesaTx(mesaId);
  },

  excluirMesaForcada(mesaId) {
    return excluirMesaTx(mesaId, { forcar: true });
  },

  getMesaComPedido,

  abrirMesa(mesaId, clienteNome) {
    return abrirMesaTx(mesaId, clienteNome);
  },

  adicionarItem(mesaId, produtoId, quantidade) {
    return adicionarItemTx(mesaId, produtoId, quantidade);
  },

  atualizarQuantidadeItem(mesaId, itemId, novaQuantidade) {
    return atualizarQuantidadeItemTx(mesaId, itemId, novaQuantidade);
  },

  removerItem(mesaId, itemId) {
    return removerItemTx(mesaId, itemId);
  },

  fecharMesa(mesaId, payload) {
    return fecharMesaTx(mesaId, payload);
  },

  retomarFechamento(mesaId) {
    return retomarFechamentoTx(mesaId);
  },

  pagarMesa(mesaId, payload) {
    return pagarMesaTx(mesaId, payload);
  },

  reabrirMesa(mesaId) {
    return reabrirMesaTx(mesaId);
  },

  historico(filtroInput = null) {
    const filtroObj =
      filtroInput && typeof filtroInput === "object" && !Array.isArray(filtroInput)
        ? filtroInput
        : {
            data: typeof filtroInput === "string" ? filtroInput : null
          };

    const dataRef = String(filtroObj.data || "").trim() || null;
    const dataInicio = String(filtroObj.data_inicio || "").trim() || null;
    const dataFim = String(filtroObj.data_fim || "").trim() || null;

    const params = [];
    let filtroData = "";

    if (dataRef) {
      filtroData = "AND DATE(p.closed_at, 'localtime') = DATE(?)";
      params.push(dataRef);
    } else if (dataInicio && dataFim) {
      filtroData = "AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)";
      params.push(dataInicio, dataFim);
    } else if (dataInicio) {
      filtroData = "AND DATE(p.closed_at, 'localtime') = DATE(?)";
      params.push(dataInicio);
    } else if (dataFim) {
      filtroData = "AND DATE(p.closed_at, 'localtime') = DATE(?)";
      params.push(dataFim);
    }

    const registros = db
      .prepare(`
        SELECT
          p.id,
          p.mesa_id,
          m.numero AS mesa_numero,
          p.subtotal,
          p.taxa_servico_percent,
          p.taxa_servico_valor,
          p.cobrar_couvert_artistico,
          p.couvert_artistico_unitario,
          p.couvert_artistico_total,
          p.total,
          p.pessoas,
          p.dividir_por_pessoa,
          p.garcom_nome_fechamento,
          p.forma_pagamento,
          p.closed_at
        FROM pedidos p
        INNER JOIN mesas m ON m.id = p.mesa_id
        WHERE p.status = 'PAGO'
          ${filtroData}
        ORDER BY p.closed_at DESC
      `)
      .all(...params);

    const mapaPagamentos = mapaPagamentosPorPedidoIds(registros.map((item) => item.id));

    return registros.map((item) => {
      const pagamentos = mapaPagamentos.get(item.id) || pagamentosFallbackPedido(item);
      return {
        ...item,
        pagamentos
      };
    });
  },

  excluirHistorico(pedidoId) {
    return excluirHistoricoTx(pedidoId);
  }
};

module.exports = MesaModel;
