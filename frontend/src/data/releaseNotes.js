const RELEASE_NOTES_BY_VERSION = {
  "1.0.16": [
    "Nova aba dedicada de Relatorios na topbar, separada da tela Financeiro.",
    "Relatorio gerencial completo com filtro por periodo personalizado (data inicial e final).",
    "KPIs ampliados com faturamento, subtotal, taxa, couvert, ticket medio, vendas, itens e pessoas.",
    "Novos blocos com pagamentos detalhados, vendas por hora, desempenho por garcom e movimentos de caixa.",
    "Exportacao direta dos relatorios em CSV e JSON pela nova tela."
  ],
  "1.0.15": [
    "Correcao critica no restore de backup para preservar a licenca ativa do dispositivo.",
    "Limpeza e restauracao de dados nao removem mais o registro de licenca local.",
    "Estabilidade melhorada no fluxo de backup para evitar perda de ativacao."
  ],
  "1.0.14": [
    "Novo comparativo gerencial com visao de dia, semana e mes no financeiro.",
    "Cada periodo agora mostra faturamento, ticket medio e vendas com variacao frente ao periodo anterior.",
    "Melhoria no backend para gerar comparativos de forma consistente independente do filtro de dias."
  ],
  "1.0.13": [
    "Changelog de atualizacao agora exibe historico completo de versoes registradas, nao apenas a versao atual.",
    "Timeline de release notes com ordenacao por versao para leitura mais clara das mudancas.",
    "Melhoria de confiabilidade na exibicao do conteudo de novidades apos update."
  ],
  "1.0.12": [
    "Correcao do fluxo de exibicao do changelog para garantir abertura no primeiro update apos migracao de versao.",
    "Ajuste na deteccao de versao anterior usando fallback de compatibilidade com chaves antigas.",
    "Melhorias de confiabilidade no aviso de novidades pos-atualizacao."
  ],
  "1.0.11": [
    "Janela de Adicionar produtos com tamanho fixo e comportamento visual mais estavel.",
    "Lista de produtos no modal ajustada para nao esticar cards e botoes quando houver poucos itens.",
    "Changelog pos-atualizacao reforcado para aparecer automaticamente ao detectar nova versao instalada."
  ],
  "1.0.9": [
    "Publicacao de estabilidade do desktop com melhorias no fluxo geral de atualizacao.",
    "Ajustes operacionais para distribuicao e instalacao do app em producao."
  ],
  "1.0.8": [
    "Changelog da versao agora abre automaticamente na tela quando o app atualiza.",
    "Fluxo de auto update e publicacao no GitHub ajustado para operacao continua.",
    "Melhorias gerais de estabilidade no desktop."
  ],
  "1.0.7": [
    "Melhorias gerais de estabilidade no fluxo de mesas, fechamento e impressao.",
    "Ajustes de layout para uso touch e escalas diferentes de tela.",
    "Melhorias no controle de licenca e em mensagens operacionais.",
    "Aprimoramentos na configuracao e no visual geral do sistema."
  ]
};

function normalizarVersao(input) {
  return String(input || "").trim().replace(/^v/i, "");
}

function compararVersao(a, b) {
  const pa = normalizarVersao(a)
    .split(".")
    .map((n) => Number(n) || 0);
  const pb = normalizarVersao(b)
    .split(".")
    .map((n) => Number(n) || 0);
  const tamanho = Math.max(pa.length, pb.length);

  for (let i = 0; i < tamanho; i += 1) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function versoesOrdenadasDesc() {
  return Object.keys(RELEASE_NOTES_BY_VERSION).sort((a, b) => compararVersao(b, a));
}

export function getReleaseNotesForVersion(version) {
  const versao = normalizarVersao(version);
  const lista = RELEASE_NOTES_BY_VERSION[versao];
  if (!Array.isArray(lista) || lista.length < 1) return "";
  return lista.map((item) => `- ${item}`).join("\n");
}

export function getReleaseNotesTimeline(untilVersion = "") {
  const limite = normalizarVersao(untilVersion);
  const versoes = versoesOrdenadasDesc().filter((versao) => {
    if (!limite) return true;
    return compararVersao(versao, limite) <= 0;
  });
  if (versoes.length < 1) return "";

  return versoes
    .map((versao) => {
      const itens = RELEASE_NOTES_BY_VERSION[versao] || [];
      if (!Array.isArray(itens) || itens.length < 1) return "";
      const linhas = [`v${versao}`, ...itens.map((item) => `- ${item}`)];
      return linhas.join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

export function getReleaseName(version) {
  const versao = normalizarVersao(version);
  return versao ? `v${versao}` : "";
}
