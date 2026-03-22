const CATALOGO_PERMISSOES = [
  { chave: "APP_MESAS_VER", label: "Ver mesas e contas" },
  { chave: "APP_MESAS_CRIAR", label: "Criar mesas" },
  { chave: "APP_MESAS_ABRIR_FECHAR", label: "Abrir, fechar, pagar e reabrir mesas" },
  { chave: "APP_MESAS_ITENS", label: "Adicionar/remover itens da conta" },
  { chave: "APP_MESAS_EXCLUIR", label: "Excluir mesas" },
  { chave: "APP_PRODUTOS_VER", label: "Ver produtos e categorias" },
  { chave: "APP_PRODUTOS_CADASTRAR", label: "Cadastrar produtos" },
  { chave: "APP_PRODUTOS_EDITAR", label: "Editar produtos" },
  { chave: "APP_PRODUTOS_ESTOQUE", label: "Ajustar estoque" },
  { chave: "APP_PRODUTOS_IMPORTAR", label: "Importar produtos em lote" },
  { chave: "APP_PRODUTOS_EXCLUIR", label: "Excluir produtos" },
  { chave: "APP_FINANCEIRO_VER", label: "Ver resumo financeiro" },
  { chave: "APP_FINANCEIRO_RELATORIOS", label: "Ver relatorios financeiros" },
  { chave: "APP_CAIXA_GERIR", label: "Abrir/fechar/movimentar caixa" },
  { chave: "APP_HISTORICO_VER", label: "Ver historico" },
  { chave: "APP_HISTORICO_EXCLUIR", label: "Excluir itens do historico" },
  { chave: "APP_IMPRESSAO", label: "Imprimir e listar impressoras" },
  { chave: "APP_CONFIG_VER", label: "Ver/editar configuracoes gerais" },
  { chave: "APP_USUARIOS_GERIR", label: "Criar/editar usuarios e PIN" },
  { chave: "APP_BACKUP_GERIR", label: "Backup e restauracao" },
  { chave: "APP_AUDITORIA_VER", label: "Ver/exportar auditoria" },
  { chave: "APP_LICENCA_BLOQUEAR", label: "Bloquear licenca" }
];

const CHAVES_PERMISSAO = new Set(CATALOGO_PERMISSOES.map((item) => item.chave));

function mapaPermissoesVazio() {
  const out = {};
  for (const item of CATALOGO_PERMISSOES) {
    out[item.chave] = false;
  }
  return out;
}

function mapaPermissoesGerente() {
  const out = {};
  for (const item of CATALOGO_PERMISSOES) {
    out[item.chave] = true;
  }
  return out;
}

function mapaPermissoesGarcom() {
  return {
    ...mapaPermissoesVazio(),
    APP_MESAS_VER: true,
    APP_MESAS_CRIAR: true,
    APP_MESAS_ABRIR_FECHAR: true,
    APP_MESAS_ITENS: true,
    APP_PRODUTOS_VER: true,
    APP_IMPRESSAO: true
  };
}

function mapaPermissoesPadraoPorRole(role) {
  const roleNorm = String(role || "").toUpperCase();
  if (roleNorm === "GERENTE") return mapaPermissoesGerente();
  return mapaPermissoesGarcom();
}

function parsePermissoesJson(raw) {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

function normalizarMapaPermissoes(input = {}) {
  const map = {};
  const origem = input && typeof input === "object" ? input : {};
  for (const key of Object.keys(origem)) {
    if (!CHAVES_PERMISSAO.has(key)) continue;
    map[key] = Boolean(origem[key]);
  }
  return map;
}

function resolverPermissoesUsuario(usuario = {}) {
  const role = String(usuario.role || "GARCOM").toUpperCase();
  const perfilPersonalizado = Number(usuario.perfil_personalizado || 0) === 1;
  const perfilNome = String(usuario.perfil_nome || "").trim();

  const base = mapaPermissoesPadraoPorRole(role);
  if (!perfilPersonalizado) {
    return {
      perfil_personalizado: false,
      perfil_nome: "",
      permissoes: base
    };
  }

  const rawCustom = parsePermissoesJson(usuario.permissoes_json);
  const custom = normalizarMapaPermissoes(rawCustom);

  return {
    perfil_personalizado: true,
    perfil_nome: perfilNome,
    permissoes: {
      ...base,
      ...custom
    }
  };
}

function temPermissao(permissoes, chave) {
  if (!chave) return true;
  if (!CHAVES_PERMISSAO.has(chave)) return false;
  if (!permissoes || typeof permissoes !== "object") return false;
  return Boolean(permissoes[chave]);
}

module.exports = {
  CATALOGO_PERMISSOES,
  CHAVES_PERMISSAO,
  mapaPermissoesPadraoPorRole,
  normalizarMapaPermissoes,
  resolverPermissoesUsuario,
  temPermissao
};
