const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const AUTH_TOKEN_KEY = "pdv_auth_token_v1";

function queryString(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

function normalizarFiltroData(input) {
  if (!input) return {};

  if (typeof input === "string") {
    const data = String(input || "").trim();
    return data ? { data } : {};
  }

  if (typeof input === "object" && !Array.isArray(input)) {
    const data = String(input.data || "").trim();
    const dataInicio = String(input.data_inicio || input.inicio || "").trim();
    const dataFim = String(input.data_fim || input.fim || "").trim();
    return {
      ...(data ? { data } : {}),
      ...(dataInicio ? { data_inicio: dataInicio } : {}),
      ...(dataFim ? { data_fim: dataFim } : {})
    };
  }

  return {};
}

function formatErrorPart(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    const joined = value
      .map((item) => formatErrorPart(item))
      .filter(Boolean)
      .join(" | ");
    return joined.trim();
  }

  if (typeof value === "object") {
    const preferred = [
      value.message,
      value.error,
      value.detail,
      value.description,
      value.reason,
      value.title
    ]
      .map((item) => formatErrorPart(item))
      .filter(Boolean);
    if (preferred.length > 0) return preferred.join(" | ");

    try {
      const json = JSON.stringify(value);
      return json.length > 280 ? `${json.slice(0, 277)}...` : json;
    } catch {
      return "";
    }
  }

  return "";
}

async function request(path, options = {}, role = "GERENTE") {
  const token = localStorage.getItem(AUTH_TOKEN_KEY) || "";
  const sensitivePin = String(options.sensitivePin || "").trim();
  const customHeaders = options.headers || {};
  const finalOptions = { ...options };
  delete finalOptions.sensitivePin;
  delete finalOptions.headers;

  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "x-role": role,
      ...(token ? { "x-auth-token": token } : {}),
      ...(sensitivePin ? { "x-auth-pin": sensitivePin } : {}),
      ...customHeaders
    },
    ...finalOptions
  });

  const raw = await response.text();
  let data = null;

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { message: raw };
    }
  }

  if (!response.ok) {
    const details = formatErrorPart(data?.error || data?.message || data);
    throw new Error(details || `Erro na requisicao (${response.status}).`);
  }

  return data;
}

export const api = {
  setAuthToken(token) {
    const txt = String(token || "").trim();
    if (txt) {
      localStorage.setItem(AUTH_TOKEN_KEY, txt);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  },

  clearAuthToken() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  },

  getAuthToken() {
    return String(localStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
  },

  authUsuariosLogin: () => request("/api/auth/usuarios", {}, "GERENTE"),

  authLogin: (body) =>
    request(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      "GERENTE"
    ),

  authMe: () => request("/api/auth/me", {}, "GERENTE"),

  authLogout: () =>
    request(
      "/api/auth/logout",
      {
        method: "POST"
      },
      "GERENTE"
    ),

  getLicencaStatus: () => request("/api/licenca/status", {}, "GERENTE"),

  ativarLicenca: (body) =>
    request(
      "/api/licenca/ativar",
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      "GERENTE"
    ),

  bloquearLicenca: (body, role) =>
    request(
      "/api/licenca/bloquear",
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      role
    ),

  getMesas: (role) => request("/api/mesas", {}, role),
  getMesaPedido: (mesaId, role) => request(`/api/mesas/${mesaId}/pedido`, {}, role),
  getProdutos: (role) => request("/api/produtos", {}, role),
  getCategoriasProdutos: (role) => request("/api/produtos/categorias", {}, role),
  getHistorico: (role, filtroData = null) =>
    request(`/api/historico${queryString(normalizarFiltroData(filtroData))}`, {}, role),
  getFinanceiro: (role, filtroData = null) =>
    request(`/api/financeiro/resumo${queryString(normalizarFiltroData(filtroData))}`, {}, role),
  getFinanceiroRelatorios: (role, params = {}) =>
    request(
      `/api/financeiro/relatorios${queryString({
        dias: params?.dias,
        data_final: params?.data_final,
        data_inicio: params?.data_inicio,
        data_fim: params?.data_fim
      })}`,
      {},
      role
    ),
  getCaixa: (role) => request("/api/financeiro/caixa", {}, role),
  getEntregasMotoboys: (role, query = "") =>
    request(`/api/entregas/motoboys${queryString({ q: query })}`, {}, role),
  getEntregasPendentes: (role, query = "") =>
    request(`/api/entregas/pedidos-pendentes${queryString({ q: query })}`, {}, role),
  getEntregasResumo: (role) => request("/api/entregas/resumo", {}, role),
  getEntregasIntegracoes: (role) => request("/api/entregas/integracoes", {}, role),
  salvarEntregasIntegracao: (provider, body, role) =>
    request(
      `/api/entregas/integracoes/${provider}`,
      {
        method: "PATCH",
        body: JSON.stringify(body || {})
      },
      role
    ),
  sincronizarEntregasIntegracao: (provider, body, role) =>
    request(
      `/api/entregas/integracoes/${provider}/sincronizar`,
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      role
    ),
  getEntregasIfoodHomologacaoStatus: (role) =>
    request("/api/entregas/integracoes/ifood/homologacao/status", {}, role),
  salvarEntregasIfoodHomologacao: (body, role) =>
    request(
      "/api/entregas/integracoes/ifood/homologacao",
      {
        method: "PATCH",
        body: JSON.stringify(body || {})
      },
      role
    ),
  sincronizarEntregasIfoodHomologacao: (body, role) =>
    request(
      "/api/entregas/integracoes/ifood/homologacao/sincronizar",
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      role
    ),
  getEntregasIfoodEventos: (role, limit = 80) =>
    request(`/api/entregas/integracoes/ifood/homologacao/eventos${queryString({ limit })}`, {}, role),
  renovarEntregasIfoodToken: (body, role) =>
    request(
      "/api/entregas/integracoes/ifood/homologacao/token",
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      role
    ),
  criarEntregasMotoboy: (body, role) =>
    request(
      "/api/entregas/motoboys",
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      role
    ),
  atualizarEntregasMotoboy: (id, body, role) =>
    request(
      `/api/entregas/motoboys/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(body || {})
      },
      role
    ),
  excluirEntregasMotoboy: (id, role) =>
    request(
      `/api/entregas/motoboys/${id}`,
      {
        method: "DELETE"
      },
      role
    ),
  adicionarEntregasPedidosLote: (motoboyId, body, role) =>
    request(
      `/api/entregas/motoboys/${motoboyId}/pedidos/lote`,
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      role
    ),
  removerEntregasPedido: (pedidoId, role) =>
    request(
      `/api/entregas/pedidos/${pedidoId}`,
      {
        method: "DELETE"
      },
      role
    ),
  confirmarEntregasPedido: (pedidoId, body, role) =>
    request(
      `/api/entregas/pedidos/${pedidoId}/confirmar`,
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      role
    ),
  getEntregasPedidoCancelamentoOpcoes: (pedidoId, role) =>
    request(`/api/entregas/pedidos/${pedidoId}/cancelamento-opcoes`, {}, role),
  cancelarEntregasPedido: (pedidoId, body, role) =>
    request(
      `/api/entregas/pedidos/${pedidoId}/cancelar`,
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      role
    ),
  atribuirEntregasPedido: (pedidoId, body, role) =>
    request(
      `/api/entregas/pedidos/${pedidoId}/atribuir`,
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      role
    ),

  criarMesa: (body, role) =>
    request(
      "/api/mesas",
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      role
    ),

  excluirMesa: (mesaId, role, sensitivePinOrOptions = "") => {
    const options =
      sensitivePinOrOptions && typeof sensitivePinOrOptions === "object"
        ? sensitivePinOrOptions
        : { sensitivePin: sensitivePinOrOptions };
    return request(
      `/api/mesas/${mesaId}${options?.forcar ? "?forcar=1" : ""}`,
      {
        method: "DELETE",
        sensitivePin: String(options?.sensitivePin || "").trim()
      },
      role
    );
  },

  abrirMesa: (mesaId, body, role) =>
    request(
      `/api/mesas/${mesaId}/abrir`,
      {
        method: "POST",
        body: JSON.stringify(body)
      },
      role
    ),

  addItem: (mesaId, body, role) =>
    request(
      `/api/mesas/${mesaId}/itens`,
      {
        method: "POST",
        body: JSON.stringify(body)
      },
      role
    ),

  atualizarQuantidadeItem: (mesaId, itemId, body, role) =>
    request(
      `/api/mesas/${mesaId}/itens/${itemId}`,
      {
        method: "PATCH",
        body: JSON.stringify(body)
      },
      role
    ),

  removerItem: (mesaId, itemId, role) =>
    request(
      `/api/mesas/${mesaId}/itens/${itemId}`,
      {
        method: "DELETE"
      },
      role
    ),

  fecharMesa: (mesaId, body, role) =>
    request(
      `/api/mesas/${mesaId}/fechar`,
      {
        method: "POST",
        body: JSON.stringify(body)
      },
      role
    ),

  retomarFechamentoMesa: (mesaId, role) =>
    request(
      `/api/mesas/${mesaId}/retomar-fechamento`,
      {
        method: "POST"
      },
      role
    ),

  pagarMesa: (mesaId, body, role) =>
    request(
      `/api/mesas/${mesaId}/pagar`,
      {
        method: "POST",
        body: JSON.stringify(body)
      },
      role
    ),

  reabrirMesa: (mesaId, role) =>
    request(
      `/api/mesas/${mesaId}/reabrir`,
      {
        method: "POST"
      },
      role
    ),

  excluirHistorico: (pedidoId, role, sensitivePin = "") =>
    request(
      `/api/historico/${pedidoId}`,
      {
        method: "DELETE",
        sensitivePin
      },
      role
    ),

  criarProduto: (body, role) =>
    request(
      "/api/produtos",
      {
        method: "POST",
        body: JSON.stringify(body)
      },
      role
    ),

  atualizarProduto: (produtoId, body, role) =>
    request(
      `/api/produtos/${produtoId}`,
      {
        method: "PATCH",
        body: JSON.stringify(body || {})
      },
      role
    ),

  atualizarEstoqueProduto: (produtoId, body, role) =>
    request(
      `/api/produtos/${produtoId}/estoque`,
      {
        method: "PATCH",
        body: JSON.stringify(body)
      },
      role
    ),

  importarProdutosLote: (body, role, sensitivePin = "") =>
    request(
      "/api/produtos/lote/importar",
      {
        method: "POST",
        body: JSON.stringify(body || {}),
        sensitivePin
      },
      role
    ),

  atualizarEstoqueProdutoLote: (body, role, sensitivePin = "") =>
    request(
      "/api/produtos/lote/estoque",
      {
        method: "POST",
        body: JSON.stringify(body || {}),
        sensitivePin
      },
      role
    ),

  removerProduto: (produtoId, role, sensitivePin = "") =>
    request(
      `/api/produtos/${produtoId}`,
      {
        method: "DELETE",
        sensitivePin
      },
      role
    ),

  abrirCaixa: (body, role) =>
    request(
      "/api/financeiro/caixa/abrir",
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      role
    ),

  fecharCaixa: (body, role) =>
    request(
      "/api/financeiro/caixa/fechar",
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      role
    ),

  movimentarCaixa: (body, role) =>
    request(
      "/api/financeiro/caixa/movimentos",
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      role
    ),

  getImpressoras: (role) => request("/api/impressao/impressoras", {}, role),

  imprimirTexto: (body, role) =>
    request(
      "/api/impressao/imprimir",
      {
        method: "POST",
        body: JSON.stringify(body || {})
      },
      role
    ),

  getUsuarios: (role) => request("/api/usuarios", {}, role),

  criarUsuario: (body, role, sensitivePin = "") =>
    request(
      "/api/usuarios",
      {
        method: "POST",
        body: JSON.stringify(body || {}),
        sensitivePin
      },
      role
    ),

  atualizarUsuario: (id, body, role, sensitivePin = "") =>
    request(
      `/api/usuarios/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(body || {}),
        sensitivePin
      },
      role
    ),

  exportarBackup: (role) => request("/api/sistema/backup", {}, role),

  gerarBackupArquivo: (role) =>
    request(
      "/api/sistema/backup/arquivo",
      {
        method: "POST"
      },
      role
    ),

  getBackups: (role, limit = 20) =>
    request(`/api/sistema/backups${queryString({ limit })}`, {}, role),

  getSistemaConfig: (role) => request("/api/sistema/config", {}, role),

  atualizarSistemaConfig: (body, role) =>
    request(
      "/api/sistema/config",
      {
        method: "PATCH",
        body: JSON.stringify(body || {})
      },
      role
    ),

  executarBackupAuto: (role, force = false) =>
    request(
      "/api/sistema/backup/auto",
      {
        method: "POST",
        body: JSON.stringify({ force: Boolean(force) })
      },
      role
    ),

  restaurarBackup: (backup, role, sensitivePin = "") =>
    request(
      "/api/sistema/restore",
      {
        method: "POST",
        body: JSON.stringify({ backup }),
        sensitivePin
      },
      role
    ),

  restaurarBackupArquivo: (arquivo, role, sensitivePin = "") =>
    request(
      "/api/sistema/restore/arquivo",
      {
        method: "POST",
        body: JSON.stringify({ arquivo }),
        sensitivePin
      },
      role
    ),

  limparDadosSistema: (body, role, sensitivePin = "") =>
    request(
      "/api/sistema/limpar-dados",
      {
        method: "POST",
        body: JSON.stringify(body || {}),
        sensitivePin
      },
      role
    ),

  getAuditoria: (role, limit = 200) =>
    request(`/api/sistema/auditoria${queryString({ limit })}`, {}, role),

  exportarAuditoria: (role, formato = "csv", limit = 1500) =>
    request(
      `/api/sistema/auditoria/exportar${queryString({ formato, limit })}`,
      {},
      role
    )
};
