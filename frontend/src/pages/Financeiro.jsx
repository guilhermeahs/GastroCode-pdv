import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { imprimirResumoCaixa } from "../services/print";
import { api } from "../services/api";
import DatePickerField from "../components/DatePickerField";
import SelectField from "../components/SelectField";
import ConfirmDialog from "../components/ConfirmDialog";

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function hojeLocalIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatoDia(dataIso) {
  if (!dataIso) return "-";
  const [ano, mes, dia] = String(dataIso).split("-");
  if (!ano || !mes || !dia) return dataIso;
  return `${dia}/${mes}`;
}

function formatoPeriodo(inicio, fim) {
  if (!inicio || !fim) return "-";
  const inicioFmt = formatoDia(inicio);
  const fimFmt = formatoDia(fim);
  if (inicioFmt === fimFmt) return inicioFmt;
  return `${inicioFmt} ate ${fimFmt}`;
}

function calcularVariacaoPercentual(atual, anterior) {
  const atualNum = Number(atual || 0);
  const anteriorNum = Number(anterior || 0);

  if (anteriorNum === 0) {
    if (atualNum === 0) return 0;
    return null;
  }

  return Number((((atualNum - anteriorNum) / anteriorNum) * 100).toFixed(1));
}

function textoVariacaoPercentual(valor) {
  if (valor === null || valor === undefined) return "Sem base anterior";
  if (valor > 0) return `+${valor.toFixed(1)}%`;
  if (valor < 0) return `${valor.toFixed(1)}%`;
  return "0,0%";
}

const initialProduto = {
  nome: "",
  categoria: "",
  preco: "",
  estoque: "",
  estoque_minimo: ""
};

const initialProdutoEdicao = {
  nome: "",
  categoria: "",
  preco: "",
  estoque: "",
  estoque_minimo: ""
};

function nomeFormaPagamento(codigo) {
  const code = String(codigo || "").toUpperCase();
  if (code === "PIX") return "Pix";
  if (code === "CREDITO") return "Credito";
  if (code === "DEBITO") return "Debito";
  if (code === "DINHEIRO") return "Dinheiro";
  if (code === "MISTO") return "Misto";
  return code || "Nao informado";
}

function nomeTipoMovimento(tipo) {
  const code = String(tipo || "").toUpperCase();
  if (code === "SANGRIA") return "Sangria";
  if (code === "SUPRIMENTO") return "Suprimento";
  if (code === "RETIRADA") return "Retirada";
  if (code === "ABERTURA") return "Abertura";
  return code || "Movimento";
}

const MOVIMENTO_OPTIONS = [
  { value: "SANGRIA", label: "Sangria" },
  { value: "SUPRIMENTO", label: "Suprimento" },
  { value: "RETIRADA", label: "Retirada" }
];

const MODO_LOTE_OPTIONS = [
  { value: "SOMAR", label: "Somar no estoque atual" },
  { value: "DEFINIR", label: "Definir estoque exato" }
];

function normalizarHeaderCsv(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function splitCsvLine(line, separator) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === separator) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  cells.push(current.trim());
  return cells;
}

function parseNumeroCsv(valor) {
  const txt = String(valor || "").trim();
  if (!txt) return NaN;
  const compactado = txt.replace(/\s/g, "");
  let normalizado = compactado;

  if (compactado.includes(",") && compactado.includes(".")) {
    normalizado = compactado.replace(/\./g, "").replace(",", ".");
  } else if (compactado.includes(",")) {
    normalizado = compactado.replace(",", ".");
  }

  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : NaN;
}

function parseNumeroEntrada(valor) {
  const txt = String(valor || "").trim();
  if (!txt) return NaN;

  const semEspacos = txt.replace(/\s/g, "");
  let normalizado = semEspacos;

  if (semEspacos.includes(",") && semEspacos.includes(".")) {
    normalizado = semEspacos.replace(/\./g, "").replace(",", ".");
  } else if (semEspacos.includes(",")) {
    normalizado = semEspacos.replace(",", ".");
  }

  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : NaN;
}

function limparEntradaDecimal(valor) {
  return String(valor || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/(?!^)-/g, "");
}

function limparEntradaInteira(valor) {
  return String(valor || "").replace(/[^\d]/g, "");
}

function parseCsvProdutos(raw) {
  const conteudo = String(raw || "").replace(/^\uFEFF/, "");
  const linhas = conteudo
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (linhas.length === 0) {
    return {
      itens: [],
      erros: [{ linha: 0, erro: "Arquivo vazio." }]
    };
  }

  const separador = linhas[0].includes(";") ? ";" : ",";
  const headerCols = splitCsvLine(linhas[0], separador);
  const headerMap = new Map();
  headerCols.forEach((col, index) => {
    headerMap.set(normalizarHeaderCsv(col), index);
  });

  const indexNome = headerMap.get("nome");
  const indexCategoria = headerMap.get("categoria");
  const indexPreco = headerMap.get("preco");
  const indexEstoque = headerMap.has("estoque") ? headerMap.get("estoque") : null;
  const indexEstoqueMinimo = headerMap.has("estoqueminimo") ? headerMap.get("estoqueminimo") : null;

  if ([indexNome, indexCategoria, indexPreco].some((idx) => idx === undefined)) {
    return {
      itens: [],
      erros: [
        {
          linha: 1,
          erro: "Cabecalho invalido. Use: nome,categoria,preco,estoque,estoque_minimo"
        }
      ]
    };
  }

  const itens = [];
  const erros = [];

  for (let rowIndex = 1; rowIndex < linhas.length; rowIndex += 1) {
    const cols = splitCsvLine(linhas[rowIndex], separador);
    const nome = String(cols[indexNome] || "").trim();
    const categoria = String(cols[indexCategoria] || "").trim();
    const preco = parseNumeroCsv(cols[indexPreco]);
    const estoque = indexEstoque === null ? 0 : parseNumeroCsv(cols[indexEstoque]);
    const estoqueMinimo =
      indexEstoqueMinimo === null ? 0 : parseNumeroCsv(cols[indexEstoqueMinimo]);

    if (!nome || !categoria || !Number.isFinite(preco) || preco <= 0) {
      erros.push({
        linha: rowIndex + 1,
        erro: "Linha invalida. Verifique nome, categoria e preco."
      });
      continue;
    }

    itens.push({
      nome,
      categoria,
      preco: Number(preco.toFixed(2)),
      estoque: Number.isFinite(estoque) && estoque >= 0 ? Math.floor(estoque) : 0,
      estoque_minimo:
        Number.isFinite(estoqueMinimo) && estoqueMinimo >= 0 ? Math.floor(estoqueMinimo) : 0
    });
  }

  return { itens, erros };
}

function BarChart({ titulo, data, emptyText, color = "#2e63f4", formatValue = (v) => v }) {
  const maxValue = useMemo(() => {
    return data.reduce((max, item) => Math.max(max, Number(item.valor || 0)), 0);
  }, [data]);

  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>{titulo}</h3>

      {data.length === 0 && <p style={{ marginBottom: 0 }}>{emptyText}</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {data.map((item) => {
          const valor = Number(item.valor || 0);
          const largura = maxValue > 0 ? `${Math.max(6, (valor / maxValue) * 100)}%` : "0%";

          return (
            <div key={item.label}>
              <div style={barLabelStyle}>
                <span>{item.label}</span>
                <strong>{formatValue(valor)}</strong>
              </div>

              <div style={barTrackStyle}>
                <div style={{ ...barFillStyle, width: largura, background: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Financeiro() {
  const {
    financeiro,
    produtos,
    role,
    caixa,
    filtroFinanceiroData,
    filtroFinanceiroPeriodo,
    definirFiltroFinanceiroPorData,
    definirFiltroFinanceiroPeriodo,
    criarProduto,
    atualizarProduto,
    atualizarEstoqueProduto,
    atualizarEstoqueProdutoLote,
    importarProdutosLote,
    removerProduto,
    abrirCaixa,
    fecharCaixa,
    movimentarCaixa,
    configImpressao,
    configuracaoImpressaoAtual,
    hasPermission
  } = useApp();

  const [novoProduto, setNovoProduto] = useState(initialProduto);
  const [estoqueEdit, setEstoqueEdit] = useState({});
  const [buscaProduto, setBuscaProduto] = useState("");
  const [filtroCategoriaProduto, setFiltroCategoriaProduto] = useState("TODAS");
  const [pinSegurancaProdutos, setPinSegurancaProdutos] = useState("");
  const [modoLoteEstoque, setModoLoteEstoque] = useState("SOMAR");
  const [valorLoteEstoque, setValorLoteEstoque] = useState("");
  const [modoImportacaoEstoque, setModoImportacaoEstoque] = useState("SOMAR");
  const [arquivoImportacaoNome, setArquivoImportacaoNome] = useState("");
  const [itensImportacao, setItensImportacao] = useState([]);
  const [errosImportacao, setErrosImportacao] = useState([]);
  const [processandoLoteEstoque, setProcessandoLoteEstoque] = useState(false);
  const [processandoImportacao, setProcessandoImportacao] = useState(false);
  const [erroOperacaoProdutos, setErroOperacaoProdutos] = useState("");
  const [saldoInicialCaixa, setSaldoInicialCaixa] = useState("");
  const [observacaoCaixa, setObservacaoCaixa] = useState("");
  const [resumoFechamento, setResumoFechamento] = useState(null);
  const [salvandoProduto, setSalvandoProduto] = useState(false);
  const [salvandoEstoqueId, setSalvandoEstoqueId] = useState(null);
  const [processandoCaixa, setProcessandoCaixa] = useState(false);
  const [processandoMovimento, setProcessandoMovimento] = useState(false);
  const [movimentoTipo, setMovimentoTipo] = useState("SANGRIA");
  const [movimentoValor, setMovimentoValor] = useState("");
  const [movimentoJustificativa, setMovimentoJustificativa] = useState("");
  const [confirmAbrirCaixaOpen, setConfirmAbrirCaixaOpen] = useState(false);
  const [confirmFecharCaixaOpen, setConfirmFecharCaixaOpen] = useState(false);
  const [saldoInicialPendente, setSaldoInicialPendente] = useState(0);
  const [confirmExcluirProdutoOpen, setConfirmExcluirProdutoOpen] = useState(false);
  const [produtoPendenteExclusao, setProdutoPendenteExclusao] = useState(null);
  const [confirmEditarProdutoOpen, setConfirmEditarProdutoOpen] = useState(false);
  const [produtoPendenteEdicao, setProdutoPendenteEdicao] = useState(null);
  const [edicaoProduto, setEdicaoProduto] = useState(initialProdutoEdicao);
  const [salvandoEdicaoProduto, setSalvandoEdicaoProduto] = useState(false);
  const [erroOperacaoCaixa, setErroOperacaoCaixa] = useState("");
  const [saldoContadoFechamento, setSaldoContadoFechamento] = useState("");
  const [relatorioDias, setRelatorioDias] = useState("30");
  const [relatorioDataFinal, setRelatorioDataFinal] = useState(() => hojeLocalIso());
  const [relatorios, setRelatorios] = useState(null);
  const [carregandoRelatorios, setCarregandoRelatorios] = useState(false);
  const [erroRelatorios, setErroRelatorios] = useState("");
  const [relatorioRefreshSeq, setRelatorioRefreshSeq] = useState(0);
  const [filtroDataInicio, setFiltroDataInicio] = useState(
    () => filtroFinanceiroPeriodo?.data_inicio || hojeLocalIso()
  );
  const [filtroDataFim, setFiltroDataFim] = useState(
    () => filtroFinanceiroPeriodo?.data_fim || hojeLocalIso()
  );

  const pinProdutosValido = /^\d{4,8}$/.test(String(pinSegurancaProdutos || "").trim());
  const podeVerResumoFinanceiro = hasPermission("APP_FINANCEIRO_VER");
  const podeVerRelatorios = hasPermission("APP_FINANCEIRO_RELATORIOS");
  const podeGerirCaixa = hasPermission("APP_CAIXA_GERIR");
  const podeVerProdutos = hasPermission("APP_PRODUTOS_VER");
  const podeCadastrarProdutos = hasPermission("APP_PRODUTOS_CADASTRAR");
  const podeEditarProdutos = hasPermission("APP_PRODUTOS_EDITAR");
  const podeAjustarEstoque = hasPermission("APP_PRODUTOS_ESTOQUE");
  const podeImportarProdutos = hasPermission("APP_PRODUTOS_IMPORTAR");
  const podeExcluirProdutos = hasPermission("APP_PRODUTOS_EXCLUIR");

  const podeGerirProdutos =
    podeVerProdutos ||
    podeCadastrarProdutos ||
    podeEditarProdutos ||
    podeAjustarEstoque ||
    podeImportarProdutos ||
    podeExcluirProdutos;

  const podeAbrirPagina =
    podeVerResumoFinanceiro || podeGerirCaixa || podeVerRelatorios || podeGerirProdutos;

  useEffect(() => {
    setFiltroDataInicio(filtroFinanceiroPeriodo?.data_inicio || hojeLocalIso());
    setFiltroDataFim(filtroFinanceiroPeriodo?.data_fim || hojeLocalIso());
  }, [filtroFinanceiroPeriodo?.data_inicio, filtroFinanceiroPeriodo?.data_fim]);

  useEffect(() => {
    if (!caixa?.aberto && !String(saldoInicialCaixa || "").trim()) {
      setSaldoInicialCaixa("0");
    }
  }, [caixa?.aberto]);

  useEffect(() => {
    let ativo = true;

    async function carregarRelatorios() {
      if (!podeVerRelatorios) {
        if (ativo) {
          setRelatorios(null);
        }
        return;
      }

      setCarregandoRelatorios(true);
      setErroRelatorios("");
      try {
        const data = await api.getFinanceiroRelatorios(role, {
          dias: Number(relatorioDias || 30),
          data_final: relatorioDataFinal || null
        });
        if (!ativo) return;
        setRelatorios(data);
      } catch (error) {
        if (!ativo) return;
        setErroRelatorios(error?.message || "Falha ao carregar relatorios.");
      } finally {
        if (ativo) {
          setCarregandoRelatorios(false);
        }
      }
    }

    carregarRelatorios();

    return () => {
      ativo = false;
    };
  }, [role, relatorioDias, relatorioDataFinal, relatorioRefreshSeq, podeVerRelatorios]);

  if (!podeAbrirPagina) {
    return <p>Sem permissao para acessar financeiro/produtos.</p>;
  }

  const dados = financeiro || {
    caixaHoje: {},
    faturamentoPorForma: [],
    produtosMaisVendidos: [],
    estoqueBaixo: [],
    data_referencia: filtroFinanceiroData || hojeLocalIso(),
    data_inicio: filtroFinanceiroPeriodo?.data_inicio || hojeLocalIso(),
    data_fim: filtroFinanceiroPeriodo?.data_fim || hojeLocalIso()
  };

  const periodoFinanceiroTexto = formatoPeriodo(
    dados.data_inicio || filtroFinanceiroPeriodo?.data_inicio || hojeLocalIso(),
    dados.data_fim || filtroFinanceiroPeriodo?.data_fim || hojeLocalIso()
  );

  const produtosOrdenados = useMemo(() => {
    return [...produtos].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [produtos]);

  const categoriasProdutosOptions = useMemo(() => {
    const categorias = Array.from(
      new Set(
        produtosOrdenados
          .map((item) => String(item.categoria || "").trim())
          .filter((item) => item.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));

    return [
      { value: "TODAS", label: "Todas categorias" },
      ...categorias.map((categoria) => ({ value: categoria, label: categoria }))
    ];
  }, [produtosOrdenados]);

  const produtosFiltrados = useMemo(() => {
    const termo = buscaProduto.trim().toLowerCase();
    const filtroCategoria = String(filtroCategoriaProduto || "TODAS");
    return produtosOrdenados.filter((produto) => {
      const categoriaOk =
        filtroCategoria === "TODAS" || String(produto.categoria || "") === filtroCategoria;
      if (!categoriaOk) return false;
      if (!termo) return true;

      return (
        String(produto.nome || "").toLowerCase().includes(termo) ||
        String(produto.categoria || "").toLowerCase().includes(termo)
      );
    });
  }, [produtosOrdenados, buscaProduto, filtroCategoriaProduto]);

  const faturamentoPorFormaChart = useMemo(() => {
    return (dados.faturamentoPorForma || []).map((item) => ({
      label: nomeFormaPagamento(item.forma_pagamento),
      valor: Number(item.total || 0)
    }));
  }, [dados.faturamentoPorForma]);

  const produtosMaisVendidosChart = useMemo(() => {
    return (dados.produtosMaisVendidos || []).map((item) => ({
      label: item.nome_produto,
      valor: Number(item.quantidade || 0)
    }));
  }, [dados.produtosMaisVendidos]);

  const vendasPorDiaChart = useMemo(() => {
    return (relatorios?.vendasPorDia || []).map((item) => ({
      label: formatoDia(item.data),
      valor: Number(item.total || 0)
    }));
  }, [relatorios?.vendasPorDia]);

  const topCategoriasChart = useMemo(() => {
    return (relatorios?.topCategorias || []).map((item) => ({
      label: item.categoria,
      valor: Number(item.faturamento || 0)
    }));
  }, [relatorios?.topCategorias]);

  const comparativoCards = useMemo(() => {
    const comparativo = relatorios?.comparativo || null;
    if (!comparativo) return [];

    const blocos = [
      { chave: "dia", titulo: "Dia", dados: comparativo.dia },
      { chave: "semana", titulo: "Semana", dados: comparativo.semana },
      { chave: "mes", titulo: "Mes", dados: comparativo.mes }
    ];

    return blocos
      .map((bloco) => {
        const atual = bloco?.dados?.atual || null;
        const anterior = bloco?.dados?.anterior || null;
        const periodoAtual = bloco?.dados?.periodo_atual || null;
        const periodoAnterior = bloco?.dados?.periodo_anterior || null;
        if (!atual || !anterior || !periodoAtual || !periodoAnterior) return null;

        const variacaoFaturamento = calcularVariacaoPercentual(
          atual.faturamento_total,
          anterior.faturamento_total
        );
        const variacaoTicket = calcularVariacaoPercentual(atual.ticket_medio, anterior.ticket_medio);

        return {
          ...bloco,
          atual,
          anterior,
          periodoAtualTexto: formatoPeriodo(periodoAtual.inicio, periodoAtual.fim),
          periodoAnteriorTexto: formatoPeriodo(periodoAnterior.inicio, periodoAnterior.fim),
          variacaoFaturamento,
          variacaoTicket
        };
      })
      .filter(Boolean);
  }, [relatorios?.comparativo]);

  const relatorioDiasOptions = useMemo(
    () => [
      { value: "7", label: "Ultimos 7 dias" },
      { value: "30", label: "Ultimos 30 dias" },
      { value: "90", label: "Ultimos 90 dias" },
      { value: "180", label: "Ultimos 180 dias" }
    ],
    []
  );

  const saldoFinalEstimadoAtual = Number(caixa?.resumo_saldo?.saldo_final_estimado || 0);
  const saldoContadoNumerico =
    String(saldoContadoFechamento || "").trim() === ""
      ? null
      : Number(String(saldoContadoFechamento).replace(",", "."));
  const diferencaFechamentoPrevia =
    saldoContadoNumerico === null || !Number.isFinite(saldoContadoNumerico)
      ? null
      : Number((saldoContadoNumerico - saldoFinalEstimadoAtual).toFixed(2));

  async function handleCadastrarProduto(e) {
    e.preventDefault();
    setSalvandoProduto(true);

    try {
      const payload = {
        nome: novoProduto.nome,
        categoria: novoProduto.categoria,
        preco: Number(novoProduto.preco || 0),
        estoque: Number(novoProduto.estoque || 0),
        estoque_minimo: Number(novoProduto.estoque_minimo || 0)
      };

      const resultado = await criarProduto(payload);
      if (resultado) {
        setNovoProduto(initialProduto);
      }
    } finally {
      setSalvandoProduto(false);
    }
  }

  async function handleSalvarEstoque(produto) {
    const valorDigitado = estoqueEdit[produto.id];
    const estoqueFinal =
      valorDigitado === undefined || valorDigitado === ""
        ? produto.estoque
        : Number(valorDigitado);

    setSalvandoEstoqueId(produto.id);

    try {
      const resultado = await atualizarEstoqueProduto(produto.id, estoqueFinal);
      if (resultado) {
        setEstoqueEdit((prev) => {
          const next = { ...prev };
          delete next[produto.id];
          return next;
        });
      }
    } finally {
      setSalvandoEstoqueId(null);
    }
  }

  async function handleExcluirProduto(produto) {
    setProdutoPendenteExclusao(produto);
    setConfirmExcluirProdutoOpen(true);
  }

  function handleEditarProduto(produto) {
    setProdutoPendenteEdicao(produto);
    setEdicaoProduto({
      nome: String(produto?.nome || ""),
      categoria: String(produto?.categoria || ""),
      preco: Number(produto?.preco || 0).toFixed(2).replace(".", ","),
      estoque: String(Number(produto?.estoque || 0)),
      estoque_minimo: String(Number(produto?.estoque_minimo || 0))
    });
    setConfirmEditarProdutoOpen(true);
  }

  async function confirmarExcluirProduto() {
    if (!produtoPendenteExclusao) return;
    const pin = String(pinSegurancaProdutos || "").trim();
    if (!/^\d{4,8}$/.test(pin)) {
      setErroOperacaoProdutos("Informe o PIN de seguranca (4 a 8 numeros) para excluir produto.");
      return;
    }

    setSalvandoEstoqueId(produtoPendenteExclusao.id);
    try {
      await removerProduto(produtoPendenteExclusao.id, pin);
      setErroOperacaoProdutos("");
    } finally {
      setSalvandoEstoqueId(null);
      setConfirmExcluirProdutoOpen(false);
      setProdutoPendenteExclusao(null);
    }
  }

  async function confirmarEditarProduto() {
    if (!produtoPendenteEdicao) return;
    const pin = String(pinSegurancaProdutos || "").trim();
    if (!/^\d{4,8}$/.test(pin)) {
      setErroOperacaoProdutos("Informe o PIN de seguranca (4 a 8 numeros) para editar produto.");
      return;
    }

    const preco = parseNumeroEntrada(edicaoProduto.preco);
    const estoque = parseNumeroEntrada(edicaoProduto.estoque);
    const estoqueMinimo = parseNumeroEntrada(edicaoProduto.estoque_minimo);

    if (!String(edicaoProduto.nome || "").trim()) {
      setErroOperacaoProdutos("Informe o nome do produto.");
      return;
    }
    if (!String(edicaoProduto.categoria || "").trim()) {
      setErroOperacaoProdutos("Informe a categoria do produto.");
      return;
    }
    if (!Number.isFinite(preco) || preco <= 0) {
      setErroOperacaoProdutos("Informe um preco valido.");
      return;
    }
    if (!Number.isFinite(estoque) || estoque < 0) {
      setErroOperacaoProdutos("Informe um estoque valido.");
      return;
    }
    if (!Number.isFinite(estoqueMinimo) || estoqueMinimo < 0) {
      setErroOperacaoProdutos("Informe um estoque minimo valido.");
      return;
    }

    setSalvandoEdicaoProduto(true);
    try {
      const payload = {
        nome: String(edicaoProduto.nome || "").trim(),
        categoria: String(edicaoProduto.categoria || "").trim(),
        preco,
        estoque: Math.floor(estoque),
        estoque_minimo: Math.floor(estoqueMinimo)
      };
      const ok = await atualizarProduto(produtoPendenteEdicao.id, payload);
      if (!ok) return;

      setErroOperacaoProdutos("");
      setConfirmEditarProdutoOpen(false);
      setProdutoPendenteEdicao(null);
      setEdicaoProduto(initialProdutoEdicao);
    } finally {
      setSalvandoEdicaoProduto(false);
    }
  }

  async function handleAplicarLoteEstoque() {
    const pin = String(pinSegurancaProdutos || "").trim();
    if (!/^\d{4,8}$/.test(pin)) {
      setErroOperacaoProdutos("Informe o PIN de seguranca (4 a 8 numeros) para ajuste em lote.");
      return;
    }

    const valor = Number(String(valorLoteEstoque || "").replace(",", "."));
    if (!Number.isFinite(valor)) {
      setErroOperacaoProdutos("Informe um valor valido para o lote.");
      return;
    }

    const ids = produtosFiltrados.map((item) => item.id);
    if (ids.length === 0) {
      setErroOperacaoProdutos("Nenhum produto encontrado para aplicar o lote.");
      return;
    }

    setProcessandoLoteEstoque(true);
    try {
      const resultado = await atualizarEstoqueProdutoLote(
        {
          produto_ids: ids,
          operacao: modoLoteEstoque,
          valor
        },
        pin
      );
      if (resultado) {
        setValorLoteEstoque("");
        setErroOperacaoProdutos("");
      }
    } finally {
      setProcessandoLoteEstoque(false);
    }
  }

  async function handleArquivoImportacao(event) {
    const arquivo = event.target.files?.[0];
    event.target.value = "";

    if (!arquivo) return;
    const texto = await arquivo.text();
    const parse = parseCsvProdutos(texto);
    setArquivoImportacaoNome(arquivo.name);
    setItensImportacao(parse.itens);
    setErrosImportacao(parse.erros);
    setErroOperacaoProdutos("");
  }

  async function handleImportarProdutosLote() {
    const pin = String(pinSegurancaProdutos || "").trim();
    if (!/^\d{4,8}$/.test(pin)) {
      setErroOperacaoProdutos("Informe o PIN de seguranca (4 a 8 numeros) para importar lote.");
      return;
    }

    if (!Array.isArray(itensImportacao) || itensImportacao.length === 0) {
      setErroOperacaoProdutos("Nenhum item valido para importar. Selecione um CSV valido.");
      return;
    }

    setProcessandoImportacao(true);
    try {
      const resultado = await importarProdutosLote(
        {
          itens: itensImportacao,
          modo_estoque: modoImportacaoEstoque
        },
        pin
      );
      if (resultado) {
        setErroOperacaoProdutos("");
        setItensImportacao([]);
        setErrosImportacao([]);
        setArquivoImportacaoNome("");
      }
    } finally {
      setProcessandoImportacao(false);
    }
  }

  async function handleAbrirCaixa() {
    setErroOperacaoCaixa("");
    const saldoInicial = Number(String(saldoInicialCaixa || "0").replace(",", "."));
    if (!Number.isFinite(saldoInicial) || saldoInicial < 0) {
      setErroOperacaoCaixa("Saldo inicial invalido. Informe um valor maior ou igual a zero.");
      return;
    }

    setSaldoInicialPendente(Number(saldoInicial.toFixed(2)));
    setConfirmAbrirCaixaOpen(true);
  }

  async function confirmarAbrirCaixa() {
    setProcessandoCaixa(true);
    try {
      const resultado = await abrirCaixa({
        saldo_inicial: saldoInicialPendente,
        observacao: observacaoCaixa
      });

      if (resultado) {
        setSaldoInicialCaixa("");
        setObservacaoCaixa("");
        setResumoFechamento(null);
        setErroOperacaoCaixa("");
      }
    } finally {
      setProcessandoCaixa(false);
      setConfirmAbrirCaixaOpen(false);
    }
  }

  async function handleFecharCaixa() {
    setErroOperacaoCaixa("");

    if (
      saldoContadoNumerico !== null &&
      (!Number.isFinite(saldoContadoNumerico) || saldoContadoNumerico < 0)
    ) {
      setErroOperacaoCaixa("Saldo contado invalido. Informe um valor maior ou igual a zero.");
      return;
    }

    setConfirmFecharCaixaOpen(true);
  }

  async function confirmarFecharCaixa() {
    setProcessandoCaixa(true);
    try {
      const resultado = await fecharCaixa({
        observacao: observacaoCaixa,
        saldo_contado:
          saldoContadoNumerico === null ? null : Number(saldoContadoNumerico.toFixed(2))
      });

      if (resultado?.resumo) {
        setResumoFechamento(resultado.resumo);
        setObservacaoCaixa("");
        setSaldoContadoFechamento("");
        setErroOperacaoCaixa("");
        if (configImpressao.auto_imprimir_fechamento_caixa) {
          imprimirResumoCaixa(resultado.resumo, configuracaoImpressaoAtual);
        }
      }
    } finally {
      setProcessandoCaixa(false);
      setConfirmFecharCaixaOpen(false);
    }
  }

  async function handleMovimentarCaixa(e) {
    e.preventDefault();
    setErroOperacaoCaixa("");
    const valor = Number(movimentoValor || 0);
    if (!Number.isFinite(valor) || valor <= 0) {
      setErroOperacaoCaixa("Informe um valor valido para o movimento.");
      return;
    }

    if (String(movimentoJustificativa || "").trim().length < 3) {
      setErroOperacaoCaixa("Informe uma justificativa com pelo menos 3 caracteres.");
      return;
    }

    setProcessandoMovimento(true);
    try {
      const resultado = await movimentarCaixa({
        tipo: movimentoTipo,
        valor,
        justificativa: movimentoJustificativa
      });
      if (resultado) {
        setMovimentoValor("");
        setMovimentoJustificativa("");
        setErroOperacaoCaixa("");
      }
    } finally {
      setProcessandoMovimento(false);
    }
  }

  function handleAplicarFiltroFinanceiro() {
    definirFiltroFinanceiroPeriodo({
      data_inicio: filtroDataInicio || hojeLocalIso(),
      data_fim: filtroDataFim || filtroDataInicio || hojeLocalIso()
    });
  }

  function handleHojeFinanceiro() {
    const hoje = hojeLocalIso();
    setFiltroDataInicio(hoje);
    setFiltroDataFim(hoje);
    definirFiltroFinanceiroPorData(hoje);
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>{podeVerResumoFinanceiro ? "Dashboard Financeiro" : "Produtos e estoque"}</h2>

      {podeVerResumoFinanceiro && (
        <div style={filtrosTopoStyle}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ color: "#aeb6d3", fontSize: 13 }}>Data inicial</label>
            <DatePickerField
              value={filtroDataInicio || ""}
              onChange={setFiltroDataInicio}
              placeholder="Inicio"
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ color: "#aeb6d3", fontSize: 13 }}>Data final</label>
            <DatePickerField
              value={filtroDataFim || ""}
              onChange={setFiltroDataFim}
              placeholder="Fim"
            />
          </div>

          <button type="button" onClick={handleAplicarFiltroFinanceiro} style={buttonStyle(false)}>
            Aplicar periodo
          </button>

          <button type="button" onClick={handleHojeFinanceiro} style={buttonStyle(false)}>
            Voltar para hoje
          </button>

          <div style={{ color: "#aeb6d3", alignSelf: "end" }}>
            Periodo selecionado: {periodoFinanceiroTexto}
          </div>
        </div>
      )}

      {podeGerirCaixa && (
        <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Controle de caixa</h3>
        {erroOperacaoCaixa && (
          <div style={erroBoxStyle}>{erroOperacaoCaixa}</div>
        )}

        {caixa?.aberto && caixa?.sessao && (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ color: "#83d6a9", fontWeight: 700 }}>Caixa aberto</div>
            <div>Abertura: {new Date(caixa.sessao.opened_at).toLocaleString("pt-BR")}</div>
            <div>Saldo inicial: {moeda(caixa.sessao.saldo_inicial)}</div>

            {caixa?.resumo_saldo && (
              <div style={resumoMovimentosBoxStyle}>
                <div>Suprimento: {moeda(caixa.resumo_saldo.suprimento)}</div>
                <div>Sangria: {moeda(caixa.resumo_saldo.sangria)}</div>
                <div>Retirada: {moeda(caixa.resumo_saldo.retirada)}</div>
                <div style={{ fontWeight: 700 }}>
                  Saldo apos movimentos: {moeda(caixa.resumo_saldo.saldo_apos_movimentos)}
                </div>
                <div style={{ fontWeight: 700, color: "#cde1ff" }}>
                  Saldo final estimado: {moeda(caixa.resumo_saldo.saldo_final_estimado)}
                </div>
              </div>
            )}

            <form onSubmit={handleMovimentarCaixa} style={movimentoFormStyle}>
              <strong>Movimentar caixa</strong>
              <div style={movimentoGridStyle}>
                <SelectField
                  value={movimentoTipo}
                  onChange={setMovimentoTipo}
                  options={MOVIMENTO_OPTIONS}
                  buttonStyle={inputStyle}
                  wrapperStyle={{ minWidth: 0 }}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={movimentoValor}
                  onChange={(e) => setMovimentoValor(e.target.value)}
                  placeholder="Valor"
                  style={inputStyle}
                  disabled={processandoMovimento || processandoCaixa}
                />
              </div>
              <textarea
                value={movimentoJustificativa}
                onChange={(e) => setMovimentoJustificativa(e.target.value)}
                placeholder="Justificativa obrigatoria"
                style={{ ...inputStyle, minHeight: 64, resize: "vertical" }}
                disabled={processandoMovimento || processandoCaixa}
              />
              <button
                type="submit"
                style={buttonStyle(processandoMovimento || processandoCaixa)}
                disabled={processandoMovimento || processandoCaixa}
              >
                {processandoMovimento ? "Salvando movimento..." : "Registrar movimento"}
              </button>
            </form>

            {Array.isArray(caixa.movimentos) && caixa.movimentos.length > 0 && (
              <div style={movimentosListaStyle}>
                <strong>Extrato do caixa aberto</strong>
                <div style={{ display: "grid", gap: 6 }}>
                  {caixa.movimentos.slice(0, 20).map((mov) => (
                    <div key={mov.id} style={movimentoItemStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <strong>{nomeTipoMovimento(mov.tipo)}</strong>
                        <span>{moeda(mov.valor)}</span>
                      </div>
                      <div style={{ color: "#b8c0db", fontSize: 13 }}>
                        {new Date(mov.created_at).toLocaleString("pt-BR")} - {mov.usuario_nome || "Sistema"}
                      </div>
                      <div style={{ color: "#d6ddfa", fontSize: 13 }}>
                        {mov.justificativa || "Sem justificativa"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={fieldStackStyle}>
              <label style={fieldLabelStyle}>Saldo contado no fechamento (opcional)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={saldoContadoFechamento}
                onChange={(e) => setSaldoContadoFechamento(e.target.value)}
                placeholder="Valor contado no caixa"
                style={inputStyle}
                disabled={processandoCaixa || processandoMovimento}
              />
              {diferencaFechamentoPrevia !== null && (
                <div style={diferencaPrevStyle(diferencaFechamentoPrevia)}>
                  Diferenca prevista: {moeda(diferencaFechamentoPrevia)}
                </div>
              )}
            </div>

            <textarea
              value={observacaoCaixa}
              onChange={(e) => setObservacaoCaixa(e.target.value)}
              placeholder="Observacao de fechamento (opcional)"
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
              disabled={processandoCaixa}
            />

            <div style={caixaAcoesStyle}>
              <button
                type="button"
                onClick={handleFecharCaixa}
                style={dangerButtonStyle(processandoCaixa || processandoMovimento)}
                disabled={processandoCaixa || processandoMovimento}
              >
                {processandoCaixa ? "Fechando..." : "Fechar caixa"}
              </button>
            </div>
          </div>
        )}

        {!caixa?.aberto && (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ color: "#ffdb9e", fontWeight: 700 }}>Caixa fechado</div>
            <div style={{ color: "#b8c0db", fontSize: 14 }}>
              Informe o saldo inicial para iniciar o turno.
            </div>

            <input
              type="number"
              step="0.01"
              min="0"
              value={saldoInicialCaixa}
              onChange={(e) => setSaldoInicialCaixa(e.target.value)}
              placeholder="Saldo inicial"
              style={inputStyle}
              disabled={processandoCaixa}
            />

            <textarea
              value={observacaoCaixa}
              onChange={(e) => setObservacaoCaixa(e.target.value)}
              placeholder="Observacao de abertura (opcional)"
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
              disabled={processandoCaixa}
            />

            <div style={caixaAcoesStyle}>
              <button
                type="button"
                onClick={handleAbrirCaixa}
                style={buttonStyle(processandoCaixa)}
                disabled={processandoCaixa}
              >
                {processandoCaixa ? "Abrindo..." : "Abrir caixa"}
              </button>
            </div>

            {caixa?.ultima_sessao && (
              <div style={ultimaSessaoStyle}>
                Ultimo fechamento: {new Date(caixa.ultima_sessao.closed_at).toLocaleString("pt-BR")} -{" "}
                {moeda(caixa.ultima_sessao.total_vendas)}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {podeVerRelatorios && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={relatorioHeaderStyle}>
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>Relatorios gerenciais</h3>
            <div style={{ color: "#b8c0db", fontSize: 13 }}>
              Periodo para analise de vendas, ticket medio e categorias.
            </div>
          </div>
          <div style={relatorioFiltrosStyle}>
            <SelectField
              value={relatorioDias}
              onChange={setRelatorioDias}
              options={relatorioDiasOptions}
              buttonStyle={inputStyle}
              wrapperStyle={{ minWidth: 0 }}
            />
            <DatePickerField
              value={relatorioDataFinal || ""}
              onChange={setRelatorioDataFinal}
              placeholder="Data final"
            />
            <button
              type="button"
              onClick={() => setRelatorioRefreshSeq((prev) => prev + 1)}
              style={secondaryButtonStyle(carregandoRelatorios)}
              disabled={carregandoRelatorios}
            >
              {carregandoRelatorios ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>

        {erroRelatorios && <div style={erroBoxStyle}>{erroRelatorios}</div>}

        {!erroRelatorios && relatorios && (
          <>
            <div style={resumoRelatorioGridStyle}>
              <div style={resumoRelatorioItemStyle}>
                <small>Periodo</small>
                <strong>
                  {formatoDia(relatorios.periodo?.data_inicial)} ate{" "}
                  {formatoDia(relatorios.periodo?.data_final)}
                </strong>
              </div>
              <div style={resumoRelatorioItemStyle}>
                <small>Faturamento</small>
                <strong>{moeda(relatorios.resumo?.faturamento_total)}</strong>
              </div>
              <div style={resumoRelatorioItemStyle}>
                <small>Ticket medio</small>
                <strong>{moeda(relatorios.resumo?.ticket_medio)}</strong>
              </div>
              <div style={resumoRelatorioItemStyle}>
                <small>Vendas</small>
                <strong>{Number(relatorios.resumo?.vendas || 0)}</strong>
              </div>
            </div>

            {comparativoCards.length > 0 && (
              <div style={comparativoGridStyle}>
                {comparativoCards.map((item) => (
                  <div key={item.chave} style={comparativoCardStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <strong style={{ fontSize: 16 }}>{item.titulo}</strong>
                      <span style={comparativoPeriodoBadgeStyle}>{item.periodoAtualTexto}</span>
                    </div>

                    <div style={comparativoLinhaStyle}>
                      <span>Faturamento</span>
                      <strong>{moeda(item.atual.faturamento_total)}</strong>
                    </div>
                    <div style={comparativoLinhaStyle}>
                      <span>Ticket medio</span>
                      <strong>{moeda(item.atual.ticket_medio)}</strong>
                    </div>
                    <div style={comparativoLinhaStyle}>
                      <span>Vendas</span>
                      <strong>{Number(item.atual.vendas || 0)}</strong>
                    </div>

                    <div style={{ ...comparativoLinhaStyle, marginTop: 6 }}>
                      <small style={{ color: "#9fb0e3" }}>Periodo anterior: {item.periodoAnteriorTexto}</small>
                    </div>
                    <div style={comparativoVariacaoRowStyle}>
                      <span style={comparativoVariacaoLabelStyle}>Fat.</span>
                      <span style={comparativoVariacaoChipStyle(item.variacaoFaturamento)}>
                        {textoVariacaoPercentual(item.variacaoFaturamento)}
                      </span>
                      <span style={comparativoVariacaoLabelStyle}>Ticket</span>
                      <span style={comparativoVariacaoChipStyle(item.variacaoTicket)}>
                        {textoVariacaoPercentual(item.variacaoTicket)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ ...gridSecoesStyle, marginTop: 12 }}>
              <BarChart
                titulo="Faturamento por dia"
                data={vendasPorDiaChart}
                emptyText="Sem vendas no periodo."
                color="#2e63f4"
                formatValue={(valor) => moeda(valor)}
              />
              <BarChart
                titulo="Top categorias"
                data={topCategoriasChart}
                emptyText="Sem categorias no periodo."
                color="#1c9a5e"
                formatValue={(valor) => moeda(valor)}
              />
            </div>
          </>
        )}
      </div>
      )}

      {resumoFechamento && (
        <div style={{ ...cardStyle, border: "1px solid #1f8a63", marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Resumo do fechamento do caixa</h3>
          <div style={resumoFechamentoGridStyle}>
            <div>Periodo inicio: {new Date(resumoFechamento.periodo_inicio).toLocaleString("pt-BR")}</div>
            <div>Periodo fim: {new Date(resumoFechamento.periodo_fim).toLocaleString("pt-BR")}</div>
            <div>Saldo inicial: {moeda(resumoFechamento.saldo_inicial)}</div>
            {resumoFechamento.saldo_contado !== null && resumoFechamento.saldo_contado !== undefined && (
              <div>Saldo contado: {moeda(resumoFechamento.saldo_contado)}</div>
            )}
            {resumoFechamento.diferenca_fechamento !== null &&
              resumoFechamento.diferenca_fechamento !== undefined && (
                <div style={diferencaPrevStyle(Number(resumoFechamento.diferenca_fechamento || 0))}>
                  Diferenca fechamento: {moeda(resumoFechamento.diferenca_fechamento)}
                </div>
              )}
            <div>Subtotal: {moeda(resumoFechamento.caixa.subtotal_produtos)}</div>
            <div>Taxa de servico: {moeda(resumoFechamento.caixa.taxa_servico_total)}</div>
            <div>Total vendido: {moeda(resumoFechamento.caixa.faturamento_total)}</div>
            <div>Vendas: {resumoFechamento.caixa.vendas}</div>
            {resumoFechamento.movimentos && (
              <>
                <div>Suprimento: {moeda(resumoFechamento.movimentos.suprimento)}</div>
                <div>Sangria: {moeda(resumoFechamento.movimentos.sangria)}</div>
                <div>Retirada: {moeda(resumoFechamento.movimentos.retirada)}</div>
                <div>Saldo apos movimentos: {moeda(resumoFechamento.movimentos.saldo_apos_movimentos)}</div>
              </>
            )}
            <div style={{ fontWeight: 700 }}>
              Saldo final estimado: {moeda(resumoFechamento.saldo_final_estimado)}
            </div>
          </div>

          <div style={caixaAcoesStyle}>
            <button
              type="button"
              onClick={() => imprimirResumoCaixa(resumoFechamento, configuracaoImpressaoAtual)}
              style={buttonStyle(false)}
            >
              Imprimir resumo
            </button>
            <button type="button" onClick={() => setResumoFechamento(null)} style={secondaryButtonStyle(false)}>
              Fechar painel
            </button>
          </div>
        </div>
      )}

      {podeVerResumoFinanceiro && (
        <>
          <div style={gridResumoStyle}>
            <div style={cardStyle}>
              <strong>Faturamento do dia</strong>
              <div style={valueStyle}>{moeda(dados.caixaHoje.faturamento_total)}</div>
            </div>

            <div style={cardStyle}>
              <strong>Subtotal de produtos</strong>
              <div style={valueStyle}>{moeda(dados.caixaHoje.subtotal_produtos)}</div>
            </div>

            <div style={cardStyle}>
              <strong>Taxa de servico</strong>
              <div style={valueStyle}>{moeda(dados.caixaHoje.taxa_servico_total)}</div>
            </div>

            <div style={cardStyle}>
              <strong>Vendas</strong>
              <div style={valueStyle}>{dados.caixaHoje.vendas || 0}</div>
            </div>
          </div>

          <div style={gridSecoesStyle}>
            <BarChart
              titulo="Faturamento por pagamento"
              data={faturamentoPorFormaChart}
              emptyText="Nenhum pagamento registrado para esse dia."
              color="#2e63f4"
              formatValue={(valor) => moeda(valor)}
            />

            <BarChart
              titulo="Produtos mais vendidos"
              data={produtosMaisVendidosChart}
              emptyText="Nenhuma venda registrada para esse dia."
              color="#1c9a5e"
              formatValue={(valor) => `${valor} un.`}
            />
          </div>

          <div style={{ ...cardStyle, marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Estoque baixo</h3>
            {dados.estoqueBaixo.length === 0 && <p style={{ marginBottom: 0 }}>Nenhum item em alerta.</p>}

            {dados.estoqueBaixo.length > 0 && (
              <div style={chipsContainerStyle}>
                {dados.estoqueBaixo.map((item) => (
                  <div key={item.id} style={estoqueChipStyle}>
                    <strong>{item.nome}</strong>
                    <span>
                      {item.estoque} / minimo {item.estoque_minimo}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {podeGerirProdutos && (
        <div style={{ ...gridSecoesStyle, marginTop: 16 }}>
          {(podeCadastrarProdutos || podeImportarProdutos) && (
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Cadastro de produtos</h3>

              {podeCadastrarProdutos ? (
                <form onSubmit={handleCadastrarProduto} style={{ display: "grid", gap: 10 }}>
                  <input
                    value={novoProduto.nome}
                    onChange={(e) => setNovoProduto((prev) => ({ ...prev, nome: e.target.value }))}
                    placeholder="Nome do item"
                    style={inputStyle}
                    disabled={salvandoProduto}
                  />

                  <input
                    value={novoProduto.categoria}
                    onChange={(e) => setNovoProduto((prev) => ({ ...prev, categoria: e.target.value }))}
                    placeholder="Categoria"
                    list="categorias-produto-lista"
                    style={inputStyle}
                    disabled={salvandoProduto}
                  />
                  <datalist id="categorias-produto-lista">
                    {categoriasProdutosOptions
                      .filter((option) => option.value !== "TODAS")
                      .map((option) => (
                        <option key={option.value} value={option.value} />
                      ))}
                  </datalist>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={novoProduto.preco}
                      onChange={(e) => setNovoProduto((prev) => ({ ...prev, preco: e.target.value }))}
                      placeholder="Preco"
                      style={inputStyle}
                      disabled={salvandoProduto}
                    />

                    <input
                      type="number"
                      min="0"
                      value={novoProduto.estoque}
                      onChange={(e) => setNovoProduto((prev) => ({ ...prev, estoque: e.target.value }))}
                      placeholder="Estoque inicial"
                      style={inputStyle}
                      disabled={salvandoProduto}
                    />
                  </div>

                  <input
                    type="number"
                    min="0"
                    value={novoProduto.estoque_minimo}
                    onChange={(e) => setNovoProduto((prev) => ({ ...prev, estoque_minimo: e.target.value }))}
                    placeholder="Estoque minimo"
                    style={inputStyle}
                    disabled={salvandoProduto}
                  />

                  <button type="submit" style={buttonStyle(salvandoProduto)} disabled={salvandoProduto}>
                    {salvandoProduto ? "Salvando..." : "Cadastrar produto"}
                  </button>
                </form>
              ) : (
                <div style={subtleLineStyle}>Seu perfil permite importar, mas nao cadastrar manualmente.</div>
              )}

              {podeImportarProdutos && (
                <div style={loteBoxStyle}>
                  <strong>Importacao em lote (CSV)</strong>
                  <div style={subtleLineStyle}>
                    Cabecalho esperado: <code>nome,categoria,preco,estoque,estoque_minimo</code>
                  </div>

                  <div style={loteGridFormStyle}>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleArquivoImportacao}
                      style={inputStyle}
                      disabled={processandoImportacao}
                    />
                    <SelectField
                      value={modoImportacaoEstoque}
                      onChange={setModoImportacaoEstoque}
                      options={MODO_LOTE_OPTIONS}
                      buttonStyle={inputStyle}
                      wrapperStyle={{ minWidth: 0 }}
                    />
                  </div>

                  {arquivoImportacaoNome ? (
                    <div style={subtleLineStyle}>
                      Arquivo: <strong>{arquivoImportacaoNome}</strong> | Itens validos:{" "}
                      <strong>{itensImportacao.length}</strong> | Erros: <strong>{errosImportacao.length}</strong>
                    </div>
                  ) : null}

                  {errosImportacao.length > 0 && (
                    <div style={erroBoxStyle}>
                      {errosImportacao.slice(0, 4).map((item) => (
                        <div key={`${item.linha}-${item.erro}`}>
                          Linha {item.linha}: {item.erro}
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleImportarProdutosLote}
                    style={buttonStyle(processandoImportacao || itensImportacao.length === 0)}
                    disabled={processandoImportacao || itensImportacao.length === 0}
                  >
                    {processandoImportacao ? "Importando..." : "Importar lote"}
                  </button>
                </div>
              )}
            </div>
          )}

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Produtos e estoque</h3>
            <p style={subtleLineStyle}>
              Busca, filtro por categoria e ajuste em lote para varios produtos de uma vez.
            </p>

            {erroOperacaoProdutos && <div style={erroBoxStyle}>{erroOperacaoProdutos}</div>}

            {(podeAjustarEstoque || podeEditarProdutos || podeExcluirProdutos || podeImportarProdutos) && (
              <div style={fieldStackStyle}>
                <label style={fieldLabelStyle}>PIN de seguranca (obrigatorio em acoes sensiveis)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pinSegurancaProdutos}
                  onChange={(e) => setPinSegurancaProdutos(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="4 a 8 numeros"
                  style={inputStyle}
                />
                <div style={pinStatusStyle(pinProdutosValido)}>
                  {pinProdutosValido
                    ? "PIN valido: acoes sensiveis liberadas."
                    : "Sem PIN valido: voce pode abrir as telas e revisar, mas so confirma com PIN."}
                </div>
              </div>
            )}

            <div style={loteGridFormStyle}>
              <input
                value={buscaProduto}
                onChange={(e) => setBuscaProduto(e.target.value)}
                placeholder="Buscar por nome ou categoria"
                style={{ ...inputStyle, width: "100%" }}
              />
              <SelectField
                value={filtroCategoriaProduto}
                onChange={setFiltroCategoriaProduto}
                options={categoriasProdutosOptions}
                buttonStyle={inputStyle}
                wrapperStyle={{ minWidth: 0 }}
              />
            </div>

            {podeAjustarEstoque && (
              <div style={loteBoxStyle}>
                <strong>Ajuste em lote do filtro atual</strong>
                <div style={loteGridFormStyle}>
                  <SelectField
                    value={modoLoteEstoque}
                    onChange={setModoLoteEstoque}
                    options={MODO_LOTE_OPTIONS}
                    buttonStyle={inputStyle}
                    wrapperStyle={{ minWidth: 0 }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={valorLoteEstoque}
                    onChange={(e) => setValorLoteEstoque(e.target.value)}
                    placeholder={modoLoteEstoque === "DEFINIR" ? "Novo estoque" : "Incremento (+/-)"}
                    style={inputStyle}
                    disabled={processandoLoteEstoque}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAplicarLoteEstoque}
                  style={buttonStyle(processandoLoteEstoque || produtosFiltrados.length === 0)}
                  disabled={processandoLoteEstoque || produtosFiltrados.length === 0}
                >
                  {processandoLoteEstoque
                    ? "Aplicando lote..."
                    : `Aplicar em ${produtosFiltrados.length} produto(s)`}
                </button>
              </div>
            )}

            <div style={listaProdutosScrollStyle}>
              {produtosFiltrados.map((produto) => {
                const salvandoEste = salvandoEstoqueId === produto.id;
                const valorInput =
                  estoqueEdit[produto.id] === undefined ? String(produto.estoque) : estoqueEdit[produto.id];

                return (
                  <div key={produto.id} style={estoqueItemStyle}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{produto.nome}</div>
                      <div style={{ color: "#b0b7d3", fontSize: 13 }}>
                        {produto.categoria} | Preco: {moeda(produto.preco)} | Atual: {produto.estoque} | Minimo:{" "}
                        {produto.estoque_minimo}
                      </div>
                    </div>

                    <div style={acoesProdutoStyle}>
                      {podeAjustarEstoque && (
                        <>
                          <div style={inputEstoqueRapidoStyle}>
                            <label style={fieldLabelStyle}>Estoque rapido</label>
                            <input
                              type="number"
                              min="0"
                              value={valorInput}
                              onChange={(e) =>
                                setEstoqueEdit((prev) => ({
                                  ...prev,
                                  [produto.id]: e.target.value
                                }))
                              }
                              style={{ ...inputStyle, width: 96 }}
                              disabled={salvandoEste}
                            />
                          </div>

                          <button
                            onClick={() => handleSalvarEstoque(produto)}
                            style={buttonStyle(salvandoEste)}
                            disabled={salvandoEste}
                            type="button"
                          >
                            {salvandoEste ? "..." : "Salvar"}
                          </button>
                        </>
                      )}

                      {podeEditarProdutos && (
                        <button
                          onClick={() => handleEditarProduto(produto)}
                          style={secondaryButtonStyle(salvandoEste)}
                          disabled={salvandoEste}
                          type="button"
                        >
                          Editar
                        </button>
                      )}

                      {podeExcluirProdutos && (
                        <button
                          onClick={() => handleExcluirProduto(produto)}
                          style={dangerButtonStyle(salvandoEste)}
                          disabled={salvandoEste}
                          type="button"
                        >
                          Excluir
                        </button>
                      )}

                      {!podeAjustarEstoque && !podeEditarProdutos && !podeExcluirProdutos && (
                        <div style={subtleLineStyle}>Somente visualizacao para este perfil.</div>
                      )}
                    </div>
                  </div>
                );
              })}

              {produtosFiltrados.length === 0 && (
                <p style={{ margin: 0, color: "#b7bfd8" }}>Nenhum produto encontrado.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmAbrirCaixaOpen}
        title="Confirmar abertura do caixa"
        message={`Saldo inicial informado: ${moeda(saldoInicialPendente)}.`}
        confirmLabel="Abrir caixa"
        cancelLabel="Voltar"
        processing={processandoCaixa}
        onCancel={() => setConfirmAbrirCaixaOpen(false)}
        onConfirm={confirmarAbrirCaixa}
      />

      <ConfirmDialog
        open={confirmFecharCaixaOpen}
        title="Fechar caixa"
        message="Deseja fechar o caixa agora e gerar o resumo de fechamento?"
        details={
          saldoContadoNumerico !== null && Number.isFinite(saldoContadoNumerico)
            ? `Saldo final estimado: ${moeda(saldoFinalEstimadoAtual)}\nSaldo contado: ${moeda(
                saldoContadoNumerico
              )}\nDiferenca: ${moeda(diferencaFechamentoPrevia || 0)}`
            : `Saldo final estimado: ${moeda(saldoFinalEstimadoAtual)}`
        }
        confirmLabel="Fechar caixa"
        cancelLabel="Cancelar"
        processing={processandoCaixa}
        variant="danger"
        onCancel={() => setConfirmFecharCaixaOpen(false)}
        onConfirm={confirmarFecharCaixa}
      />

      <ConfirmDialog
        open={confirmExcluirProdutoOpen}
        title={`Excluir produto ${produtoPendenteExclusao?.nome || ""}`}
        message="O item sera removido da lista de venda."
        details="Seguranca: confirme com PIN valido no campo acima."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        processing={salvandoEstoqueId === produtoPendenteExclusao?.id}
        variant="danger"
        onCancel={() => {
          setConfirmExcluirProdutoOpen(false);
          setProdutoPendenteExclusao(null);
        }}
        onConfirm={confirmarExcluirProduto}
      />

      <ConfirmDialog
        open={confirmEditarProdutoOpen}
        title={`Editar produto ${produtoPendenteEdicao?.nome || ""}`}
        message="Atualize os dados do produto selecionado."
        details="Seguranca: confirme com PIN valido no campo acima."
        confirmLabel={salvandoEdicaoProduto ? "Salvando..." : "Salvar alteracoes"}
        cancelLabel="Cancelar"
        processing={salvandoEdicaoProduto}
        onCancel={() => {
          if (salvandoEdicaoProduto) return;
          setConfirmEditarProdutoOpen(false);
          setProdutoPendenteEdicao(null);
          setEdicaoProduto(initialProdutoEdicao);
        }}
        onConfirm={confirmarEditarProduto}
      >
        <div style={edicaoProdutoGridStyle}>
          <div style={edicaoProdutoCampoStyle}>
            <label style={fieldLabelStyle}>Nome</label>
            <input
              value={edicaoProduto.nome}
              onChange={(e) => setEdicaoProduto((prev) => ({ ...prev, nome: e.target.value }))}
              placeholder="Nome do produto"
              style={inputStyle}
              disabled={salvandoEdicaoProduto}
            />
          </div>

          <div style={edicaoProdutoCampoStyle}>
            <label style={fieldLabelStyle}>Categoria</label>
            <input
              value={edicaoProduto.categoria}
              onChange={(e) => setEdicaoProduto((prev) => ({ ...prev, categoria: e.target.value }))}
              placeholder="Categoria"
              style={inputStyle}
              disabled={salvandoEdicaoProduto}
            />
          </div>

          <div style={edicaoProdutoCampoStyle}>
            <label style={fieldLabelStyle}>Preco (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={edicaoProduto.preco}
              onChange={(e) =>
                setEdicaoProduto((prev) => ({ ...prev, preco: limparEntradaDecimal(e.target.value) }))
              }
              placeholder="0,00"
              style={inputStyle}
              disabled={salvandoEdicaoProduto}
            />
          </div>

          <div style={edicaoProdutoCampoStyle}>
            <label style={fieldLabelStyle}>Estoque atual</label>
            <input
              type="text"
              inputMode="numeric"
              value={edicaoProduto.estoque}
              onChange={(e) =>
                setEdicaoProduto((prev) => ({ ...prev, estoque: limparEntradaInteira(e.target.value) }))
              }
              placeholder="0"
              style={inputStyle}
              disabled={salvandoEdicaoProduto}
            />
          </div>

          <div style={edicaoProdutoCampoStyle}>
            <label style={fieldLabelStyle}>Estoque minimo</label>
            <input
              type="text"
              inputMode="numeric"
              value={edicaoProduto.estoque_minimo}
              onChange={(e) =>
                setEdicaoProduto((prev) => ({
                  ...prev,
                  estoque_minimo: limparEntradaInteira(e.target.value)
                }))
              }
              placeholder="0"
              style={inputStyle}
              disabled={salvandoEdicaoProduto}
            />
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}

const filtrosTopoStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
  marginBottom: 16,
  alignItems: "end"
};

const caixaAcoesStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 4
};

const movimentoFormStyle = {
  display: "grid",
  gap: 8,
  borderRadius: 12,
  border: "1px solid #32406d",
  background: "#121a35",
  padding: 10
};

const movimentoGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: 8
};

const resumoMovimentosBoxStyle = {
  borderRadius: 12,
  border: "1px solid #32406d",
  background: "#121a35",
  padding: 10,
  display: "grid",
  gap: 4
};

const movimentosListaStyle = {
  borderRadius: 12,
  border: "1px solid #30375a",
  background: "#13172b",
  padding: 10,
  display: "grid",
  gap: 8
};

const movimentoItemStyle = {
  borderRadius: 10,
  border: "1px solid #2d3352",
  background: "#10152b",
  padding: 8,
  display: "grid",
  gap: 3
};

const erroBoxStyle = {
  border: "1px solid #9b3b4d",
  background: "#41161c",
  borderRadius: 12,
  padding: "8px 10px",
  marginBottom: 10
};

const fieldStackStyle = {
  display: "grid",
  gap: 6,
  marginTop: 4
};

const fieldLabelStyle = {
  color: "#d7def9",
  fontSize: 13
};

function diferencaPrevStyle(valor) {
  const n = Number(valor || 0);
  const positivo = n > 0.009;
  const negativo = n < -0.009;

  return {
    borderRadius: 10,
    border: `1px solid ${positivo ? "#1f8a63" : negativo ? "#9b3b4d" : "#3b4263"}`,
    background: positivo ? "#0d3a2c" : negativo ? "#41161c" : "#151b33",
    color: positivo ? "#b6f1d5" : negativo ? "#ffdce4" : "#d6ddfa",
    padding: "7px 9px",
    fontSize: 13,
    fontWeight: 700
  };
}

const resumoFechamentoGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 8,
  marginBottom: 10
};

const ultimaSessaoStyle = {
  borderRadius: 10,
  border: "1px solid #2d3352",
  background: "#13172b",
  padding: 10,
  color: "#b8c0db"
};

const gridResumoStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
  margin: "20px 0"
};

const gridSecoesStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16
};

const relatorioHeaderStyle = {
  display: "grid",
  gap: 10
};

const relatorioFiltrosStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8
};

const resumoRelatorioGridStyle = {
  marginTop: 10,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8
};

const resumoRelatorioItemStyle = {
  borderRadius: 12,
  border: "1px solid #30375a",
  background: "#13172b",
  padding: "9px 10px",
  display: "grid",
  gap: 6
};

const comparativoGridStyle = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 10
};

const comparativoCardStyle = {
  borderRadius: 12,
  border: "1px solid #33406b",
  background: "#121a35",
  padding: "10px 12px",
  display: "grid",
  gap: 6
};

const comparativoPeriodoBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  border: "1px solid #3e4a75",
  background: "#141d3a",
  color: "#b9c5ee",
  padding: "4px 8px",
  fontSize: 12,
  fontWeight: 700
};

const comparativoLinhaStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  color: "#d6defa",
  fontSize: 13
};

const comparativoVariacaoRowStyle = {
  marginTop: 4,
  display: "grid",
  gridTemplateColumns: "auto auto auto auto",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8
};

const comparativoVariacaoLabelStyle = {
  color: "#9fb0e3",
  fontSize: 12,
  fontWeight: 700
};

function comparativoVariacaoChipStyle(valor) {
  const n = Number(valor);
  const semBase = valor === null || !Number.isFinite(n);
  const positivo = n > 0.009;
  const negativo = n < -0.009;

  return {
    borderRadius: 999,
    border: `1px solid ${semBase ? "#3e4a75" : positivo ? "#1f8a63" : negativo ? "#9b3b4d" : "#3e4a75"}`,
    background: semBase ? "#141d3a" : positivo ? "#0d3a2c" : negativo ? "#41161c" : "#141d3a",
    color: semBase ? "#b9c5ee" : positivo ? "#b6f1d5" : negativo ? "#ffdce4" : "#cfd8fb",
    padding: "3px 8px",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap"
  };
}

const cardStyle = {
  background: "#161a30",
  border: "1px solid #2d3352",
  borderRadius: 18,
  padding: 16
};

const valueStyle = {
  marginTop: 8,
  fontSize: 22,
  fontWeight: 700
};

const inputStyle = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #3a4166",
  background: "#101427",
  color: "#fff"
};

const loteBoxStyle = {
  marginTop: 12,
  borderRadius: 12,
  border: "1px solid #33406b",
  background: "#121a35",
  padding: 10,
  display: "grid",
  gap: 8
};

const loteGridFormStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8,
  alignItems: "center"
};

const subtleLineStyle = {
  color: "#b8c0db",
  fontSize: 13,
  marginTop: 0,
  marginBottom: 0
};

const chipsContainerStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10
};

const estoqueChipStyle = {
  display: "grid",
  gap: 4,
  borderRadius: 12,
  border: "1px solid #7a3b49",
  background: "#2a1121",
  color: "#f5ced8",
  padding: "8px 10px"
};

const listaProdutosScrollStyle = {
  display: "grid",
  gap: 8,
  maxHeight: 400,
  overflow: "auto",
  paddingRight: 4
};

const estoqueItemStyle = {
  border: "1px solid #30375a",
  borderRadius: 12,
  padding: 10,
  background: "#13172b",
  display: "grid",
  gap: 10
};

const acoesProdutoStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap"
};

const inputEstoqueRapidoStyle = {
  display: "grid",
  gap: 6
};

const edicaoProdutoGridStyle = {
  display: "grid",
  gap: 8,
  marginTop: 8
};

const edicaoProdutoCampoStyle = {
  display: "grid",
  gap: 6
};

const barLabelStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 4
};

const barTrackStyle = {
  width: "100%",
  height: 10,
  borderRadius: 999,
  background: "#0f1326",
  border: "1px solid #283052",
  overflow: "hidden"
};

const barFillStyle = {
  height: "100%",
  borderRadius: 999
};

function buttonStyle(disabled) {
  return {
    border: "none",
    borderRadius: 10,
    padding: "10px 12px",
    fontWeight: 700,
    background: disabled ? "#5e6484" : "#2e63f4",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer"
  };
}

function pinStatusStyle(ativo) {
  return {
    marginTop: 6,
    border: `1px solid ${ativo ? "#2f5f3d" : "#7a6a36"}`,
    background: ativo ? "rgba(22, 86, 53, 0.22)" : "rgba(92, 76, 24, 0.28)",
    color: ativo ? "#b8f5cf" : "#ffe29c",
    borderRadius: 8,
    padding: "6px 8px",
    fontSize: 12
  };
}

function secondaryButtonStyle(disabled) {
  return {
    border: "1px solid #3d4770",
    borderRadius: 10,
    padding: "10px 12px",
    fontWeight: 700,
    background: disabled ? "#252a44" : "#1b213c",
    color: "#d7def9",
    cursor: disabled ? "not-allowed" : "pointer"
  };
}

function dangerButtonStyle(disabled) {
  return {
    border: "1px solid #7a3b49",
    borderRadius: 10,
    padding: "10px 12px",
    fontWeight: 700,
    background: disabled ? "#4f2630" : "#4c1d27",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer"
  };
}
