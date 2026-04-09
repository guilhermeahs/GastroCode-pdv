import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import DatePickerField from "../components/DatePickerField";
import SelectField from "../components/SelectField";
import { formatDateTimePtBr } from "../utils/datetime";

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function inteiro(valor) {
  return Number(valor || 0).toLocaleString("pt-BR");
}

function percentual(valor) {
  const n = Number(valor || 0);
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function hojeLocalIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function toIso(dateObj) {
  const date = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 10);
}

function addDiasIso(isoDate, dias) {
  const [ano, mes, dia] = String(isoDate || "").split("-").map((item) => Number(item));
  if (!ano || !mes || !dia) return hojeLocalIso();
  const base = new Date(ano, mes - 1, dia);
  base.setDate(base.getDate() + Number(dias || 0));
  return toIso(base);
}

function nomeFormaPagamento(codigo) {
  const code = String(codigo || "").toUpperCase();
  if (code === "PIX") return "Pix";
  if (code === "CREDITO") return "Credito";
  if (code === "DEBITO") return "Debito";
  if (code === "DINHEIRO") return "Dinheiro";
  if (code === "MISTO") return "Misto";
  if (code === "NAO_INFORMADO") return "Nao informado";
  return code || "Nao informado";
}

function nomeFonteOnline(codigo) {
  const code = String(codigo || "").toUpperCase();
  if (code === "IFOOD") return "iFood";
  if (code === "NINENINE" || code === "99") return "99 Food";
  return code || "Online";
}

function nomeTipoMovimento(tipo) {
  const code = String(tipo || "").toUpperCase();
  if (code === "SANGRIA") return "Sangria";
  if (code === "SUPRIMENTO") return "Suprimento";
  if (code === "RETIRADA") return "Retirada";
  if (code === "ABERTURA") return "Abertura";
  return code || "Nao informado";
}

function nomeStatusMesa(status) {
  const code = String(status || "").toUpperCase();
  if (code === "LIVRE") return "Livre";
  if (code === "OCUPADA") return "Ocupada";
  if (code === "FECHANDO") return "Fechando";
  return code || "Status";
}

function periodoPreset(preset) {
  const hoje = hojeLocalIso();
  if (preset === "HOJE") {
    return { inicio: hoje, fim: hoje };
  }
  if (preset === "ULT_7") {
    return { inicio: addDiasIso(hoje, -6), fim: hoje };
  }
  if (preset === "ULT_30") {
    return { inicio: addDiasIso(hoje, -29), fim: hoje };
  }
  if (preset === "ULT_90") {
    return { inicio: addDiasIso(hoje, -89), fim: hoje };
  }
  if (preset === "MES_ATUAL") {
    const [ano, mes] = hoje.split("-").map((item) => Number(item));
    const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
    return { inicio, fim: hoje };
  }
  if (preset === "MES_ANTERIOR") {
    const [anoRaw, mesRaw] = hoje.split("-").map((item) => Number(item));
    let ano = anoRaw;
    let mes = mesRaw - 1;
    if (mes < 1) {
      mes = 12;
      ano -= 1;
    }
    const inicio = new Date(ano, mes - 1, 1);
    const fim = new Date(ano, mes, 0);
    return {
      inicio: toIso(inicio),
      fim: toIso(fim)
    };
  }
  return { inicio: addDiasIso(hoje, -29), fim: hoje };
}

function periodoFormatado(inicio, fim) {
  if (!inicio || !fim) return "-";
  const inicioFmt = new Date(`${inicio}T12:00:00`).toLocaleDateString("pt-BR");
  const fimFmt = new Date(`${fim}T12:00:00`).toLocaleDateString("pt-BR");
  if (inicioFmt === fimFmt) return inicioFmt;
  return `${inicioFmt} ate ${fimFmt}`;
}

function csvEscape(valor) {
  return `"${String(valor ?? "").replaceAll('"', '""')}"`;
}

function gerarCsvRelatorio(dados) {
  const linhas = [];
  linhas.push(["secao", "campo", "valor"].map(csvEscape).join(";"));

  const resumo = dados?.resumo || {};
  linhas.push(["resumo", "faturamento_total", resumo.faturamento_total || 0].map(csvEscape).join(";"));
  linhas.push(["resumo", "subtotal_produtos", resumo.subtotal_produtos || 0].map(csvEscape).join(";"));
  linhas.push(["resumo", "taxa_servico_total", resumo.taxa_servico_total || 0].map(csvEscape).join(";"));
  linhas.push(["resumo", "couvert_total", resumo.couvert_total || 0].map(csvEscape).join(";"));
  linhas.push(["resumo", "vendas", resumo.vendas || 0].map(csvEscape).join(";"));
  linhas.push(["resumo", "ticket_medio", resumo.ticket_medio || 0].map(csvEscape).join(";"));
  linhas.push(["resumo", "itens_vendidos", resumo.itens_vendidos || 0].map(csvEscape).join(";"));
  linhas.push(["resumo", "pessoas_atendidas", resumo.pessoas_atendidas || 0].map(csvEscape).join(";"));
  linhas.push(["resumo", "tempo_medio_minutos", resumo.tempo_medio_minutos || 0].map(csvEscape).join(";"));
  linhas.push(["resumo", "pedidos_com_couvert", resumo.pedidos_com_couvert || 0].map(csvEscape).join(";"));

  const pagamentos = Array.isArray(dados?.pagamentosPorForma) ? dados.pagamentosPorForma : [];
  for (const item of pagamentos) {
    linhas.push(["pagamentos", `forma:${item.forma_pagamento || "-"}`, item.total || 0].map(csvEscape).join(";"));
    linhas.push(["pagamentos", `vendas:${item.forma_pagamento || "-"}`, item.vendas || 0].map(csvEscape).join(";"));
    linhas.push(["pagamentos", `percentual:${item.forma_pagamento || "-"}`, item.percentual_faturamento || 0].map(csvEscape).join(";"));
  }

  const vendasPorDia = Array.isArray(dados?.vendasPorDia) ? dados.vendasPorDia : [];
  for (const item of vendasPorDia) {
    linhas.push(["vendas_por_dia", item.data || "-", item.total || 0].map(csvEscape).join(";"));
  }

  const vendasPorHora = Array.isArray(dados?.vendasPorHora) ? dados.vendasPorHora : [];
  for (const item of vendasPorHora) {
    linhas.push(["vendas_por_hora", String(item.hora ?? "-"), item.total || 0].map(csvEscape).join(";"));
  }

  const topProdutos = Array.isArray(dados?.topProdutos) ? dados.topProdutos : [];
  for (const item of topProdutos) {
    linhas.push(["top_produtos", item.nome_produto || "-", item.faturamento || 0].map(csvEscape).join(";"));
  }

  const topCategorias = Array.isArray(dados?.topCategorias) ? dados.topCategorias : [];
  for (const item of topCategorias) {
    linhas.push(["top_categorias", item.categoria || "-", item.faturamento || 0].map(csvEscape).join(";"));
  }

  const desempenhoGarcom = Array.isArray(dados?.desempenhoGarcom) ? dados.desempenhoGarcom : [];
  for (const item of desempenhoGarcom) {
    linhas.push(["desempenho_garcom", item.garcom || "-", item.total || 0].map(csvEscape).join(";"));
  }

  const pedidosOnlineResumo = dados?.pedidosOnlineResumo || {};
  linhas.push(["online_resumo", "pedidos", pedidosOnlineResumo.pedidos || 0].map(csvEscape).join(";"));
  linhas.push(["online_resumo", "valor_total", pedidosOnlineResumo.valor_total || 0].map(csvEscape).join(";"));
  linhas.push(["online_resumo", "ticket_medio", pedidosOnlineResumo.ticket_medio || 0].map(csvEscape).join(";"));
  linhas.push(["online_resumo", "cancelados", pedidosOnlineResumo.cancelados || 0].map(csvEscape).join(";"));

  const pedidosOnlinePorFonte = Array.isArray(dados?.pedidosOnlinePorFonte) ? dados.pedidosOnlinePorFonte : [];
  for (const item of pedidosOnlinePorFonte) {
    linhas.push(["online_fonte", item.source || "-", item.valor_total || 0].map(csvEscape).join(";"));
    linhas.push(["online_fonte_pedidos", item.source || "-", item.pedidos || 0].map(csvEscape).join(";"));
  }

  const pedidosOnlinePorForma = Array.isArray(dados?.pedidosOnlinePorFormaPagamento)
    ? dados.pedidosOnlinePorFormaPagamento
    : [];
  for (const item of pedidosOnlinePorForma) {
    linhas.push(
      ["online_pagamento", `${item.source || "-"}:${item.payment || "-"}`, item.valor_total || 0]
        .map(csvEscape)
        .join(";")
    );
    linhas.push(
      ["online_pagamento_pedidos", `${item.source || "-"}:${item.payment || "-"}`, item.pedidos || 0]
        .map(csvEscape)
        .join(";")
    );
  }

  const pedidosOnlineDetalhes = Array.isArray(dados?.pedidosOnlineDetalhes) ? dados.pedidosOnlineDetalhes : [];
  for (const item of pedidosOnlineDetalhes) {
    linhas.push(
      [
        "online_pedido",
        `${item.source || "-"}:${item.numero || "-"}`,
        JSON.stringify({
          data_hora: item.data_hora || "",
          pagamento: item.payment || "",
          status: item.status || "",
          valor_total: Number(item.total || 0),
          cliente: item.cliente || "",
          external_id: item.external_id || ""
        })
      ]
        .map(csvEscape)
        .join(";")
    );
  }

  const entregasPorDia = Array.isArray(dados?.entregasPorDia) ? dados.entregasPorDia : [];
  for (const item of entregasPorDia) {
    linhas.push(["entregas_dia_total", item.data || "-", item.total || 0].map(csvEscape).join(";"));
    linhas.push(["entregas_dia_entregues", item.data || "-", item.entregues || 0].map(csvEscape).join(";"));
    linhas.push(["entregas_dia_cancelados", item.data || "-", item.cancelados || 0].map(csvEscape).join(";"));
  }

  return linhas.join("\n");
}

function baixarTexto(nomeArquivo, conteudo, mimeType) {
  const blob = new Blob([conteudo], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

function BarCard({
  titulo,
  itens = [],
  emptyText,
  formatadorValor = moeda,
  color = "#2e63f4",
  maxListaAltura = 0
}) {
  const maxValor = useMemo(() => {
    return itens.reduce((max, item) => Math.max(max, Number(item.valor || 0)), 0);
  }, [itens]);
  const alturaLista = Number(maxListaAltura || 0);
  const usarScroll = alturaLista > 0;

  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>{titulo}</h3>
      {itens.length < 1 && <div style={{ color: "#b8c0db" }}>{emptyText}</div>}
      <div
        style={{
          ...barListStyle,
          ...(usarScroll
            ? {
                maxHeight: alturaLista,
                overflowY: "auto",
                paddingRight: 4,
                scrollbarGutter: "stable"
              }
            : null)
        }}
      >
        {itens.map((item) => {
          const valor = Number(item.valor || 0);
          const pct = maxValor > 0 ? Math.max(5, (valor / maxValor) * 100) : 0;
          return (
            <div key={`${titulo}-${item.label}`}>
              <div style={barHeadStyle}>
                <span>{item.label}</span>
                <strong>{formatadorValor(valor)}</strong>
              </div>
              {item.extra && <div style={barSubStyle}>{item.extra}</div>}
              <div style={barTrackStyle}>
                <div
                  style={{
                    ...barFillStyle,
                    width: `${pct}%`,
                    background: color
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub }) {
  return (
    <div style={kpiCardStyle}>
      <div style={{ color: "#b7bfdc", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
      {sub ? <div style={{ color: "#8fa0d6", fontSize: 12 }}>{sub}</div> : null}
    </div>
  );
}

function TopProdutosCard({
  titulo,
  itens = [],
  totalCompleto = 0,
  emptyText,
  formatadorValor = moeda,
  color = "#f2a640",
  onVerTodos
}) {
  const maxValor = useMemo(() => {
    return itens.reduce((max, item) => Math.max(max, Number(item.valor || 0)), 0);
  }, [itens]);

  return (
    <div style={cardStyle}>
      <div style={topProdutosHeaderStyle}>
        <h3 style={{ margin: 0 }}>{titulo}</h3>
        <span style={topProdutosCountStyle}>{inteiro(totalCompleto)} produto(s)</span>
      </div>

      {itens.length < 1 && <div style={{ color: "#b8c0db" }}>{emptyText}</div>}
      <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
        {itens.map((item) => {
          const valor = Number(item.valor || 0);
          const pct = maxValor > 0 ? Math.max(5, (valor / maxValor) * 100) : 0;
          return (
            <div key={`${titulo}-${item.label}`}>
              <div style={barHeadStyle}>
                <span>{item.label}</span>
                <strong>{formatadorValor(valor)}</strong>
              </div>
              {item.extra && <div style={barSubStyle}>{item.extra}</div>}
              <div style={barTrackStyle}>
                <div
                  style={{
                    ...barFillStyle,
                    width: `${pct}%`,
                    background: color
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {totalCompleto > itens.length ? (
        <div style={topProdutosFooterStyle}>
          <span style={topProdutosFooterInfoStyle}>
            Mostrando {inteiro(itens.length)} de {inteiro(totalCompleto)}
          </span>
          <button type="button" style={miniActionButtonStyle(false)} onClick={onVerTodos}>
            Ver lista completa
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TopProdutosModal({ aberto, itens = [], busca = "", onBuscaChange, onFechar }) {
  if (!aberto) return null;

  return (
    <div style={modalOverlayStyle} onClick={onFechar}>
      <div style={modalCardStyle} onClick={(event) => event.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <h3 style={{ margin: 0 }}>Produtos vendidos no periodo</h3>
          <button type="button" style={miniActionButtonStyle(false)} onClick={onFechar}>
            Fechar
          </button>
        </div>

        <div style={modalInfoStyle}>
          Total encontrado: <strong>{inteiro(itens.length)} produto(s)</strong>
        </div>

        <input
          value={busca}
          onChange={(event) => onBuscaChange(event.target.value)}
          placeholder="Buscar produto na lista completa"
          style={inputStyle}
        />

        <div style={modalTableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 56 }}>#</th>
                <th style={thStyle}>Produto</th>
                <th style={{ ...thStyle, width: 120 }}>Qtd</th>
                <th style={{ ...thStyle, width: 160 }}>Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item, index) => (
                <tr key={`top-produto-${item.nome_produto}-${index}`}>
                  <td style={tdStyle}>{inteiro(index + 1)}</td>
                  <td style={tdStyle}>{item.nome_produto || "-"}</td>
                  <td style={tdStyle}>{inteiro(item.quantidade)}</td>
                  <td style={tdStyle}>{moeda(item.faturamento)}</td>
                </tr>
              ))}
              {itens.length < 1 && (
                <tr>
                  <td style={tdStyle} colSpan={4}>
                    Nenhum produto encontrado para essa busca.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Relatorios() {
  const { role, hasPermission } = useApp();
  const podeVerRelatorios = hasPermission("APP_FINANCEIRO_RELATORIOS");

  const [preset, setPreset] = useState("ULT_30");
  const [dataInicio, setDataInicio] = useState(() => periodoPreset("ULT_30").inicio);
  const [dataFim, setDataFim] = useState(() => periodoPreset("ULT_30").fim);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [abaRelatorio, setAbaRelatorio] = useState("MESAS");
  const [modalTopProdutosAberto, setModalTopProdutosAberto] = useState(false);
  const [buscaTopProdutos, setBuscaTopProdutos] = useState("");

  function fecharModalTopProdutos() {
    setModalTopProdutosAberto(false);
    setBuscaTopProdutos("");
  }

  async function carregarRelatorio(inicio, fim) {
    setCarregando(true);
    setErro("");
    try {
      const payload = await api.getFinanceiroRelatorios(role, {
        data_inicio: inicio,
        data_fim: fim
      });
      setDados(payload || null);
    } catch (error) {
      setErro(error?.message || "Falha ao carregar relatorio.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    const range = periodoPreset("ULT_30");
    carregarRelatorio(range.inicio, range.fim);
  }, [role]);

  if (!podeVerRelatorios) {
    return <p>Sem permissao para acessar relatorios.</p>;
  }

  function handleMudarPreset(value) {
    setPreset(value);
    if (value === "PERSONALIZADO") return;
    const range = periodoPreset(value);
    setDataInicio(range.inicio);
    setDataFim(range.fim);
    carregarRelatorio(range.inicio, range.fim);
  }

  function aplicarPeriodoManual() {
    const inicio = String(dataInicio || "").trim();
    const fim = String(dataFim || "").trim();
    if (!inicio || !fim) {
      setErro("Informe data inicial e final.");
      return;
    }
    if (inicio > fim) {
      setErro("Data inicial nao pode ser maior que data final.");
      return;
    }
    setPreset("PERSONALIZADO");
    carregarRelatorio(inicio, fim);
  }

  function exportarJson() {
    if (!dados) return;
    const nome = `relatorio-completo-${dataInicio}-a-${dataFim}.json`;
    baixarTexto(nome, JSON.stringify(dados, null, 2), "application/json");
  }

  function exportarCsv() {
    if (!dados) return;
    const nome = `relatorio-completo-${dataInicio}-a-${dataFim}.csv`;
    baixarTexto(nome, gerarCsvRelatorio(dados), "text/csv;charset=utf-8");
  }

  function abaRelatorioButtonStyle(ativo) {
    return {
      minHeight: 38,
      minWidth: 120,
      borderRadius: 10,
      border: ativo ? "1px solid #4677ff" : "1px solid #37416a",
      background: ativo ? "linear-gradient(180deg, #3968f0 0%, #2f5ad5 100%)" : "#1a2141",
      color: "#fff",
      fontWeight: 700,
      cursor: "pointer"
    };
  }

  const resumo = dados?.resumo || {};
  const periodo = dados?.periodo || {};
  const pagamentosPorForma = Array.isArray(dados?.pagamentosPorForma) ? dados.pagamentosPorForma : [];
  const vendasPorDia = Array.isArray(dados?.vendasPorDia) ? dados.vendasPorDia : [];
  const vendasPorHora = Array.isArray(dados?.vendasPorHora) ? dados.vendasPorHora : [];
  const topProdutos = Array.isArray(dados?.topProdutos) ? dados.topProdutos : [];
  const topCategorias = Array.isArray(dados?.topCategorias) ? dados.topCategorias : [];
  const desempenhoGarcom = Array.isArray(dados?.desempenhoGarcom) ? dados.desempenhoGarcom : [];
  const pedidosOnlineResumo = dados?.pedidosOnlineResumo || {};
  const pedidosOnlinePorFonte = Array.isArray(dados?.pedidosOnlinePorFonte) ? dados.pedidosOnlinePorFonte : [];
  const pedidosOnlinePorFormaPagamento = Array.isArray(dados?.pedidosOnlinePorFormaPagamento)
    ? dados.pedidosOnlinePorFormaPagamento
    : [];
  const pedidosOnlinePorDia = Array.isArray(dados?.pedidosOnlinePorDia) ? dados.pedidosOnlinePorDia : [];
  const pedidosOnlineTotalRegistros = Number(dados?.pedidosOnlineTotalRegistros || 0);
  const pedidosOnlineDetalhes = Array.isArray(dados?.pedidosOnlineDetalhes) ? dados.pedidosOnlineDetalhes : [];
  const entregasPorDia = Array.isArray(dados?.entregasPorDia) ? dados.entregasPorDia : [];
  const desempenhoMotoboy = Array.isArray(dados?.desempenhoMotoboy) ? dados.desempenhoMotoboy : [];
  const entregasDiarioMotoboy = Array.isArray(dados?.entregasDiarioMotoboy) ? dados.entregasDiarioMotoboy : [];
  const caixaMovimentos = Array.isArray(dados?.caixaMovimentos) ? dados.caixaMovimentos : [];
  const statusMesas = Array.isArray(dados?.statusMesas) ? dados.statusMesas : [];
  const estoqueBaixo = Array.isArray(dados?.estoqueBaixo) ? dados.estoqueBaixo : [];
  const sessoesCaixa = dados?.sessoesCaixa || {};

  const pagamentosChart = pagamentosPorForma.map((item) => ({
    label: nomeFormaPagamento(item.forma_pagamento),
    valor: Number(item.total || 0),
    extra: `${inteiro(item.vendas)} venda(s) | ${percentual(item.percentual_faturamento || 0)}`
  }));

  const vendasPorDiaChart = vendasPorDia.map((item) => ({
    label: new Date(`${item.data}T12:00:00`).toLocaleDateString("pt-BR"),
    valor: Number(item.total || 0),
    extra: `${inteiro(item.vendas)} venda(s)`
  }));

  const vendasPorHoraChart = vendasPorHora.map((item) => ({
    label: `${String(item.hora || 0).padStart(2, "0")}h`,
    valor: Number(item.total || 0),
    extra: `${inteiro(item.vendas)} venda(s)`
  }));

  const topProdutosFiltrados = useMemo(() => {
    const busca = String(buscaTopProdutos || "")
      .trim()
      .toLowerCase();
    if (!busca) return topProdutos;
    return topProdutos.filter((item) =>
      String(item?.nome_produto || "")
        .toLowerCase()
        .includes(busca)
    );
  }, [topProdutos, buscaTopProdutos]);

  const topProdutosPreviewChart = topProdutos.slice(0, 8).map((item) => ({
    label: item.nome_produto,
    valor: Number(item.faturamento || 0),
    extra: `${inteiro(item.quantidade)} item(ns)`
  }));

  const topCategoriasChart = topCategorias.map((item) => ({
    label: item.categoria,
    valor: Number(item.faturamento || 0),
    extra: `${inteiro(item.quantidade)} item(ns)`
  }));

  const garcomChart = desempenhoGarcom.map((item) => ({
    label: item.garcom,
    valor: Number(item.total || 0),
    extra: `${inteiro(item.vendas)} venda(s) | Ticket medio ${moeda(item.ticket_medio)}`
  }));

  const pedidosOnlineFonteChart = pedidosOnlinePorFonte.map((item) => ({
    label: nomeFonteOnline(item.source),
    valor: Number(item.valor_total || 0),
    extra: `${inteiro(item.pedidos)} pedido(s) | ${inteiro(item.cancelados)} cancelado(s)`
  }));

  const pedidosOnlinePagamentoChart = pedidosOnlinePorFormaPagamento.map((item) => ({
    label: `${nomeFonteOnline(item.source)} - ${nomeFormaPagamento(item.payment)}`,
    valor: Number(item.valor_total || 0),
    extra: `${inteiro(item.pedidos)} pedido(s) | Ticket ${moeda(item.ticket_medio)}`
  }));

  const entregasDiaChart = entregasPorDia.map((item) => ({
    label: new Date(`${item.data}T12:00:00`).toLocaleDateString("pt-BR"),
    valor: Number(item.total || 0),
    extra: `${inteiro(item.entregues)} entregue(s) | ${inteiro(item.cancelados)} cancelado(s)`
  }));

  const motoboyChart = desempenhoMotoboy.map((item) => ({
    label: item.motoboy,
    valor: Number(item.total || 0),
    extra: `${inteiro(item.atribuidos)} atribuido(s) | ${inteiro(item.entregues)} entregue(s)`
  }));

  const comparativo = dados?.comparativo || {};

  const comparativoCards = [
    { titulo: "Dia", bloco: comparativo?.dia },
    { titulo: "Semana", bloco: comparativo?.semana },
    { titulo: "Mes", bloco: comparativo?.mes }
  ]
    .map((item) => {
      const atual = item.bloco?.atual;
      const anterior = item.bloco?.anterior;
      const periodoAtual = item.bloco?.periodo_atual;
      const periodoAnterior = item.bloco?.periodo_anterior;
      if (!atual || !anterior || !periodoAtual || !periodoAnterior) return null;

      const faturamentoAtual = Number(atual.faturamento_total || 0);
      const faturamentoAnterior = Number(anterior.faturamento_total || 0);
      const ticketAtual = Number(atual.ticket_medio || 0);
      const ticketAnterior = Number(anterior.ticket_medio || 0);

      const variacaoFaturamento =
        faturamentoAnterior > 0
          ? ((faturamentoAtual - faturamentoAnterior) / faturamentoAnterior) * 100
          : null;
      const variacaoTicket =
        ticketAnterior > 0 ? ((ticketAtual - ticketAnterior) / ticketAnterior) * 100 : null;

      return {
        titulo: item.titulo,
        atual,
        anterior,
        periodoAtual,
        periodoAnterior,
        variacaoFaturamento,
        variacaoTicket
      };
    })
    .filter(Boolean);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={headerCardStyle}>
        <div style={headerTopStyle}>
          <h2 style={{ margin: 0 }}>Relatorios Gerenciais</h2>
          <div style={{ color: "#9aa8d8", fontSize: 13 }}>
            Consolidado de vendas, caixa, pagamento, produtos, categorias e desempenho da operacao.
          </div>
        </div>

        <div style={filtrosGridStyle}>
          <SelectField
            value={preset}
            onChange={handleMudarPreset}
            options={[
              { value: "HOJE", label: "Hoje" },
              { value: "ULT_7", label: "Ultimos 7 dias" },
              { value: "ULT_30", label: "Ultimos 30 dias" },
              { value: "ULT_90", label: "Ultimos 90 dias" },
              { value: "MES_ATUAL", label: "Mes atual" },
              { value: "MES_ANTERIOR", label: "Mes anterior" },
              { value: "PERSONALIZADO", label: "Periodo personalizado" }
            ]}
            buttonStyle={inputStyle}
          />

          <DatePickerField value={dataInicio} onChange={setDataInicio} placeholder="Data inicial" />
          <DatePickerField value={dataFim} onChange={setDataFim} placeholder="Data final" />

          <button type="button" style={buttonStyle(carregando)} onClick={aplicarPeriodoManual} disabled={carregando}>
            Aplicar periodo
          </button>
          <button type="button" style={secondaryButtonStyle(!dados)} onClick={exportarCsv} disabled={!dados}>
            Exportar CSV
          </button>
          <button type="button" style={secondaryButtonStyle(!dados)} onClick={exportarJson} disabled={!dados}>
            Exportar JSON
          </button>
        </div>

        <div style={{ color: "#b7bfdc", fontSize: 13 }}>
          Periodo atual:{" "}
          <strong>{periodoFormatado(periodo?.data_inicial || dataInicio, periodo?.data_final || dataFim)}</strong>
          {" | "}
          Dias no filtro: <strong>{inteiro(periodo?.dias || 0)}</strong>
          {periodo?.gerado_em ? (
            <>
              {" | "}Gerado em:{" "}
              <strong>{formatDateTimePtBr(periodo.gerado_em)}</strong>
            </>
          ) : null}
        </div>
      </div>

      {erro ? <div style={erroBoxStyle}>{erro}</div> : null}
      {carregando ? <div style={cardStyle}>Carregando relatorios...</div> : null}

      {!carregando && (
        <>
          <div style={relatorioTabsWrapStyle}>
            <button
              type="button"
              style={abaRelatorioButtonStyle(abaRelatorio === "MESAS")}
              onClick={() => setAbaRelatorio("MESAS")}
            >
              Mesas
            </button>
            <button
              type="button"
              style={abaRelatorioButtonStyle(abaRelatorio === "ONLINE")}
              onClick={() => setAbaRelatorio("ONLINE")}
            >
              Online
            </button>
          </div>

          {abaRelatorio === "MESAS" && (
            <div style={kpiGridStyle}>
              <KpiCard label="Faturamento total" value={moeda(resumo.faturamento_total)} />
              <KpiCard label="Subtotal produtos" value={moeda(resumo.subtotal_produtos)} />
              <KpiCard label="Taxa de servico" value={moeda(resumo.taxa_servico_total)} />
              <KpiCard label="Couvert artistico" value={moeda(resumo.couvert_total)} />
              <KpiCard label="Vendas" value={inteiro(resumo.vendas)} />
              <KpiCard label="Ticket medio" value={moeda(resumo.ticket_medio)} />
              <KpiCard label="Itens vendidos" value={inteiro(resumo.itens_vendidos)} />
              <KpiCard label="Pessoas atendidas" value={inteiro(resumo.pessoas_atendidas)} />
              <KpiCard
                label="Tempo medio por conta"
                value={`${Number(resumo.tempo_medio_minutos || 0).toLocaleString("pt-BR")} min`}
              />
              <KpiCard label="Pedidos com couvert" value={inteiro(resumo.pedidos_com_couvert)} />
            </div>
          )}

          {abaRelatorio === "ONLINE" && (
            <>
              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Online (iFood e 99)</h3>
                <div style={kpiGridStyle}>
                  <KpiCard label="Pedidos online" value={inteiro(pedidosOnlineResumo.pedidos)} />
                  <KpiCard label="Valor total online" value={moeda(pedidosOnlineResumo.valor_total)} />
                  <KpiCard label="Ticket medio online" value={moeda(pedidosOnlineResumo.ticket_medio)} />
                  <KpiCard label="Cancelados online" value={inteiro(pedidosOnlineResumo.cancelados)} />
                </div>
              </div>

              <div style={grid2Style}>
                <BarCard
                  titulo="Online por canal"
                  itens={pedidosOnlineFonteChart}
                  emptyText="Sem pedidos online (iFood/99) no periodo."
                  formatadorValor={moeda}
                  color="#5ec9ff"
                  maxListaAltura={320}
                />
                <BarCard
                  titulo="Online por forma de pagamento"
                  itens={pedidosOnlinePagamentoChart}
                  emptyText="Sem formas de pagamento online no periodo."
                  formatadorValor={moeda}
                  color="#69d089"
                  maxListaAltura={320}
                />
              </div>

              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Diario online por canal</h3>
                <div style={{ color: "#9fb0e3", fontSize: 12 }}>
                  Valores e quantidade de pedidos por dia para iFood e 99 Food.
                </div>
                <div
                  style={{
                    ...tableWrapStyle,
                    maxHeight: 320,
                    overflow: "auto",
                    border: "1px solid #2f3861",
                    borderRadius: 12
                  }}
                >
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Data</th>
                        <th style={thStyle}>Canal</th>
                        <th style={thStyle}>Pedidos</th>
                        <th style={thStyle}>Valor total</th>
                        <th style={thStyle}>Ticket medio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidosOnlinePorDia.map((item, idx) => {
                        const pedidos = Number(item.pedidos || 0);
                        const valorTotal = Number(item.valor_total || 0);
                        return (
                          <tr key={`online-dia-${item.data}-${item.source}-${idx}`}>
                            <td style={tdStyle}>{new Date(`${item.data}T12:00:00`).toLocaleDateString("pt-BR")}</td>
                            <td style={tdStyle}>{nomeFonteOnline(item.source)}</td>
                            <td style={tdStyle}>{inteiro(pedidos)}</td>
                            <td style={tdStyle}>{moeda(valorTotal)}</td>
                            <td style={tdStyle}>{pedidos > 0 ? moeda(valorTotal / pedidos) : moeda(0)}</td>
                          </tr>
                        );
                      })}
                      {pedidosOnlinePorDia.length < 1 && (
                        <tr>
                          <td style={tdStyle} colSpan={5}>
                            Nenhum pedido online encontrado no periodo.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Pedidos online detalhados</h3>
                <div style={{ color: "#9fb0e3", fontSize: 12 }}>
                  Mostrando os ultimos {inteiro(pedidosOnlineDetalhes.length)} pedido(s) no periodo.
                  {pedidosOnlineTotalRegistros > pedidosOnlineDetalhes.length
                    ? ` Total no periodo: ${inteiro(pedidosOnlineTotalRegistros)}.`
                    : ""}
                </div>
                <div
                  style={{
                    ...tableWrapStyle,
                    maxHeight: 340,
                    overflow: "auto",
                    border: "1px solid #2f3861",
                    borderRadius: 12
                  }}
                >
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Data/hora</th>
                        <th style={thStyle}>Pedido</th>
                        <th style={thStyle}>Canal</th>
                        <th style={thStyle}>Pagamento</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Valor</th>
                        <th style={thStyle}>Cliente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidosOnlineDetalhes.map((item, idx) => (
                        <tr key={`online-det-${item.id || item.numero}-${idx}`}>
                          <td style={tdStyle}>{formatDateTimePtBr(item.data_hora || item.data)}</td>
                          <td style={tdStyle}>{item.numero || "-"}</td>
                          <td style={tdStyle}>{nomeFonteOnline(item.source)}</td>
                          <td style={tdStyle}>{nomeFormaPagamento(item.payment)}</td>
                          <td style={tdStyle}>{item.status || "-"}</td>
                          <td style={tdStyle}>{moeda(item.total)}</td>
                          <td style={tdStyle}>{item.cliente || "-"}</td>
                        </tr>
                      ))}
                      {pedidosOnlineDetalhes.length < 1 && (
                        <tr>
                          <td style={tdStyle} colSpan={7}>
                            Nenhum pedido online detalhado encontrado no periodo.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={grid2Style}>
                <BarCard
                  titulo="Entregas por dia (motoboy)"
                  itens={entregasDiaChart}
                  emptyText="Sem entregas no periodo."
                  formatadorValor={inteiro}
                  color="#8a8dff"
                  maxListaAltura={320}
                />
                <BarCard
                  titulo="Desempenho por motoboy (entregas)"
                  itens={motoboyChart}
                  emptyText="Sem dados de motoboy no periodo."
                  formatadorValor={inteiro}
                  color="#f2a640"
                  maxListaAltura={320}
                />
              </div>

              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Relatorio diario de motoboy</h3>
                <div
                  style={{
                    ...tableWrapStyle,
                    maxHeight: 320,
                    overflow: "auto",
                    border: "1px solid #2f3861",
                    borderRadius: 12
                  }}
                >
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Data</th>
                        <th style={thStyle}>Motoboy</th>
                        <th style={thStyle}>Total</th>
                        <th style={thStyle}>Entregues</th>
                        <th style={thStyle}>Cancelados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entregasDiarioMotoboy.map((item, idx) => (
                        <tr key={`ent-dia-motoboy-${item.data}-${item.motoboy}-${idx}`}>
                          <td style={tdStyle}>{new Date(`${item.data}T12:00:00`).toLocaleDateString("pt-BR")}</td>
                          <td style={tdStyle}>{item.motoboy || "Sem motoboy"}</td>
                          <td style={tdStyle}>{inteiro(item.total)}</td>
                          <td style={tdStyle}>{inteiro(item.entregues)}</td>
                          <td style={tdStyle}>{inteiro(item.cancelados)}</td>
                        </tr>
                      ))}
                      {entregasDiarioMotoboy.length < 1 && (
                        <tr>
                          <td style={tdStyle} colSpan={5}>
                            Nenhum registro de motoboy no periodo.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {abaRelatorio === "MESAS" && (
            <>

          <div style={grid2Style}>
            <BarCard
              titulo="Faturamento por forma de pagamento"
              itens={pagamentosChart}
              emptyText="Sem pagamentos no periodo."
              formatadorValor={moeda}
              color="#2e63f4"
            />
            <BarCard
              titulo="Vendas por dia"
              itens={vendasPorDiaChart}
              emptyText="Sem vendas no periodo."
              formatadorValor={moeda}
              color="#14a86e"
              maxListaAltura={460}
            />
          </div>

          <div style={grid2Style}>
            <TopProdutosCard
              titulo="Top produtos por faturamento"
              itens={topProdutosPreviewChart}
              totalCompleto={topProdutos.length}
              emptyText="Sem itens vendidos no periodo."
              formatadorValor={moeda}
              color="#f2a640"
              onVerTodos={() => setModalTopProdutosAberto(true)}
            />
            <BarCard
              titulo="Top categorias por faturamento"
              itens={topCategoriasChart}
              emptyText="Sem categorias no periodo."
              formatadorValor={moeda}
              color="#7b8cff"
              maxListaAltura={460}
            />
          </div>

          <div style={grid2Style}>
            <BarCard
              titulo="Desempenho por garcom"
              itens={garcomChart}
              emptyText="Sem vendas fechadas por garcom no periodo."
              formatadorValor={moeda}
              color="#4fc4ff"
              maxListaAltura={460}
            />
            <BarCard
              titulo="Vendas por hora"
              itens={vendasPorHoraChart}
              emptyText="Sem vendas no periodo."
              formatadorValor={moeda}
              color="#7fd265"
            />
          </div>

          <div style={grid2Style}>
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Pagamentos detalhados</h3>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Forma</th>
                      <th style={thStyle}>Total</th>
                      <th style={thStyle}>Vendas</th>
                      <th style={thStyle}>Ticket</th>
                      <th style={thStyle}>Participacao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagamentosPorForma.map((item) => (
                      <tr key={`pag-${item.forma_pagamento}`}>
                        <td style={tdStyle}>{nomeFormaPagamento(item.forma_pagamento)}</td>
                        <td style={tdStyle}>{moeda(item.total)}</td>
                        <td style={tdStyle}>{inteiro(item.vendas)}</td>
                        <td style={tdStyle}>{moeda(item.ticket_medio)}</td>
                        <td style={tdStyle}>{percentual(item.percentual_faturamento)}</td>
                      </tr>
                    ))}
                    {pagamentosPorForma.length < 1 && (
                      <tr>
                        <td style={tdStyle} colSpan={5}>
                          Sem dados no periodo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Movimentos de caixa no periodo</h3>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Tipo</th>
                      <th style={thStyle}>Total</th>
                      <th style={thStyle}>Qtde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caixaMovimentos.map((item) => (
                      <tr key={`mov-${item.tipo}`}>
                        <td style={tdStyle}>{nomeTipoMovimento(item.tipo)}</td>
                        <td style={tdStyle}>{moeda(item.total)}</td>
                        <td style={tdStyle}>{inteiro(item.quantidade)}</td>
                      </tr>
                    ))}
                    {caixaMovimentos.length < 1 && (
                      <tr>
                        <td style={tdStyle} colSpan={3}>
                          Sem movimentos no periodo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={caixaResumoGridStyle}>
                <KpiCard label="Sessoes totais" value={inteiro(sessoesCaixa.sessoes_total)} />
                <KpiCard label="Sessoes fechadas" value={inteiro(sessoesCaixa.sessoes_fechadas)} />
                <KpiCard label="Sessoes abertas" value={inteiro(sessoesCaixa.sessoes_abertas)} />
                <KpiCard label="Faturamento de sessoes fechadas" value={moeda(sessoesCaixa.faturamento_fechado)} />
              </div>
            </div>
          </div>

          <div style={grid2Style}>
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Status atual das mesas</h3>
              <div style={statusListStyle}>
                {statusMesas.map((item) => (
                  <div key={`status-${item.status}`} style={statusItemStyle}>
                    <span>{nomeStatusMesa(item.status)}</span>
                    <strong>{inteiro(item.quantidade)}</strong>
                  </div>
                ))}
                {statusMesas.length < 1 && <div style={{ color: "#b8c0db" }}>Sem dados de mesas.</div>}
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Estoque baixo</h3>
              <div style={estoqueListStyle}>
                {estoqueBaixo.map((item) => (
                  <div key={`estoque-${item.id}`} style={estoqueItemStyle}>
                    <strong>{item.nome}</strong>
                    <span>
                      Atual: {inteiro(item.estoque)} | Minimo: {inteiro(item.estoque_minimo)}
                    </span>
                  </div>
                ))}
                {estoqueBaixo.length < 1 && <div style={{ color: "#b8c0db" }}>Sem alerta de estoque.</div>}
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Comparativo de desempenho</h3>
            <div style={comparativoGridStyle}>
              {comparativoCards.map((item) => (
                <div key={`cmp-${item.titulo}`} style={comparativoCardStyle}>
                  <div style={comparativoTituloStyle}>{item.titulo}</div>
                  <div style={comparativoPeriodoStyle}>
                    Atual: {periodoFormatado(item.periodoAtual.inicio, item.periodoAtual.fim)}
                  </div>
                  <div style={comparativoLinhaStyle}>
                    <span>Faturamento</span>
                    <strong>{moeda(item.atual.faturamento_total)}</strong>
                  </div>
                  <div style={comparativoLinhaStyle}>
                    <span>Ticket medio</span>
                    <strong>{moeda(item.atual.ticket_medio)}</strong>
                  </div>
                  <div style={comparativoPeriodoStyle}>
                    Anterior: {periodoFormatado(item.periodoAnterior.inicio, item.periodoAnterior.fim)}
                  </div>
                  <div style={comparativoLinhaStyle}>
                    <span>Faturamento</span>
                    <strong>{moeda(item.anterior.faturamento_total)}</strong>
                  </div>
                  <div style={comparativoLinhaStyle}>
                    <span>Ticket medio</span>
                    <strong>{moeda(item.anterior.ticket_medio)}</strong>
                  </div>
                  <div style={comparativoLinhaStyle}>
                    <span>Variacao faturamento</span>
                    <strong>
                      {item.variacaoFaturamento === null
                        ? "Sem base"
                        : percentual(item.variacaoFaturamento)}
                    </strong>
                  </div>
                  <div style={comparativoLinhaStyle}>
                    <span>Variacao ticket</span>
                    <strong>
                      {item.variacaoTicket === null ? "Sem base" : percentual(item.variacaoTicket)}
                    </strong>
                  </div>
                </div>
              ))}
              {comparativoCards.length < 1 && <div style={{ color: "#b8c0db" }}>Comparativo indisponivel.</div>}
            </div>
          </div>
        </>
      )}
        </>
      )}

      <TopProdutosModal
        aberto={modalTopProdutosAberto}
        itens={topProdutosFiltrados}
        busca={buscaTopProdutos}
        onBuscaChange={setBuscaTopProdutos}
        onFechar={fecharModalTopProdutos}
      />
    </div>
  );
}

const headerCardStyle = {
  border: "1px solid #2d3352",
  borderRadius: 16,
  background: "#151a31",
  padding: 14,
  display: "grid",
  gap: 12
};

const headerTopStyle = {
  display: "grid",
  gap: 6
};

const filtrosGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 8,
  alignItems: "end"
};

const inputStyle = {
  minHeight: 42,
  border: "1px solid #3b4263",
  background: "#121427",
  borderRadius: 10,
  color: "#fff"
};

const erroBoxStyle = {
  border: "1px solid #9b3b4d",
  background: "#41161c",
  borderRadius: 12,
  padding: "8px 10px"
};

const relatorioTabsWrapStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center"
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10
};

const kpiCardStyle = {
  border: "1px solid #2d3352",
  borderRadius: 14,
  background: "#141a32",
  padding: "10px 12px",
  display: "grid",
  gap: 4
};

const grid2Style = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
  alignItems: "start"
};

const cardStyle = {
  border: "1px solid #2d3352",
  borderRadius: 16,
  background: "#151a31",
  padding: 14,
  display: "grid",
  gap: 10,
  alignContent: "start"
};

const barListStyle = {
  display: "grid",
  gap: 10,
  alignContent: "start"
};

const barHeadStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 4
};

const barSubStyle = {
  color: "#9cabdb",
  fontSize: 12,
  marginBottom: 5
};

const barTrackStyle = {
  width: "100%",
  height: 10,
  borderRadius: 999,
  border: "1px solid #2d3352",
  background: "#0f1326",
  overflow: "hidden"
};

const barFillStyle = {
  height: "100%",
  borderRadius: 999
};

const tableWrapStyle = {
  overflowX: "auto"
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 520
};

const thStyle = {
  textAlign: "left",
  borderBottom: "1px solid #384066",
  color: "#aeb8dd",
  fontSize: 12,
  padding: "6px 6px"
};

const tdStyle = {
  borderBottom: "1px solid #283152",
  padding: "7px 6px"
};

const caixaResumoGridStyle = {
  marginTop: 4,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 8
};

const statusListStyle = {
  display: "grid",
  gap: 8,
  alignContent: "start"
};

const statusItemStyle = {
  border: "1px solid #2d3352",
  borderRadius: 10,
  background: "#11172e",
  padding: "8px 10px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center"
};

const estoqueListStyle = {
  display: "grid",
  gap: 8,
  maxHeight: 240,
  overflow: "auto",
  paddingRight: 2
};

const estoqueItemStyle = {
  border: "1px solid #7a3b49",
  borderRadius: 10,
  background: "#2a1121",
  padding: "8px 10px",
  display: "grid",
  gap: 4,
  color: "#f8d4dd"
};

const comparativoGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 10
};

const comparativoCardStyle = {
  border: "1px solid #33406b",
  borderRadius: 12,
  background: "#121a35",
  padding: "10px 12px",
  display: "grid",
  gap: 6
};

const comparativoTituloStyle = {
  fontSize: 18,
  fontWeight: 800
};

const comparativoPeriodoStyle = {
  color: "#9fb0e3",
  fontSize: 12
};

const comparativoLinhaStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10
};

const topProdutosHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10
};

const topProdutosCountStyle = {
  fontSize: 12,
  color: "#9fb0e3",
  border: "1px solid #2d3352",
  borderRadius: 999,
  padding: "4px 10px",
  background: "#0f152b"
};

const topProdutosFooterStyle = {
  marginTop: 4,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap"
};

const topProdutosFooterInfoStyle = {
  color: "#9fb0e3",
  fontSize: 12
};

const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 1300,
  background: "rgba(4, 8, 18, 0.72)",
  display: "grid",
  placeItems: "center",
  padding: 16
};

const modalCardStyle = {
  width: "min(920px, 96vw)",
  maxHeight: "min(86vh, 760px)",
  border: "1px solid #35426f",
  borderRadius: 16,
  background: "#151a31",
  padding: 14,
  display: "grid",
  gap: 10
};

const modalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8
};

const modalInfoStyle = {
  color: "#aab7e6",
  fontSize: 13
};

const modalTableWrapStyle = {
  overflow: "auto",
  border: "1px solid #2f3861",
  borderRadius: 12,
  maxHeight: "min(62vh, 560px)"
};

function buttonStyle(disabled) {
  return {
    minHeight: 42,
    border: "none",
    borderRadius: 10,
    background: disabled ? "#5e6484" : "#2e63f4",
    color: "#fff",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "0 12px"
  };
}

function secondaryButtonStyle(disabled) {
  return {
    minHeight: 42,
    border: "1px solid #3d4770",
    borderRadius: 10,
    background: disabled ? "#252a44" : "#1b213c",
    color: "#d7def9",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "0 12px"
  };
}

function miniActionButtonStyle(disabled) {
  return {
    minHeight: 34,
    border: "1px solid #3d4770",
    borderRadius: 10,
    background: disabled ? "#252a44" : "#1b213c",
    color: "#d7def9",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "0 12px"
  };
}
