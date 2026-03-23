const db = require("../config/db");
const ProdutoModel = require("../models/Produto");

const caixaAbertoStmt = db.prepare(`
  SELECT *
  FROM caixa_sessoes
  WHERE status = 'ABERTO'
  ORDER BY id DESC
  LIMIT 1
`);

const ultimaSessaoFechadaStmt = db.prepare(`
  SELECT *
  FROM caixa_sessoes
  WHERE status = 'FECHADO'
  ORDER BY id DESC
  LIMIT 1
`);

const caixaByIdStmt = db.prepare(`
  SELECT *
  FROM caixa_sessoes
  WHERE id = ?
`);

const inserirMovimentoCaixaStmt = db.prepare(`
  INSERT INTO caixa_movimentos (sessao_id, tipo, valor, justificativa, usuario_id, usuario_nome)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const listarMovimentosSessaoStmt = db.prepare(`
  SELECT id, sessao_id, tipo, valor, justificativa, usuario_id, usuario_nome, created_at
  FROM caixa_movimentos
  WHERE sessao_id = ?
  ORDER BY id DESC
`);

const totalMovimentosSessaoStmt = db.prepare(`
  SELECT
    tipo,
    ROUND(COALESCE(SUM(valor), 0), 2) AS total
  FROM caixa_movimentos
  WHERE sessao_id = ?
  GROUP BY tipo
`);

function normalizarDataRef(dataInput) {
  if (dataInput === undefined || dataInput === null || dataInput === "") {
    return null;
  }

  const value = String(dataInput).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Data invalida. Use o formato YYYY-MM-DD.");
  }

  return value;
}

function normalizarIntervaloDatas(query = {}) {
  const dataRef = normalizarDataRef(query?.data);
  const dataInicio = normalizarDataRef(query?.data_inicio);
  const dataFim = normalizarDataRef(query?.data_fim);

  if (dataRef && (dataInicio || dataFim)) {
    throw new Error("Use 'data' ou 'data_inicio/data_fim', nao os dois juntos.");
  }

  if (dataRef) {
    return {
      inicio: dataRef,
      fim: dataRef
    };
  }

  if (dataInicio && !dataFim) {
    return {
      inicio: dataInicio,
      fim: dataInicio
    };
  }

  if (!dataInicio && dataFim) {
    return {
      inicio: dataFim,
      fim: dataFim
    };
  }

  if (dataInicio && dataFim) {
    if (dataInicio > dataFim) {
      throw new Error("Data inicial nao pode ser maior que a data final.");
    }
    return {
      inicio: dataInicio,
      fim: dataFim
    };
  }

  return {
    inicio: null,
    fim: null
  };
}

function normalizarPeriodoDias(value, fallback = 30) {
  const dias = Number(value);
  if (!Number.isFinite(dias)) return fallback;
  return Math.max(1, Math.min(365, Math.round(dias)));
}

function filtroDataSql(intervalo = {}, coluna = "p.closed_at") {
  if (intervalo?.inicio && intervalo?.fim) {
    return {
      clause: `DATE(${coluna}, 'localtime') BETWEEN DATE(?) AND DATE(?)`,
      params: [intervalo.inicio, intervalo.fim]
    };
  }

  return {
    clause: `DATE(${coluna}, 'localtime') = DATE('now', 'localtime')`,
    params: []
  };
}

function obterResumoPorData(intervalo = {}) {
  const filtro = filtroDataSql(intervalo, "p.closed_at");

  const caixaHoje = db
    .prepare(`
      SELECT
        ROUND(COALESCE(SUM(p.total), 0), 2) AS faturamento_total,
        ROUND(COALESCE(SUM(p.subtotal), 0), 2) AS subtotal_produtos,
        ROUND(COALESCE(SUM(p.taxa_servico_valor), 0), 2) AS taxa_servico_total,
        COUNT(*) AS vendas
      FROM pedidos p
      WHERE p.status = 'PAGO'
        AND ${filtro.clause}
    `)
    .get(...filtro.params);

  const faturamentoPorForma = db
    .prepare(`
      SELECT
        base.forma_pagamento,
        ROUND(COALESCE(SUM(base.valor), 0), 2) AS total
      FROM (
        SELECT
          pp.forma_pagamento AS forma_pagamento,
          pp.valor AS valor
        FROM pedido_pagamentos pp
        INNER JOIN pedidos p ON p.id = pp.pedido_id
        WHERE p.status = 'PAGO'
          AND ${filtro.clause}

        UNION ALL

        SELECT
          p.forma_pagamento AS forma_pagamento,
          p.total AS valor
        FROM pedidos p
        WHERE p.status = 'PAGO'
          AND ${filtro.clause}
          AND p.forma_pagamento IS NOT NULL
          AND p.forma_pagamento <> 'MISTO'
          AND NOT EXISTS (
            SELECT 1
            FROM pedido_pagamentos pp2
            WHERE pp2.pedido_id = p.id
          )
      ) base
      GROUP BY base.forma_pagamento
      ORDER BY total DESC
    `)
    .all(...filtro.params, ...filtro.params);

  const produtosMaisVendidos = db
    .prepare(`
      SELECT
        ip.nome_produto,
        SUM(ip.quantidade) AS quantidade,
        ROUND(SUM(ip.total_item), 2) AS faturamento
      FROM itens_pedido ip
      INNER JOIN pedidos p ON p.id = ip.pedido_id
      WHERE p.status = 'PAGO'
        AND ${filtro.clause}
      GROUP BY ip.nome_produto
      ORDER BY quantidade DESC, faturamento DESC
      LIMIT 5
    `)
    .all(...filtro.params);

  const dataHoje = db.prepare("SELECT DATE('now', 'localtime') AS data").get().data;
  const dataInicio = intervalo?.inicio || dataHoje;
  const dataFim = intervalo?.fim || dataHoje;

  return {
    data_referencia: dataInicio === dataFim ? dataInicio : null,
    data_inicio: dataInicio,
    data_fim: dataFim,
    caixaHoje,
    faturamentoPorForma,
    produtosMaisVendidos,
    estoqueBaixo: ProdutoModel.estoqueBaixo()
  };
}

function obterResumoPeriodo(openedAtUtc) {
  const params = [openedAtUtc];

  const caixa = db
    .prepare(`
      SELECT
        ROUND(COALESCE(SUM(p.total), 0), 2) AS faturamento_total,
        ROUND(COALESCE(SUM(p.subtotal), 0), 2) AS subtotal_produtos,
        ROUND(COALESCE(SUM(p.taxa_servico_valor), 0), 2) AS taxa_servico_total,
        COUNT(*) AS vendas
      FROM pedidos p
      WHERE p.status = 'PAGO'
        AND DATETIME(p.closed_at) >= DATETIME(?)
        AND DATETIME(p.closed_at) <= DATETIME('now')
    `)
    .get(...params);

  const faturamentoPorForma = db
    .prepare(`
      SELECT
        base.forma_pagamento,
        ROUND(COALESCE(SUM(base.valor), 0), 2) AS total
      FROM (
        SELECT
          pp.forma_pagamento AS forma_pagamento,
          pp.valor AS valor
        FROM pedido_pagamentos pp
        INNER JOIN pedidos p ON p.id = pp.pedido_id
        WHERE p.status = 'PAGO'
          AND DATETIME(p.closed_at) >= DATETIME(?)
          AND DATETIME(p.closed_at) <= DATETIME('now')

        UNION ALL

        SELECT
          p.forma_pagamento AS forma_pagamento,
          p.total AS valor
        FROM pedidos p
        WHERE p.status = 'PAGO'
          AND DATETIME(p.closed_at) >= DATETIME(?)
          AND DATETIME(p.closed_at) <= DATETIME('now')
          AND p.forma_pagamento IS NOT NULL
          AND p.forma_pagamento <> 'MISTO'
          AND NOT EXISTS (
            SELECT 1
            FROM pedido_pagamentos pp2
            WHERE pp2.pedido_id = p.id
          )
      ) base
      GROUP BY base.forma_pagamento
      ORDER BY total DESC
    `)
    .all(...params, ...params);

  return {
    caixa,
    faturamentoPorForma
  };
}

function montarResumoCaixaAberto(sessao) {
  if (!sessao) return null;
  const resumoPeriodo = obterResumoPeriodo(sessao.opened_at);
  const caixaPeriodo = resumoPeriodo?.caixa || {};

  return {
    periodo_inicio: sessao.opened_at,
    periodo_fim: null,
    caixa: {
      faturamento_total: Number(caixaPeriodo.faturamento_total || 0),
      subtotal_produtos: Number(caixaPeriodo.subtotal_produtos || 0),
      taxa_servico_total: Number(caixaPeriodo.taxa_servico_total || 0),
      vendas: Number(caixaPeriodo.vendas || 0)
    },
    faturamentoPorForma: Array.isArray(resumoPeriodo?.faturamentoPorForma)
      ? resumoPeriodo.faturamentoPorForma
      : []
  };
}

function obterDataLocalHojeIso() {
  return db.prepare("SELECT DATE('now', 'localtime') AS data").get().data;
}

function parseIsoDate(iso) {
  const txt = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txt)) {
    throw new Error("Data invalida. Use o formato YYYY-MM-DD.");
  }
  const [ano, mes, dia] = txt.split("-").map((item) => Number(item));
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function toIsoDate(dateObj) {
  return new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function addDaysIso(iso, deltaDias) {
  const base = parseIsoDate(iso);
  base.setUTCDate(base.getUTCDate() + Number(deltaDias || 0));
  return toIsoDate(base);
}

function primeiroDiaMesIso(iso) {
  const data = parseIsoDate(iso);
  return toIsoDate(new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1)));
}

function faixaMesAnteriorEquivalente(dataFinalIso) {
  const dataFinal = parseIsoDate(dataFinalIso);
  const ano = dataFinal.getUTCFullYear();
  const mes = dataFinal.getUTCMonth();
  const dia = dataFinal.getUTCDate();

  const inicioMesAnterior = new Date(Date.UTC(ano, mes - 1, 1));
  const ultimoDiaMesAnterior = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const diaFinalMesAnterior = Math.min(dia, ultimoDiaMesAnterior);
  const fimMesAnterior = new Date(
    Date.UTC(inicioMesAnterior.getUTCFullYear(), inicioMesAnterior.getUTCMonth(), diaFinalMesAnterior)
  );

  return {
    inicio: toIsoDate(inicioMesAnterior),
    fim: toIsoDate(fimMesAnterior)
  };
}

function obterResumoIntervalo(dataInicioIso, dataFimIso) {
  const resumo = db
    .prepare(`
      SELECT
        ROUND(COALESCE(SUM(p.total), 0), 2) AS faturamento_total,
        ROUND(COALESCE(SUM(p.subtotal), 0), 2) AS subtotal_produtos,
        ROUND(COALESCE(SUM(p.taxa_servico_valor), 0), 2) AS taxa_servico_total,
        COUNT(*) AS vendas
      FROM pedidos p
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
    `)
    .get(dataInicioIso, dataFimIso);

  const vendas = Number(resumo?.vendas || 0);
  const faturamento = Number(resumo?.faturamento_total || 0);
  const ticketMedio = vendas > 0 ? Number((faturamento / vendas).toFixed(2)) : 0;

  return {
    faturamento_total: faturamento,
    subtotal_produtos: Number(resumo?.subtotal_produtos || 0),
    taxa_servico_total: Number(resumo?.taxa_servico_total || 0),
    vendas,
    ticket_medio: ticketMedio
  };
}

function montarComparativo(dataFinalIso) {
  const diaAtualInicio = dataFinalIso;
  const diaAtualFim = dataFinalIso;
  const diaAnteriorInicio = addDaysIso(dataFinalIso, -1);
  const diaAnteriorFim = diaAnteriorInicio;

  const semanaAtualInicio = addDaysIso(dataFinalIso, -6);
  const semanaAtualFim = dataFinalIso;
  const semanaAnteriorInicio = addDaysIso(dataFinalIso, -13);
  const semanaAnteriorFim = addDaysIso(dataFinalIso, -7);

  const mesAtualInicio = primeiroDiaMesIso(dataFinalIso);
  const mesAtualFim = dataFinalIso;
  const mesAnterior = faixaMesAnteriorEquivalente(dataFinalIso);

  return {
    referencia_data_final: dataFinalIso,
    dia: {
      periodo_atual: { inicio: diaAtualInicio, fim: diaAtualFim },
      periodo_anterior: { inicio: diaAnteriorInicio, fim: diaAnteriorFim },
      atual: obterResumoIntervalo(diaAtualInicio, diaAtualFim),
      anterior: obterResumoIntervalo(diaAnteriorInicio, diaAnteriorFim)
    },
    semana: {
      periodo_atual: { inicio: semanaAtualInicio, fim: semanaAtualFim },
      periodo_anterior: { inicio: semanaAnteriorInicio, fim: semanaAnteriorFim },
      atual: obterResumoIntervalo(semanaAtualInicio, semanaAtualFim),
      anterior: obterResumoIntervalo(semanaAnteriorInicio, semanaAnteriorFim)
    },
    mes: {
      periodo_atual: { inicio: mesAtualInicio, fim: mesAtualFim },
      periodo_anterior: { inicio: mesAnterior.inicio, fim: mesAnterior.fim },
      atual: obterResumoIntervalo(mesAtualInicio, mesAtualFim),
      anterior: obterResumoIntervalo(mesAnterior.inicio, mesAnterior.fim)
    }
  };
}

function obterRelatoriosGerenciais({ dias = 30, dataFinal = null }) {
  const periodoDias = normalizarPeriodoDias(dias, 30);
  const dataRef = normalizarDataRef(dataFinal);
  const dataFinalAtual = dataRef || obterDataLocalHojeIso();
  const dataInicialAtual = addDaysIso(dataFinalAtual, -(periodoDias - 1));

  const resumoRaw = db
    .prepare(`
      SELECT
        ROUND(COALESCE(SUM(p.total), 0), 2) AS faturamento_total,
        ROUND(COALESCE(SUM(p.subtotal), 0), 2) AS subtotal_produtos,
        ROUND(COALESCE(SUM(p.taxa_servico_valor), 0), 2) AS taxa_servico_total,
        ROUND(COALESCE(SUM(COALESCE(p.couvert_artistico_total, 0)), 0), 2) AS couvert_total,
        COUNT(*) AS vendas,
        ROUND(COALESCE(SUM(CASE WHEN COALESCE(p.couvert_artistico_total, 0) > 0 THEN 1 ELSE 0 END), 0), 0) AS pedidos_com_couvert,
        ROUND(COALESCE(SUM(COALESCE(p.pessoas, 0)), 0), 0) AS pessoas_atendidas,
        ROUND(COALESCE(AVG(CASE
          WHEN p.closed_at IS NOT NULL AND p.opened_at IS NOT NULL
          THEN (julianday(p.closed_at) - julianday(p.opened_at)) * 24 * 60
          ELSE NULL
        END), 0), 1) AS tempo_medio_minutos
      FROM pedidos p
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
    `)
    .get(dataInicialAtual, dataFinalAtual);

  const itensVendidosRow = db
    .prepare(`
      SELECT
        ROUND(COALESCE(SUM(ip.quantidade), 0), 0) AS itens_vendidos
      FROM itens_pedido ip
      INNER JOIN pedidos p ON p.id = ip.pedido_id
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
    `)
    .get(dataInicialAtual, dataFinalAtual);

  const faturamentoTotal = Number(resumoRaw?.faturamento_total || 0);
  const vendasTotal = Number(resumoRaw?.vendas || 0);
  const ticketMedio = vendasTotal > 0 ? Number((faturamentoTotal / vendasTotal).toFixed(2)) : 0;

  const resumo = {
    faturamento_total: faturamentoTotal,
    subtotal_produtos: Number(resumoRaw?.subtotal_produtos || 0),
    taxa_servico_total: Number(resumoRaw?.taxa_servico_total || 0),
    couvert_total: Number(resumoRaw?.couvert_total || 0),
    vendas: vendasTotal,
    ticket_medio: ticketMedio,
    itens_vendidos: Number(itensVendidosRow?.itens_vendidos || 0),
    pessoas_atendidas: Number(resumoRaw?.pessoas_atendidas || 0),
    tempo_medio_minutos: Number(resumoRaw?.tempo_medio_minutos || 0),
    pedidos_com_couvert: Number(resumoRaw?.pedidos_com_couvert || 0)
  };

  const pagamentosPorFormaBase = db
    .prepare(`
      SELECT
        base.forma_pagamento,
        ROUND(COALESCE(SUM(base.valor), 0), 2) AS total,
        COUNT(DISTINCT base.pedido_id) AS vendas
      FROM (
        SELECT
          pp.pedido_id AS pedido_id,
          pp.forma_pagamento AS forma_pagamento,
          pp.valor AS valor
        FROM pedido_pagamentos pp
        INNER JOIN pedidos p ON p.id = pp.pedido_id
        WHERE p.status = 'PAGO'
          AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)

        UNION ALL

        SELECT
          p.id AS pedido_id,
          p.forma_pagamento AS forma_pagamento,
          p.total AS valor
        FROM pedidos p
        WHERE p.status = 'PAGO'
          AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
          AND p.forma_pagamento IS NOT NULL
          AND p.forma_pagamento <> 'MISTO'
          AND NOT EXISTS (
            SELECT 1
            FROM pedido_pagamentos pp2
            WHERE pp2.pedido_id = p.id
          )
      ) base
      GROUP BY base.forma_pagamento
      ORDER BY total DESC
    `)
    .all(dataInicialAtual, dataFinalAtual, dataInicialAtual, dataFinalAtual);

  const pagamentosPorForma = pagamentosPorFormaBase.map((item) => {
    const total = Number(item.total || 0);
    const vendas = Number(item.vendas || 0);
    return {
      forma_pagamento: item.forma_pagamento || "NAO_INFORMADO",
      total,
      vendas,
      ticket_medio: vendas > 0 ? Number((total / vendas).toFixed(2)) : 0,
      percentual_faturamento:
        faturamentoTotal > 0 ? Number(((total / faturamentoTotal) * 100).toFixed(2)) : 0
    };
  });

  const faturamentoPorForma = pagamentosPorForma.map((item) => ({
    forma_pagamento: item.forma_pagamento,
    total: item.total
  }));

  const vendasPorDia = db
    .prepare(`
      SELECT
        DATE(p.closed_at, 'localtime') AS data,
        ROUND(COALESCE(SUM(p.total), 0), 2) AS total,
        ROUND(COALESCE(SUM(p.subtotal), 0), 2) AS subtotal,
        ROUND(COALESCE(SUM(p.taxa_servico_valor), 0), 2) AS taxa_servico,
        COUNT(*) AS vendas
      FROM pedidos p
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
      GROUP BY DATE(p.closed_at, 'localtime')
      ORDER BY DATE(p.closed_at, 'localtime') ASC
    `)
    .all(dataInicialAtual, dataFinalAtual);

  const vendasPorHora = db
    .prepare(`
      SELECT
        CAST(STRFTIME('%H', p.closed_at, 'localtime') AS INTEGER) AS hora,
        ROUND(COALESCE(SUM(p.total), 0), 2) AS total,
        COUNT(*) AS vendas
      FROM pedidos p
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
      GROUP BY CAST(STRFTIME('%H', p.closed_at, 'localtime') AS INTEGER)
      ORDER BY hora ASC
    `)
    .all(dataInicialAtual, dataFinalAtual)
    .map((item) => {
      const vendas = Number(item.vendas || 0);
      const total = Number(item.total || 0);
      return {
        hora: Number(item.hora || 0),
        total,
        vendas,
        ticket_medio: vendas > 0 ? Number((total / vendas).toFixed(2)) : 0
      };
    });

  const topProdutos = db
    .prepare(`
      SELECT
        ip.nome_produto,
        SUM(ip.quantidade) AS quantidade,
        ROUND(SUM(ip.total_item), 2) AS faturamento
      FROM itens_pedido ip
      INNER JOIN pedidos p ON p.id = ip.pedido_id
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
      GROUP BY ip.nome_produto
      ORDER BY faturamento DESC, quantidade DESC, ip.nome_produto ASC
    `)
    .all(dataInicialAtual, dataFinalAtual);

  const topCategorias = db
    .prepare(`
      SELECT
        COALESCE(pr.categoria, 'Sem categoria') AS categoria,
        SUM(ip.quantidade) AS quantidade,
        ROUND(SUM(ip.total_item), 2) AS faturamento
      FROM itens_pedido ip
      INNER JOIN pedidos p ON p.id = ip.pedido_id
      LEFT JOIN produtos pr ON pr.id = ip.produto_id
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
      GROUP BY COALESCE(pr.categoria, 'Sem categoria')
      ORDER BY faturamento DESC, quantidade DESC
      LIMIT 12
    `)
    .all(dataInicialAtual, dataFinalAtual);

  const itensPorGarcomRows = db
    .prepare(`
      SELECT
        COALESCE(NULLIF(TRIM(p.garcom_nome_fechamento), ''), 'Nao informado') AS garcom,
        ROUND(COALESCE(SUM(ip.quantidade), 0), 0) AS itens_vendidos
      FROM itens_pedido ip
      INNER JOIN pedidos p ON p.id = ip.pedido_id
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
      GROUP BY COALESCE(NULLIF(TRIM(p.garcom_nome_fechamento), ''), 'Nao informado')
    `)
    .all(dataInicialAtual, dataFinalAtual);
  const itensPorGarcom = new Map();
  for (const row of itensPorGarcomRows) {
    itensPorGarcom.set(String(row.garcom || "Nao informado"), Number(row.itens_vendidos || 0));
  }

  const desempenhoGarcom = db
    .prepare(`
      SELECT
        COALESCE(NULLIF(TRIM(p.garcom_nome_fechamento), ''), 'Nao informado') AS garcom,
        COUNT(*) AS vendas,
        ROUND(COALESCE(SUM(p.total), 0), 2) AS total,
        ROUND(COALESCE(SUM(p.subtotal), 0), 2) AS subtotal,
        ROUND(COALESCE(SUM(p.taxa_servico_valor), 0), 2) AS taxa_servico,
        ROUND(COALESCE(SUM(COALESCE(p.couvert_artistico_total, 0)), 0), 2) AS couvert_total,
        ROUND(COALESCE(SUM(COALESCE(p.pessoas, 0)), 0), 0) AS pessoas
      FROM pedidos p
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
      GROUP BY COALESCE(NULLIF(TRIM(p.garcom_nome_fechamento), ''), 'Nao informado')
      ORDER BY total DESC
      LIMIT 20
    `)
    .all(dataInicialAtual, dataFinalAtual)
    .map((item) => {
      const vendas = Number(item.vendas || 0);
      const total = Number(item.total || 0);
      const garcom = String(item.garcom || "Nao informado");
      return {
        garcom,
        vendas,
        total,
        subtotal: Number(item.subtotal || 0),
        taxa_servico: Number(item.taxa_servico || 0),
        couvert_total: Number(item.couvert_total || 0),
        pessoas: Number(item.pessoas || 0),
        ticket_medio: vendas > 0 ? Number((total / vendas).toFixed(2)) : 0,
        itens_vendidos: Number(itensPorGarcom.get(garcom) || 0)
      };
    });

  const statusMesas = db
    .prepare(`
      SELECT
        status,
        COUNT(*) AS quantidade
      FROM mesas
      GROUP BY status
    `)
    .all()
    .map((item) => ({
      status: item.status,
      quantidade: Number(item.quantidade || 0)
    }));

  const caixaMovimentos = db
    .prepare(`
      SELECT
        tipo,
        ROUND(COALESCE(SUM(valor), 0), 2) AS total,
        COUNT(*) AS quantidade
      FROM caixa_movimentos
      WHERE DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
      GROUP BY tipo
      ORDER BY total DESC
    `)
    .all(dataInicialAtual, dataFinalAtual)
    .map((item) => ({
      tipo: item.tipo,
      total: Number(item.total || 0),
      quantidade: Number(item.quantidade || 0)
    }));

  const sessoesCaixa = db
    .prepare(`
      SELECT
        COUNT(*) AS sessoes_total,
        ROUND(COALESCE(SUM(CASE WHEN status = 'FECHADO' THEN 1 ELSE 0 END), 0), 0) AS sessoes_fechadas,
        ROUND(COALESCE(SUM(CASE WHEN status = 'ABERTO' THEN 1 ELSE 0 END), 0), 0) AS sessoes_abertas,
        ROUND(COALESCE(SUM(CASE WHEN status = 'FECHADO' THEN COALESCE(total_vendas, 0) ELSE 0 END), 0), 2) AS faturamento_fechado
      FROM caixa_sessoes
      WHERE DATE(opened_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
    `)
    .get(dataInicialAtual, dataFinalAtual);

  return {
    periodo: {
      dias: periodoDias,
      data_inicial: dataInicialAtual,
      data_final: dataFinalAtual,
      origem_filtro: "dias",
      gerado_em: new Date().toISOString()
    },
    resumo,
    faturamentoPorForma,
    pagamentosPorForma,
    vendasPorDia,
    vendasPorHora,
    topProdutos,
    topCategorias,
    desempenhoGarcom,
    statusMesas,
    caixaMovimentos,
    sessoesCaixa: {
      sessoes_total: Number(sessoesCaixa?.sessoes_total || 0),
      sessoes_fechadas: Number(sessoesCaixa?.sessoes_fechadas || 0),
      sessoes_abertas: Number(sessoesCaixa?.sessoes_abertas || 0),
      faturamento_fechado: Number(sessoesCaixa?.faturamento_fechado || 0)
    },
    estoqueBaixo: ProdutoModel.estoqueBaixo(),
    comparativo: montarComparativo(dataFinalAtual)
  };
}

function normalizarPeriodoRelatorio(query = {}) {
  const dataInicio = normalizarDataRef(query?.data_inicio);
  const dataFim = normalizarDataRef(query?.data_fim);
  const temInicio = Boolean(dataInicio);
  const temFim = Boolean(dataFim);

  if (temInicio || temFim) {
    if (!temInicio || !temFim) {
      throw new Error("Informe data_inicio e data_fim para usar periodo personalizado.");
    }
    if (dataInicio > dataFim) {
      throw new Error("Data inicial nao pode ser maior que a data final.");
    }

    const diasIntervalo =
      Math.floor((parseIsoDate(dataFim).getTime() - parseIsoDate(dataInicio).getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (diasIntervalo > 365) {
      throw new Error("Periodo maximo permitido: 365 dias.");
    }

    return {
      inicio: dataInicio,
      fim: dataFim,
      dias: diasIntervalo,
      origem: "intervalo"
    };
  }

  const dias = normalizarPeriodoDias(query?.dias, 30);
  const dataFinal = normalizarDataRef(query?.data_final) || obterDataLocalHojeIso();
  return {
    inicio: addDaysIso(dataFinal, -(dias - 1)),
    fim: dataFinal,
    dias,
    origem: "dias"
  };
}

function obterRelatoriosGerenciaisPeriodo(periodo = {}) {
  const dataInicialAtual = String(periodo?.inicio || "").trim();
  const dataFinalAtual = String(periodo?.fim || "").trim();
  const periodoDias = normalizarPeriodoDias(periodo?.dias, 30);
  const origemFiltro = String(periodo?.origem || "dias");

  const resumoRaw = db
    .prepare(`
      SELECT
        ROUND(COALESCE(SUM(p.total), 0), 2) AS faturamento_total,
        ROUND(COALESCE(SUM(p.subtotal), 0), 2) AS subtotal_produtos,
        ROUND(COALESCE(SUM(p.taxa_servico_valor), 0), 2) AS taxa_servico_total,
        ROUND(COALESCE(SUM(COALESCE(p.couvert_artistico_total, 0)), 0), 2) AS couvert_total,
        COUNT(*) AS vendas,
        ROUND(COALESCE(SUM(CASE WHEN COALESCE(p.couvert_artistico_total, 0) > 0 THEN 1 ELSE 0 END), 0), 0) AS pedidos_com_couvert,
        ROUND(COALESCE(SUM(COALESCE(p.pessoas, 0)), 0), 0) AS pessoas_atendidas,
        ROUND(COALESCE(AVG(CASE
          WHEN p.closed_at IS NOT NULL AND p.opened_at IS NOT NULL
          THEN (julianday(p.closed_at) - julianday(p.opened_at)) * 24 * 60
          ELSE NULL
        END), 0), 1) AS tempo_medio_minutos
      FROM pedidos p
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
    `)
    .get(dataInicialAtual, dataFinalAtual);

  const itensVendidosRow = db
    .prepare(`
      SELECT
        ROUND(COALESCE(SUM(ip.quantidade), 0), 0) AS itens_vendidos
      FROM itens_pedido ip
      INNER JOIN pedidos p ON p.id = ip.pedido_id
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
    `)
    .get(dataInicialAtual, dataFinalAtual);

  const faturamentoTotal = Number(resumoRaw?.faturamento_total || 0);
  const vendasTotal = Number(resumoRaw?.vendas || 0);
  const ticketMedio = vendasTotal > 0 ? Number((faturamentoTotal / vendasTotal).toFixed(2)) : 0;

  const resumo = {
    faturamento_total: faturamentoTotal,
    subtotal_produtos: Number(resumoRaw?.subtotal_produtos || 0),
    taxa_servico_total: Number(resumoRaw?.taxa_servico_total || 0),
    couvert_total: Number(resumoRaw?.couvert_total || 0),
    vendas: vendasTotal,
    ticket_medio: ticketMedio,
    itens_vendidos: Number(itensVendidosRow?.itens_vendidos || 0),
    pessoas_atendidas: Number(resumoRaw?.pessoas_atendidas || 0),
    tempo_medio_minutos: Number(resumoRaw?.tempo_medio_minutos || 0),
    pedidos_com_couvert: Number(resumoRaw?.pedidos_com_couvert || 0)
  };

  const pagamentosPorFormaBase = db
    .prepare(`
      SELECT
        base.forma_pagamento,
        ROUND(COALESCE(SUM(base.valor), 0), 2) AS total,
        COUNT(DISTINCT base.pedido_id) AS vendas
      FROM (
        SELECT
          pp.pedido_id AS pedido_id,
          pp.forma_pagamento AS forma_pagamento,
          pp.valor AS valor
        FROM pedido_pagamentos pp
        INNER JOIN pedidos p ON p.id = pp.pedido_id
        WHERE p.status = 'PAGO'
          AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)

        UNION ALL

        SELECT
          p.id AS pedido_id,
          p.forma_pagamento AS forma_pagamento,
          p.total AS valor
        FROM pedidos p
        WHERE p.status = 'PAGO'
          AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
          AND p.forma_pagamento IS NOT NULL
          AND p.forma_pagamento <> 'MISTO'
          AND NOT EXISTS (
            SELECT 1
            FROM pedido_pagamentos pp2
            WHERE pp2.pedido_id = p.id
          )
      ) base
      GROUP BY base.forma_pagamento
      ORDER BY total DESC
    `)
    .all(dataInicialAtual, dataFinalAtual, dataInicialAtual, dataFinalAtual);

  const pagamentosPorForma = pagamentosPorFormaBase.map((item) => {
    const total = Number(item.total || 0);
    const vendas = Number(item.vendas || 0);
    return {
      forma_pagamento: item.forma_pagamento || "NAO_INFORMADO",
      total,
      vendas,
      ticket_medio: vendas > 0 ? Number((total / vendas).toFixed(2)) : 0,
      percentual_faturamento:
        faturamentoTotal > 0 ? Number(((total / faturamentoTotal) * 100).toFixed(2)) : 0
    };
  });

  const faturamentoPorForma = pagamentosPorForma.map((item) => ({
    forma_pagamento: item.forma_pagamento,
    total: item.total
  }));

  const vendasPorDia = db
    .prepare(`
      SELECT
        DATE(p.closed_at, 'localtime') AS data,
        ROUND(COALESCE(SUM(p.total), 0), 2) AS total,
        ROUND(COALESCE(SUM(p.subtotal), 0), 2) AS subtotal,
        ROUND(COALESCE(SUM(p.taxa_servico_valor), 0), 2) AS taxa_servico,
        COUNT(*) AS vendas
      FROM pedidos p
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
      GROUP BY DATE(p.closed_at, 'localtime')
      ORDER BY DATE(p.closed_at, 'localtime') ASC
    `)
    .all(dataInicialAtual, dataFinalAtual);

  const vendasPorHora = db
    .prepare(`
      SELECT
        CAST(STRFTIME('%H', p.closed_at, 'localtime') AS INTEGER) AS hora,
        ROUND(COALESCE(SUM(p.total), 0), 2) AS total,
        COUNT(*) AS vendas
      FROM pedidos p
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
      GROUP BY CAST(STRFTIME('%H', p.closed_at, 'localtime') AS INTEGER)
      ORDER BY hora ASC
    `)
    .all(dataInicialAtual, dataFinalAtual)
    .map((item) => {
      const vendas = Number(item.vendas || 0);
      const total = Number(item.total || 0);
      return {
        hora: Number(item.hora || 0),
        total,
        vendas,
        ticket_medio: vendas > 0 ? Number((total / vendas).toFixed(2)) : 0
      };
    });

  const topProdutos = db
    .prepare(`
      SELECT
        ip.nome_produto,
        SUM(ip.quantidade) AS quantidade,
        ROUND(SUM(ip.total_item), 2) AS faturamento
      FROM itens_pedido ip
      INNER JOIN pedidos p ON p.id = ip.pedido_id
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
      GROUP BY ip.nome_produto
      ORDER BY faturamento DESC, quantidade DESC, ip.nome_produto ASC
    `)
    .all(dataInicialAtual, dataFinalAtual);

  const topCategorias = db
    .prepare(`
      SELECT
        COALESCE(pr.categoria, 'Sem categoria') AS categoria,
        SUM(ip.quantidade) AS quantidade,
        ROUND(SUM(ip.total_item), 2) AS faturamento
      FROM itens_pedido ip
      INNER JOIN pedidos p ON p.id = ip.pedido_id
      LEFT JOIN produtos pr ON pr.id = ip.produto_id
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
      GROUP BY COALESCE(pr.categoria, 'Sem categoria')
      ORDER BY faturamento DESC, quantidade DESC
      LIMIT 12
    `)
    .all(dataInicialAtual, dataFinalAtual);

  const itensPorGarcomRows = db
    .prepare(`
      SELECT
        COALESCE(NULLIF(TRIM(p.garcom_nome_fechamento), ''), 'Nao informado') AS garcom,
        ROUND(COALESCE(SUM(ip.quantidade), 0), 0) AS itens_vendidos
      FROM itens_pedido ip
      INNER JOIN pedidos p ON p.id = ip.pedido_id
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
      GROUP BY COALESCE(NULLIF(TRIM(p.garcom_nome_fechamento), ''), 'Nao informado')
    `)
    .all(dataInicialAtual, dataFinalAtual);
  const itensPorGarcom = new Map();
  for (const row of itensPorGarcomRows) {
    itensPorGarcom.set(String(row.garcom || "Nao informado"), Number(row.itens_vendidos || 0));
  }

  const desempenhoGarcom = db
    .prepare(`
      SELECT
        COALESCE(NULLIF(TRIM(p.garcom_nome_fechamento), ''), 'Nao informado') AS garcom,
        COUNT(*) AS vendas,
        ROUND(COALESCE(SUM(p.total), 0), 2) AS total,
        ROUND(COALESCE(SUM(p.subtotal), 0), 2) AS subtotal,
        ROUND(COALESCE(SUM(p.taxa_servico_valor), 0), 2) AS taxa_servico,
        ROUND(COALESCE(SUM(COALESCE(p.couvert_artistico_total, 0)), 0), 2) AS couvert_total,
        ROUND(COALESCE(SUM(COALESCE(p.pessoas, 0)), 0), 0) AS pessoas
      FROM pedidos p
      WHERE p.status = 'PAGO'
        AND DATE(p.closed_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
      GROUP BY COALESCE(NULLIF(TRIM(p.garcom_nome_fechamento), ''), 'Nao informado')
      ORDER BY total DESC
      LIMIT 20
    `)
    .all(dataInicialAtual, dataFinalAtual)
    .map((item) => {
      const vendas = Number(item.vendas || 0);
      const total = Number(item.total || 0);
      const garcom = String(item.garcom || "Nao informado");
      return {
        garcom,
        vendas,
        total,
        subtotal: Number(item.subtotal || 0),
        taxa_servico: Number(item.taxa_servico || 0),
        couvert_total: Number(item.couvert_total || 0),
        pessoas: Number(item.pessoas || 0),
        ticket_medio: vendas > 0 ? Number((total / vendas).toFixed(2)) : 0,
        itens_vendidos: Number(itensPorGarcom.get(garcom) || 0)
      };
    });

  const statusMesas = db
    .prepare(`
      SELECT
        status,
        COUNT(*) AS quantidade
      FROM mesas
      GROUP BY status
    `)
    .all()
    .map((item) => ({
      status: item.status,
      quantidade: Number(item.quantidade || 0)
    }));

  const caixaMovimentos = db
    .prepare(`
      SELECT
        tipo,
        ROUND(COALESCE(SUM(valor), 0), 2) AS total,
        COUNT(*) AS quantidade
      FROM caixa_movimentos
      WHERE DATE(created_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
      GROUP BY tipo
      ORDER BY total DESC
    `)
    .all(dataInicialAtual, dataFinalAtual)
    .map((item) => ({
      tipo: item.tipo,
      total: Number(item.total || 0),
      quantidade: Number(item.quantidade || 0)
    }));

  const sessoesCaixa = db
    .prepare(`
      SELECT
        COUNT(*) AS sessoes_total,
        ROUND(COALESCE(SUM(CASE WHEN status = 'FECHADO' THEN 1 ELSE 0 END), 0), 0) AS sessoes_fechadas,
        ROUND(COALESCE(SUM(CASE WHEN status = 'ABERTO' THEN 1 ELSE 0 END), 0), 0) AS sessoes_abertas,
        ROUND(COALESCE(SUM(CASE WHEN status = 'FECHADO' THEN COALESCE(total_vendas, 0) ELSE 0 END), 0), 2) AS faturamento_fechado
      FROM caixa_sessoes
      WHERE DATE(opened_at, 'localtime') BETWEEN DATE(?) AND DATE(?)
    `)
    .get(dataInicialAtual, dataFinalAtual);

  return {
    periodo: {
      dias: periodoDias,
      data_inicial: dataInicialAtual,
      data_final: dataFinalAtual,
      origem_filtro: origemFiltro,
      gerado_em: new Date().toISOString()
    },
    resumo,
    faturamentoPorForma,
    pagamentosPorForma,
    vendasPorDia,
    vendasPorHora,
    topProdutos,
    topCategorias,
    desempenhoGarcom,
    statusMesas,
    caixaMovimentos,
    sessoesCaixa: {
      sessoes_total: Number(sessoesCaixa?.sessoes_total || 0),
      sessoes_fechadas: Number(sessoesCaixa?.sessoes_fechadas || 0),
      sessoes_abertas: Number(sessoesCaixa?.sessoes_abertas || 0),
      faturamento_fechado: Number(sessoesCaixa?.faturamento_fechado || 0)
    },
    estoqueBaixo: ProdutoModel.estoqueBaixo(),
    comparativo: montarComparativo(dataFinalAtual)
  };
}

function totaisMovimentosSessao(sessaoId) {
  const rows = totalMovimentosSessaoStmt.all(sessaoId);
  const totals = {
    abertura: 0,
    sangria: 0,
    suprimento: 0,
    retirada: 0
  };

  for (const item of rows) {
    const tipo = String(item.tipo || "").toUpperCase();
    const valor = Number(item.total || 0);
    if (tipo === "ABERTURA") totals.abertura = valor;
    if (tipo === "SANGRIA") totals.sangria = valor;
    if (tipo === "SUPRIMENTO") totals.suprimento = valor;
    if (tipo === "RETIRADA") totals.retirada = valor;
  }

  return totals;
}

function montarResumoSaldo(sessao, totalVendas = 0) {
  const totals = totaisMovimentosSessao(sessao.id);
  const saldoInicial = Number(sessao.saldo_inicial || 0);
  const saldoAjustado = Number((saldoInicial + totals.suprimento - totals.sangria - totals.retirada).toFixed(2));
  const saldoFinalEstimado = Number((saldoAjustado + Number(totalVendas || 0)).toFixed(2));

  return {
    saldo_inicial: saldoInicial,
    suprimento: totals.suprimento,
    sangria: totals.sangria,
    retirada: totals.retirada,
    saldo_apos_movimentos: saldoAjustado,
    saldo_final_estimado: saldoFinalEstimado
  };
}

const fecharCaixaTx = db.transaction((payloadInput = {}) => {
  const sessao = caixaAbertoStmt.get();
  if (!sessao) {
    throw new Error("Nao existe caixa aberto no momento.");
  }

  const payload =
    payloadInput && typeof payloadInput === "object"
      ? payloadInput
      : { observacao: payloadInput };

  const resumoPeriodo = obterResumoPeriodo(sessao.opened_at);
  const resumoSaldoAberto = montarResumoSaldo(sessao, resumoPeriodo.caixa.faturamento_total);

  const observacao = String(payload.observacao || "").trim();
  const observacaoFinal = observacao || sessao.observacao || null;

  const saldoContadoRaw = payload.saldo_contado ?? payload.saldoContado;
  const saldoContadoInformado =
    saldoContadoRaw !== undefined && saldoContadoRaw !== null && String(saldoContadoRaw).trim() !== "";
  let saldoContado = null;

  if (saldoContadoInformado) {
    const saldoContadoInput = Number(saldoContadoRaw);
    if (!Number.isFinite(saldoContadoInput) || saldoContadoInput < 0) {
      throw new Error("Saldo contado invalido. Informe um valor maior ou igual a zero.");
    }
    saldoContado = Number(saldoContadoInput.toFixed(2));
  }

  const diferencaFechamento =
    saldoContado === null
      ? null
      : Number((saldoContado - Number(resumoSaldoAberto.saldo_final_estimado || 0)).toFixed(2));

  db.prepare(`
    UPDATE caixa_sessoes
    SET
      status = 'FECHADO',
      subtotal_produtos = ?,
      taxa_servico_total = ?,
      total_vendas = ?,
      vendas = ?,
      saldo_contado = ?,
      diferenca_fechamento = ?,
      observacao = ?,
      closed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    resumoPeriodo.caixa.subtotal_produtos,
    resumoPeriodo.caixa.taxa_servico_total,
    resumoPeriodo.caixa.faturamento_total,
    resumoPeriodo.caixa.vendas,
    saldoContado,
    diferencaFechamento,
    observacaoFinal,
    sessao.id
  );

  const sessaoFechada = caixaByIdStmt.get(sessao.id);
  const resumoSaldo = montarResumoSaldo(sessaoFechada, resumoPeriodo.caixa.faturamento_total);

  return {
    aberto: false,
    sessao: null,
    ultima_sessao: sessaoFechada,
    resumo: {
      periodo_inicio: sessaoFechada.opened_at,
      periodo_fim: sessaoFechada.closed_at,
      saldo_inicial: Number(sessaoFechada.saldo_inicial || 0),
      saldo_contado: sessaoFechada.saldo_contado === null ? null : Number(sessaoFechada.saldo_contado || 0),
      diferenca_fechamento:
        sessaoFechada.diferenca_fechamento === null
          ? null
          : Number(sessaoFechada.diferenca_fechamento || 0),
      saldo_final_estimado: Number(resumoSaldo.saldo_final_estimado),
      caixa: resumoPeriodo.caixa,
      faturamentoPorForma: resumoPeriodo.faturamentoPorForma,
      movimentos: {
        suprimento: resumoSaldo.suprimento,
        sangria: resumoSaldo.sangria,
        retirada: resumoSaldo.retirada,
        saldo_apos_movimentos: resumoSaldo.saldo_apos_movimentos
      }
    }
  };
});

const movimentarCaixaTx = db.transaction((payload, authUser) => {
  const sessao = caixaAbertoStmt.get();
  if (!sessao) {
    throw new Error("Nao existe caixa aberto no momento.");
  }

  const tipo = String(payload?.tipo || "")
    .trim()
    .toUpperCase();
  const valor = Number(payload?.valor);
  const justificativa = String(payload?.justificativa || "").trim();
  const tiposValidos = ["SANGRIA", "SUPRIMENTO", "RETIRADA"];

  if (!tiposValidos.includes(tipo)) {
    throw new Error("Tipo invalido. Use SANGRIA, SUPRIMENTO ou RETIRADA.");
  }

  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error("Valor invalido. Informe um numero maior que zero.");
  }

  if (justificativa.length < 3) {
    throw new Error("Informe uma justificativa (minimo 3 caracteres).");
  }

  inserirMovimentoCaixaStmt.run(
    sessao.id,
    tipo,
    Number(valor.toFixed(2)),
    justificativa.slice(0, 300),
    authUser?.id ?? null,
    String(authUser?.nome || "Sistema").slice(0, 90)
  );

  const sessaoAtualizada = caixaByIdStmt.get(sessao.id);
  const resumoCaixaAberto = montarResumoCaixaAberto(sessaoAtualizada);

  return {
    sessao: sessaoAtualizada,
    movimentos: listarMovimentosSessaoStmt.all(sessao.id),
    resumo_saldo: montarResumoSaldo(sessaoAtualizada, resumoCaixaAberto?.caixa?.faturamento_total || 0),
    resumo_caixa_aberto: resumoCaixaAberto
  };
});

const FinanceiroController = {
  resumo(req, res) {
    try {
      const intervalo = normalizarIntervaloDatas(req.query || {});
      const resumo = obterResumoPorData(intervalo);
      res.json(resumo);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  caixaAtual(req, res) {
    try {
      const aberta = caixaAbertoStmt.get() || null;
      const ultima = aberta ? null : ultimaSessaoFechadaStmt.get() || null;
      const movimentos = aberta ? listarMovimentosSessaoStmt.all(aberta.id) : [];
      const resumoCaixaAberto = aberta ? montarResumoCaixaAberto(aberta) : null;
      const resumoSaldo = aberta
        ? montarResumoSaldo(aberta, resumoCaixaAberto?.caixa?.faturamento_total || 0)
        : null;

      res.json({
        aberto: Boolean(aberta),
        sessao: aberta,
        ultima_sessao: ultima,
        movimentos,
        resumo_saldo: resumoSaldo,
        resumo_caixa_aberto: resumoCaixaAberto
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  abrirCaixa(req, res) {
    try {
      const aberta = caixaAbertoStmt.get();
      if (aberta) {
        return res.status(400).json({ error: "Ja existe um caixa aberto." });
      }

      const saldoInicial = Number(req.body?.saldo_inicial ?? 0);
      if (!Number.isFinite(saldoInicial) || saldoInicial < 0) {
        return res.status(400).json({ error: "Saldo inicial invalido." });
      }

      const observacao = String(req.body?.observacao || "").trim() || null;

      const info = db
        .prepare(`
          INSERT INTO caixa_sessoes (status, saldo_inicial, observacao)
          VALUES ('ABERTO', ?, ?)
        `)
        .run(Number(saldoInicial.toFixed(2)), observacao);

      const sessao = caixaByIdStmt.get(info.lastInsertRowid);
      inserirMovimentoCaixaStmt.run(
        sessao.id,
        "ABERTURA",
        Number(saldoInicial.toFixed(2)),
        observacao || "Abertura de caixa",
        req.authUser?.id ?? null,
        String(req.authUser?.nome || "Sistema").slice(0, 90)
      );

      const resumoCaixaAberto = montarResumoCaixaAberto(sessao);

      return res.status(201).json({
        aberto: true,
        sessao,
        ultima_sessao: null,
        movimentos: listarMovimentosSessaoStmt.all(sessao.id),
        resumo_saldo: montarResumoSaldo(sessao, resumoCaixaAberto?.caixa?.faturamento_total || 0),
        resumo_caixa_aberto: resumoCaixaAberto
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },

  fecharCaixa(req, res) {
    try {
      const resultado = fecharCaixaTx({
        observacao: req.body?.observacao,
        saldo_contado: req.body?.saldo_contado
      });
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  movimentarCaixa(req, res) {
    try {
      const resultado = movimentarCaixaTx(req.body || {}, req.authUser);
      res.status(201).json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  relatorios(req, res) {
    try {
      const periodo = normalizarPeriodoRelatorio(req.query || {});
      const dados = obterRelatoriosGerenciaisPeriodo(periodo);
      res.json(dados);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
};

module.exports = FinanceiroController;
