import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../services/api";

const AppContext = createContext(null);
const CONFIG_STORAGE_KEY = "pdv_config_v1";
const PRINT_STORAGE_KEY = "pdv_print_config_v1";
const AUTH_USER_STORAGE_KEY = "pdv_auth_user_v1";
const SUPORTE_FIXO = {
  nome: "GastroCode Brasil",
  telefone: "31995172257",
  email: "guilherme.honoratos08@gmail.com",
  site: ""
};

const DEFAULT_CONFIGURACOES = {
  estabelecimento_nome: "",
  estabelecimento_documento: "",
  estabelecimento_telefone: "",
  estabelecimento_endereco: "",
  estabelecimento_cidade_uf: "",
  exigir_nome_cliente: false,
  solicitar_nome_garcom_fechamento: false,
  exigir_pin_fechamento_conta: true,
  teclado_touch_automatico: true,
  pessoas_padrao_conta: 1,
  cobrar_taxa_servico_padrao: true,
  taxa_servico_padrao_percent: 10,
  cobrar_couvert_artistico_padrao: false,
  couvert_artistico_valor: 0,
  auto_refresh_segundos: 15
};

const DEFAULT_CONFIG_IMPRESSAO = {
  largura_papel_mm: 80,
  metodo_impressao: "NAVEGADOR",
  impressora_nome: "",
  mostrar_logo: false,
  logo_data_url: "",
  logo_largura_mm: 34,
  logo_alto_contraste: true,
  exibir_cabecalho: true,
  mostrar_cliente: true,
  mostrar_data_hora: true,
  mostrar_forma_pagamento: true,
  auto_imprimir_pagamento: true,
  auto_imprimir_fechamento_caixa: false,
  mensagem_rodape: "Obrigado pela preferencia."
};

const DEFAULT_SISTEMA_CONFIG = {
  onboarding_concluido: false,
  backup_mirror_dir: "",
  backup_retain_days: 30,
  suporte_telefone: SUPORTE_FIXO.telefone,
  suporte_email: SUPORTE_FIXO.email,
  suporte_nome: SUPORTE_FIXO.nome,
  suporte_site: SUPORTE_FIXO.site
};

const DEFAULT_LICENCA_INFO = {
  loading: true,
  ativa: false,
  status: "CARREGANDO",
  mensagem: "Verificando licenca...",
  licenca: null,
  codigo_dispositivo: "",
  dispositivo_nome: "",
  chave_publica_fingerprint: ""
};

function hojeLocalIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function getErrorMessage(error) {
  if (!error) return "Erro inesperado.";
  if (typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return "Erro inesperado.";
}

function lerJsonStorage(chave) {
  try {
    const raw = localStorage.getItem(chave);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function normalizarUsuarioAuth(valor) {
  if (!valor || typeof valor !== "object") return null;
  const id = Number(valor.id);
  const role = String(valor.role || "").toUpperCase();
  if (!Number.isFinite(id) || !["GARCOM", "GERENTE"].includes(role)) return null;
  const permissoes = {};
  const permissoesRaw = valor.permissoes && typeof valor.permissoes === "object" ? valor.permissoes : {};
  for (const [chave, habilitado] of Object.entries(permissoesRaw)) {
    permissoes[chave] = Boolean(habilitado);
  }
  return {
    id,
    nome: String(valor.nome || "").trim() || "Usuario",
    apelido: String(valor.apelido || "").trim(),
    role,
    perfil_personalizado: Boolean(valor.perfil_personalizado),
    perfil_nome: String(valor.perfil_nome || "").trim(),
    permissoes
  };
}

function normalizarRolePermitido(roleInput, fallback = "GERENTE") {
  const role = String(roleInput || "").toUpperCase();
  return ["GARCOM", "GERENTE"].includes(role) ? role : fallback;
}

function normalizarPeriodoDatas(input, fallbackInicio = "", fallbackFim = "") {
  const raw = input && typeof input === "object" ? input : {};
  const inicio = String(raw.data_inicio ?? raw.inicio ?? fallbackInicio ?? "").trim();
  const fim = String(raw.data_fim ?? raw.fim ?? fallbackFim ?? "").trim();
  const dataRegex = /^\d{4}-\d{2}-\d{2}$/;
  const inicioValido = dataRegex.test(inicio) ? inicio : "";
  const fimValido = dataRegex.test(fim) ? fim : "";

  if (inicioValido && fimValido && inicioValido <= fimValido) {
    return { data_inicio: inicioValido, data_fim: fimValido };
  }

  if (inicioValido && !fimValido) {
    return { data_inicio: inicioValido, data_fim: inicioValido };
  }

  if (!inicioValido && fimValido) {
    return { data_inicio: fimValido, data_fim: fimValido };
  }

  if (inicioValido && fimValido && inicioValido > fimValido) {
    return { data_inicio: fimValido, data_fim: inicioValido };
  }

  return { data_inicio: "", data_fim: "" };
}

function normalizarConfiguracoes(valor) {
  const base = { ...DEFAULT_CONFIGURACOES, ...(valor || {}) };
  return {
    estabelecimento_nome: String(base.estabelecimento_nome || "").slice(0, 90),
    estabelecimento_documento: String(base.estabelecimento_documento || "").slice(0, 40),
    estabelecimento_telefone: String(base.estabelecimento_telefone || "").slice(0, 32),
    estabelecimento_endereco: String(base.estabelecimento_endereco || "").slice(0, 160),
    estabelecimento_cidade_uf: String(base.estabelecimento_cidade_uf || "").slice(0, 90),
    exigir_nome_cliente: Boolean(base.exigir_nome_cliente),
    solicitar_nome_garcom_fechamento: Boolean(base.solicitar_nome_garcom_fechamento),
    exigir_pin_fechamento_conta: base.exigir_pin_fechamento_conta !== false,
    teclado_touch_automatico: base.teclado_touch_automatico !== false,
    pessoas_padrao_conta: Math.max(1, Math.min(20, Number(base.pessoas_padrao_conta || 1) || 1)),
    cobrar_taxa_servico_padrao: base.cobrar_taxa_servico_padrao !== false,
    taxa_servico_padrao_percent: Math.max(
      0,
      Math.min(30, Number(base.taxa_servico_padrao_percent ?? 10) || 0)
    ),
    cobrar_couvert_artistico_padrao: Boolean(base.cobrar_couvert_artistico_padrao),
    couvert_artistico_valor: Math.max(
      0,
      Math.min(200, Number(base.couvert_artistico_valor ?? 0) || 0)
    ),
    auto_refresh_segundos: Math.max(5, Math.min(120, Number(base.auto_refresh_segundos || 15) || 15))
  };
}

function normalizarConfigImpressao(valor) {
  const base = { ...DEFAULT_CONFIG_IMPRESSAO, ...(valor || {}) };
  const largura = Number(base.largura_papel_mm);
  const rodape = String(base.mensagem_rodape || "").trim().slice(0, 220);
  const logoDataUrlRaw = String(base.logo_data_url || "");
  const logoDataUrl =
    logoDataUrlRaw.startsWith("data:image/") && logoDataUrlRaw.length <= 900000 ? logoDataUrlRaw : "";

  return {
    largura_papel_mm: largura === 58 ? 58 : 80,
    metodo_impressao: String(base.metodo_impressao || "").toUpperCase() === "DIRETA" ? "DIRETA" : "NAVEGADOR",
    impressora_nome: String(base.impressora_nome || "").trim().slice(0, 140),
    mostrar_logo: Boolean(base.mostrar_logo) && Boolean(logoDataUrl),
    logo_data_url: logoDataUrl,
    logo_largura_mm: Math.max(18, Math.min(58, Number(base.logo_largura_mm || 34) || 34)),
    logo_alto_contraste: base.logo_alto_contraste !== false,
    exibir_cabecalho: base.exibir_cabecalho !== false,
    mostrar_cliente: base.mostrar_cliente !== false,
    mostrar_data_hora: base.mostrar_data_hora !== false,
    mostrar_forma_pagamento: base.mostrar_forma_pagamento !== false,
    auto_imprimir_pagamento: base.auto_imprimir_pagamento !== false,
    auto_imprimir_fechamento_caixa: Boolean(base.auto_imprimir_fechamento_caixa),
    mensagem_rodape: rodape || DEFAULT_CONFIG_IMPRESSAO.mensagem_rodape
  };
}

function normalizarSistemaConfig(valor) {
  const base = { ...DEFAULT_SISTEMA_CONFIG, ...(valor || {}) };
  return {
    onboarding_concluido: Boolean(base.onboarding_concluido),
    backup_mirror_dir: String(base.backup_mirror_dir || "").trim().slice(0, 360),
    backup_retain_days: Math.max(7, Math.min(365, Number(base.backup_retain_days || 30) || 30)),
    suporte_telefone: String(base.suporte_telefone || SUPORTE_FIXO.telefone).trim().slice(0, 60),
    suporte_email: String(base.suporte_email || SUPORTE_FIXO.email).trim().slice(0, 120),
    suporte_nome: String(base.suporte_nome || SUPORTE_FIXO.nome).trim().slice(0, 90),
    suporte_site: String(base.suporte_site || SUPORTE_FIXO.site).trim().slice(0, 160)
  };
}

function normalizarLicencaInfo(valor) {
  if (!valor || typeof valor !== "object") {
    return {
      ...DEFAULT_LICENCA_INFO,
      loading: false,
      status: "ERRO",
      mensagem: "Resposta invalida do servico de licenca."
    };
  }

  const licenca = valor.licenca && typeof valor.licenca === "object" ? valor.licenca : null;

  return {
    loading: false,
    ativa: Boolean(valor.ativa),
    status: String(valor.status || (valor.ativa ? "ATIVA" : "NAO_ATIVADA")).toUpperCase(),
    mensagem: String(valor.mensagem || "").trim() || "Status de licenca indisponivel.",
    licenca: licenca
      ? {
          plano: String(licenca.plano || "").trim(),
          chave_mascara: String(licenca.chave_mascara || "").trim(),
          dispositivo_id: String(licenca.dispositivo_id || "").trim(),
          dispositivo_nome: String(licenca.dispositivo_nome || "").trim(),
          ativada_em: licenca.ativada_em || null,
          expira_em: licenca.expira_em || null,
          dias_restantes: Number.isFinite(Number(licenca.dias_restantes))
            ? Number(licenca.dias_restantes)
            : null
        }
      : null,
    codigo_dispositivo: String(valor.codigo_dispositivo || "").trim(),
    dispositivo_nome: String(valor.dispositivo_nome || "").trim(),
    chave_publica_fingerprint: String(valor.chave_publica_fingerprint || "").trim()
  };
}

export function AppProvider({ children }) {
  const [authUser, setAuthUser] = useState(() =>
    normalizarUsuarioAuth(lerJsonStorage(AUTH_USER_STORAGE_KEY))
  );
  const [authReady, setAuthReady] = useState(false);
  const [role, setRoleState] = useState(() =>
    normalizarRolePermitido(
      normalizarUsuarioAuth(lerJsonStorage(AUTH_USER_STORAGE_KEY))?.role || localStorage.getItem("role"),
      "GERENTE"
    )
  );
  const [mesas, setMesas] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [financeiro, setFinanceiro] = useState(null);
  const [caixa, setCaixa] = useState({
    aberto: false,
    sessao: null,
    ultima_sessao: null,
    movimentos: [],
    resumo_saldo: null
  });
  const [usuarios, setUsuarios] = useState([]);
  const [catalogoPermissoes, setCatalogoPermissoes] = useState([]);
  const [auditoria, setAuditoria] = useState([]);
  const [backupsSistema, setBackupsSistema] = useState({
    diretorio: "",
    backups: [],
    espelho_dir: "",
    retencao_dias: 30
  });
  const [sistemaConfig, setSistemaConfig] = useState(DEFAULT_SISTEMA_CONFIG);
  const [filtroFinanceiroData, setFiltroFinanceiroData] = useState(() => hojeLocalIso());
  const [filtroFinanceiroPeriodo, setFiltroFinanceiroPeriodo] = useState(() => ({
    data_inicio: hojeLocalIso(),
    data_fim: hojeLocalIso()
  }));
  const [filtroHistoricoData, setFiltroHistoricoData] = useState("");
  const [filtroHistoricoPeriodo, setFiltroHistoricoPeriodo] = useState(() => ({
    data_inicio: "",
    data_fim: ""
  }));
  const [mesaSelecionada, setMesaSelecionada] = useState(null);
  const [pedidoAtivo, setPedidoAtivo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [apiOnline, setApiOnline] = useState(true);
  const [configuracoes, setConfiguracoes] = useState(() =>
    normalizarConfiguracoes(lerJsonStorage(CONFIG_STORAGE_KEY))
  );
  const [configImpressao, setConfigImpressao] = useState(() =>
    normalizarConfigImpressao(lerJsonStorage(PRINT_STORAGE_KEY))
  );
  const [licencaInfo, setLicencaInfo] = useState(DEFAULT_LICENCA_INFO);
  const [licencaProcessando, setLicencaProcessando] = useState(false);

  const mountedRef = useRef(true);
  const avisoLicencaInativaRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  function pushNotice(type, text) {
    setNotice({ id: Date.now(), type, text });
  }

  function clearNotice() {
    setNotice(null);
  }

  useEffect(() => {
    if (!notice) return undefined;

    const timeoutId = setTimeout(() => {
      setNotice(null);
    }, 3500);

    return () => clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configuracoes));
  }, [configuracoes]);

  useEffect(() => {
    localStorage.setItem(PRINT_STORAGE_KEY, JSON.stringify(configImpressao));
  }, [configImpressao]);

  useEffect(() => {
    if (authUser) {
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(authUser));
      localStorage.setItem("role", authUser.role);
      setRoleState(authUser.role);
    } else {
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    }
  }, [authUser]);

  useEffect(() => {
    let ativo = true;

    async function bootstrapSessaoELicenca() {
      try {
        let licencaNormalizada = null;
        try {
          const licencaData = await api.getLicencaStatus();
          if (!ativo) return;
          licencaNormalizada = normalizarLicencaInfo(licencaData);
          setLicencaInfo(licencaNormalizada);
          setApiOnline(true);
        } catch (errorLicenca) {
          if (!ativo) return;
          setLicencaInfo({
            ...DEFAULT_LICENCA_INFO,
            loading: false,
            status: "ERRO",
            mensagem: getErrorMessage(errorLicenca)
          });
          setApiOnline(false);
          api.clearAuthToken();
          setAuthUser(null);
          return;
        }

        if (!licencaNormalizada?.ativa) {
          api.clearAuthToken();
          setAuthUser(null);
          return;
        }

        const token = api.getAuthToken();
        if (!token) {
          if (!ativo) return;
          setAuthUser(null);
          return;
        }

        try {
          const me = await api.authMe();
          if (!ativo) return;

          const usuario = normalizarUsuarioAuth(me?.usuario);
          if (!usuario) {
            api.clearAuthToken();
            setAuthUser(null);
          } else {
            setAuthUser(usuario);
            setRoleState(usuario.role);
          }
        } catch {
          if (!ativo) return;
          api.clearAuthToken();
          setAuthUser(null);
        }
      } finally {
        if (ativo) {
          setAuthReady(true);
        }
      }
    }

    bootstrapSessaoELicenca();

    return () => {
      ativo = false;
    };
  }, []);

  async function recarregarTudo(mesaIdPreferencial = null, options = {}) {
    const silent = Boolean(options.silent);
    const forceAuth = Boolean(options.forceAuth);
    const roleAtual = String(options.roleOverride || role || "GERENTE").toUpperCase();
    const caixaVazio = { aberto: false, sessao: null, ultima_sessao: null, movimentos: [], resumo_saldo: null };
    const permissaoMapaAtual =
      authUser?.permissoes && typeof authUser.permissoes === "object" ? authUser.permissoes : null;
    const temPermissaoAtual = (chave) => {
      const key = String(chave || "").trim();
      if (!key) return true;
      if (permissaoMapaAtual && key in permissaoMapaAtual) {
        return Boolean(permissaoMapaAtual[key]);
      }
      return roleAtual === "GERENTE";
    };

    if (!authReady && !forceAuth) return;
    if (!licencaInfo.ativa && !forceAuth) return;
    if (!authUser && !forceAuth) {
      setMesas([]);
      setProdutos([]);
      setHistorico([]);
      setFinanceiro(null);
      setCaixa(caixaVazio);
      setMesaSelecionada(null);
      setPedidoAtivo(null);
      setUsuarios([]);
      setCatalogoPermissoes([]);
      setAuditoria([]);
      setBackupsSistema({ diretorio: "", backups: [], espelho_dir: "", retencao_dias: 30 });
      setSistemaConfig(DEFAULT_SISTEMA_CONFIG);
      return;
    }

    if (!silent) {
      setLoading(true);
    }

    try {
      const podeVerMesas = temPermissaoAtual("APP_MESAS_VER");
      const podeVerProdutos = temPermissaoAtual("APP_PRODUTOS_VER");
      const [mesasData, produtosData] = await Promise.all([
        podeVerMesas ? api.getMesas(roleAtual) : Promise.resolve([]),
        podeVerProdutos ? api.getProdutos(roleAtual) : Promise.resolve([])
      ]);

      if (!mountedRef.current) return;

      setApiOnline(true);
      setMesas(mesasData);
      setProdutos(produtosData);

      const podeVerHistorico = temPermissaoAtual("APP_HISTORICO_VER");
      const podeVerFinanceiro = temPermissaoAtual("APP_FINANCEIRO_VER");
      const podeGerirCaixa = temPermissaoAtual("APP_CAIXA_GERIR");
      const podeGerirUsuarios = temPermissaoAtual("APP_USUARIOS_GERIR");
      const podeVerAuditoria = temPermissaoAtual("APP_AUDITORIA_VER");
      const podeGerirBackups = temPermissaoAtual("APP_BACKUP_GERIR");
      const podeVerConfig = temPermissaoAtual("APP_CONFIG_VER");

      const [historicoData, financeiroData, caixaData] = await Promise.all([
        podeVerHistorico ? api.getHistorico(roleAtual, filtroHistoricoPeriodo) : Promise.resolve([]),
        podeVerFinanceiro ? api.getFinanceiro(roleAtual, filtroFinanceiroPeriodo) : Promise.resolve(null),
        podeGerirCaixa ? api.getCaixa(roleAtual) : Promise.resolve(caixaVazio)
      ]);

      if (!mountedRef.current) return;

      setHistorico(Array.isArray(historicoData) ? historicoData : []);
      setFinanceiro(financeiroData || null);
      setCaixa(caixaData || caixaVazio);

      const [usuariosData, auditoriaData, backupsData, configSistemaData] = await Promise.all([
        podeGerirUsuarios
          ? api.getUsuarios(roleAtual).catch(() => ({ usuarios: [], catalogo_permissoes: [] }))
          : Promise.resolve({ usuarios: [], catalogo_permissoes: [] }),
        podeVerAuditoria
          ? api.getAuditoria(roleAtual, 200).catch(() => ({ logs: [] }))
          : Promise.resolve({ logs: [] }),
        podeGerirBackups
          ? api.getBackups(roleAtual, 20).catch(() => ({
              diretorio: "",
              backups: [],
              espelho_dir: "",
              retencao_dias: 30
            }))
          : Promise.resolve({ diretorio: "", backups: [], espelho_dir: "", retencao_dias: 30 }),
        podeVerConfig
          ? api.getSistemaConfig(roleAtual).catch(() => ({ config: DEFAULT_SISTEMA_CONFIG }))
          : Promise.resolve({ config: DEFAULT_SISTEMA_CONFIG })
      ]);
      if (!mountedRef.current) return;
      setUsuarios(Array.isArray(usuariosData?.usuarios) ? usuariosData.usuarios : []);
      setCatalogoPermissoes(
        Array.isArray(usuariosData?.catalogo_permissoes) ? usuariosData.catalogo_permissoes : []
      );
      setAuditoria(Array.isArray(auditoriaData?.logs) ? auditoriaData.logs : []);
      setBackupsSistema({
        diretorio: String(backupsData?.diretorio || ""),
        backups: Array.isArray(backupsData?.backups) ? backupsData.backups : [],
        espelho_dir: String(backupsData?.espelho_dir || ""),
        retencao_dias: Math.max(7, Math.min(365, Number(backupsData?.retencao_dias || 30) || 30))
      });
      setSistemaConfig(normalizarSistemaConfig(configSistemaData?.config || {}));

      const alvoId = mesaIdPreferencial ?? mesaSelecionada?.id ?? null;
      if (!alvoId) {
        setMesaSelecionada(null);
        setPedidoAtivo(null);
        return;
      }

      const mesaAtual = mesasData.find((item) => item.id === alvoId) || null;
      setMesaSelecionada(mesaAtual);

      if (mesaAtual && mesaAtual.status !== "LIVRE") {
        const detalhe = await api.getMesaPedido(mesaAtual.id, roleAtual);
        if (!mountedRef.current) return;
        setPedidoAtivo(detalhe);
      } else {
        setPedidoAtivo(null);
      }
    } catch (error) {
      if (!mountedRef.current) return;

      setApiOnline(false);

      if (!silent) {
        pushNotice("error", getErrorMessage(error));
      }

      const msg = String(error?.message || "").toLowerCase();
      if (msg.includes("sessao") || msg.includes("login obrigatorio")) {
        api.clearAuthToken();
        setAuthUser(null);
      }

      throw error;
    } finally {
      if (!silent && mountedRef.current) {
        setLoading(false);
      }
    }
  }

  async function verificarLicencaStatus(options = {}) {
    const silent = Boolean(options.silent);
    const notifyOnInactive = Boolean(options.notifyOnInactive);
    if (!silent) {
      setLicencaProcessando(true);
    }

    try {
      const data = await api.getLicencaStatus();
      const normalizada = normalizarLicencaInfo(data);
      if (!mountedRef.current) return normalizada;
      setLicencaInfo(normalizada);
      setApiOnline(true);
      if (normalizada.ativa) {
        avisoLicencaInativaRef.current = false;
      }

      if (!normalizada.ativa) {
        if (notifyOnInactive && authUser && !avisoLicencaInativaRef.current) {
          pushNotice("warning", "Licenca expirada ou inativa. Faca a renovacao para continuar.");
          avisoLicencaInativaRef.current = true;
        }
        api.clearAuthToken();
        setAuthUser(null);
        setRoleState("GERENTE");
      }

      return normalizada;
    } catch (error) {
      const fallback = {
        ...DEFAULT_LICENCA_INFO,
        loading: false,
        status: "ERRO",
        mensagem: getErrorMessage(error)
      };

      if (!mountedRef.current) return fallback;

      setLicencaInfo(fallback);
      setApiOnline(false);
      if (!silent) {
        pushNotice("error", fallback.mensagem);
      }
      return fallback;
    } finally {
      if (!silent && mountedRef.current) {
        setLicencaProcessando(false);
      }
    }
  }

  useEffect(() => {
    if (!authReady) return undefined;

    const validar = () => {
      verificarLicencaStatus({ silent: true, notifyOnInactive: true }).catch(() => null);
    };

    validar();
    const intervalId = setInterval(validar, 20000);

    const onFocus = () => validar();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        validar();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authReady, authUser?.id]);

  async function ativarLicenca(chave, options = {}) {
    const chaveNormalizada = String(chave || "").trim();
    if (!chaveNormalizada) {
      pushNotice("warning", "Informe a chave de licenca para ativar.");
      return { ativa: false, mensagem: "Informe a chave de licenca para ativar." };
    }

    setLicencaProcessando(true);

    try {
      const data = await api.ativarLicenca({
        token_licenca: chaveNormalizada,
        force: Boolean(options?.force)
      });

      const normalizada = normalizarLicencaInfo(data);
      if (!mountedRef.current) return normalizada;
      setLicencaInfo(normalizada);
      setApiOnline(true);

      if (normalizada.ativa) {
        pushNotice("success", "Licenca ativada com sucesso.");
      }

      return normalizada;
    } catch (error) {
      const mensagem = getErrorMessage(error);
      if (!mountedRef.current) return { ativa: false, mensagem };
      pushNotice("error", mensagem);
      return { ativa: false, mensagem };
    } finally {
      if (mountedRef.current) {
        setLicencaProcessando(false);
      }
    }
  }

  useEffect(() => {
    if (!authReady || !authUser || !licencaInfo.ativa) return;
    recarregarTudo().catch(() => null);
  }, [role, authReady, authUser?.id, licencaInfo.ativa]);

  useEffect(() => {
    if (!authReady || !authUser || !licencaInfo.ativa) return undefined;

    const refreshMs = Math.max(
      5000,
      Math.min(120000, Number(configuracoes.auto_refresh_segundos || 15) * 1000)
    );

    const intervalo = setInterval(() => {
      const mesaAtualId = mesaSelecionada?.id || null;
      recarregarTudo(mesaAtualId, { silent: true }).catch(() => null);
    }, refreshMs);

    return () => clearInterval(intervalo);
  }, [
    role,
    authReady,
    authUser?.id,
    licencaInfo.ativa,
    mesaSelecionada?.id,
    filtroFinanceiroData,
    filtroHistoricoData,
    configuracoes.auto_refresh_segundos
  ]);

  async function selecionarMesa(mesa) {
    setMesaSelecionada(mesa);

    if (!mesa || mesa.status === "LIVRE") {
      setPedidoAtivo(null);
      return;
    }

    try {
      const detalhe = await api.getMesaPedido(mesa.id, role);
      setPedidoAtivo(detalhe);
    } catch (error) {
      pushNotice("error", getErrorMessage(error));
      setPedidoAtivo(null);
    }
  }

  async function executarAcao(executor, options = {}) {
    const {
      mesaId = null,
      successMessage = "",
      lowStockMessage = "",
      syncOnError = true,
      showSuccess = true
    } = options;

    setLoading(true);

    try {
      const resultado = await executor();
      await recarregarTudo(mesaId, { silent: true });

      if (resultado?.alerta_estoque) {
        pushNotice("warning", lowStockMessage || "Estoque baixo para um dos produtos.");
      } else if (successMessage && showSuccess) {
        pushNotice("success", successMessage);
      }

      return resultado;
    } catch (error) {
      if (syncOnError) {
        await recarregarTudo(mesaId, { silent: true }).catch(() => null);
      }

      pushNotice("error", getErrorMessage(error));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function sincronizarAgora() {
    await recarregarTudo().catch(() => null);
  }

  async function loginComPin(dadosLogin) {
    const licencaAtual = await verificarLicencaStatus({ silent: true, notifyOnInactive: false });
    if (!licencaAtual?.ativa) {
      pushNotice("warning", "Ative uma licenca valida antes de fazer login.");
      return null;
    }

    setLoading(true);
    try {
      const resultado = await api.authLogin(dadosLogin || {});
      const usuario = normalizarUsuarioAuth(resultado?.usuario);
      if (!resultado?.token || !usuario) {
        throw new Error("Resposta invalida do servidor de autenticacao.");
      }

      api.setAuthToken(resultado.token);
      setAuthUser(usuario);
      setRoleState(usuario.role);
      await recarregarTudo(null, { silent: true, forceAuth: true, roleOverride: usuario.role });
      pushNotice("success", `Sessao iniciada: ${usuario.nome}.`);
      return usuario;
    } catch (error) {
      api.clearAuthToken();
      setAuthUser(null);
      pushNotice("error", getErrorMessage(error));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function logoutSessao() {
    setLoading(true);
    try {
      await api.authLogout().catch(() => null);
    } finally {
      api.clearAuthToken();
      setAuthUser(null);
      setRoleState("GERENTE");
      setMesas([]);
      setProdutos([]);
      setHistorico([]);
      setFinanceiro(null);
      setCaixa({ aberto: false, sessao: null, ultima_sessao: null, movimentos: [], resumo_saldo: null });
      setMesaSelecionada(null);
      setPedidoAtivo(null);
      setUsuarios([]);
      setCatalogoPermissoes([]);
      setAuditoria([]);
      setBackupsSistema({ diretorio: "", backups: [], espelho_dir: "", retencao_dias: 30 });
      setSistemaConfig(DEFAULT_SISTEMA_CONFIG);
      setLoading(false);
    }
  }

  async function definirFiltroFinanceiroPeriodo(periodoInput = {}) {
    const hoje = hojeLocalIso();
    const normalizado = normalizarPeriodoDatas(periodoInput, hoje, hoje);
    const periodo = normalizado.data_inicio
      ? normalizado
      : { data_inicio: hoje, data_fim: hoje };

    setFiltroFinanceiroPeriodo(periodo);
    setFiltroFinanceiroData(
      periodo.data_inicio === periodo.data_fim ? periodo.data_inicio : ""
    );

    if (!authUser || !hasPermission("APP_FINANCEIRO_VER")) return;

    setLoading(true);
    try {
      const financeiroData = await api.getFinanceiro(role, periodo);
      if (!mountedRef.current) return;
      setFinanceiro(financeiroData);
      setApiOnline(true);
    } catch (error) {
      if (!mountedRef.current) return;
      setApiOnline(false);
      pushNotice("error", getErrorMessage(error));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }

  async function definirFiltroHistoricoPeriodo(periodoInput = {}) {
    const periodo = normalizarPeriodoDatas(periodoInput);
    setFiltroHistoricoPeriodo(periodo);
    setFiltroHistoricoData(
      periodo.data_inicio && periodo.data_inicio === periodo.data_fim ? periodo.data_inicio : ""
    );

    if (!authUser || !hasPermission("APP_HISTORICO_VER")) return;

    setLoading(true);
    try {
      const historicoData = await api.getHistorico(role, periodo);
      if (!mountedRef.current) return;
      setHistorico(historicoData);
      setApiOnline(true);
    } catch (error) {
      if (!mountedRef.current) return;
      setApiOnline(false);
      pushNotice("error", getErrorMessage(error));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }

  async function definirFiltroFinanceiroPorData(dataRef) {
    const data = String(dataRef || "").trim();
    const payload = data
      ? { data_inicio: data, data_fim: data }
      : { data_inicio: hojeLocalIso(), data_fim: hojeLocalIso() };
    return definirFiltroFinanceiroPeriodo(payload);
  }

  async function definirFiltroHistoricoPorData(dataRef) {
    const data = String(dataRef || "").trim();
    const payload = data
      ? { data_inicio: data, data_fim: data }
      : { data_inicio: "", data_fim: "" };
    return definirFiltroHistoricoPeriodo(payload);
  }

  async function criarMesa(numero) {
    return executarAcao(
      () => api.criarMesa({ numero }, role),
      {
        successMessage: "Mesa criada com sucesso."
      }
    );
  }

  async function excluirMesa(mesaId, pinSensivel = "", forcar = false) {
    return executarAcao(
      () =>
        api.excluirMesa(mesaId, role, {
          sensitivePin: pinSensivel,
          forcar: Boolean(forcar)
        }),
      {
        mesaId,
        successMessage: "Mesa excluida com sucesso."
      }
    );
  }

  async function abrirMesa(mesaId, clienteNome) {
    return executarAcao(
      () => api.abrirMesa(mesaId, { cliente_nome: clienteNome }, role),
      {
        mesaId,
        successMessage: "Mesa aberta com sucesso."
      }
    );
  }

  async function adicionarItem(mesaId, produtoId, quantidade) {
    const quantidadeNumero = Math.max(1, Number(quantidade || 1) || 1);
    const produtoSelecionado = (produtos || []).find(
      (item) => Number(item?.id) === Number(produtoId)
    );
    const nomeProduto = String(produtoSelecionado?.nome || "").trim();
    const mensagemSucesso = nomeProduto
      ? `${nomeProduto} x${quantidadeNumero} adicionado na conta.`
      : "Item adicionado na conta.";

    return executarAcao(
      () =>
        api.addItem(
          mesaId,
          {
            produto_id: produtoId,
            quantidade
          },
          role
        ),
      {
        mesaId,
        successMessage: mensagemSucesso,
        lowStockMessage: "Atencao: estoque baixo para este produto."
      }
    );
  }

  async function atualizarQuantidadeItem(mesaId, itemId, quantidade) {
    return executarAcao(
      () => api.atualizarQuantidadeItem(mesaId, itemId, { quantidade }, role),
      {
        mesaId,
        successMessage: "Quantidade atualizada.",
        lowStockMessage: "Atencao: estoque baixo para este produto.",
        showSuccess: false
      }
    );
  }

  async function removerItem(mesaId, itemId) {
    return executarAcao(
      () => api.removerItem(mesaId, itemId, role),
      {
        mesaId,
        successMessage: "Item removido.",
        showSuccess: false
      }
    );
  }

  async function fecharMesa(mesaId, dadosFechamento) {
    return executarAcao(
      () => api.fecharMesa(mesaId, dadosFechamento, role),
      {
        mesaId,
        successMessage: "Conta enviada para fechamento. Confira com o cliente e finalize o pagamento."
      }
    );
  }

  async function retomarFechamentoMesa(mesaId) {
    return executarAcao(
      () => api.retomarFechamentoMesa(mesaId, role),
      {
        mesaId,
        successMessage: "Conta voltou para OCUPADA."
      }
    );
  }

  async function pagarMesa(mesaId, dados) {
    return executarAcao(
      () => api.pagarMesa(mesaId, dados, role),
      {
        successMessage: "Conta finalizada com sucesso. Mesa liberada."
      }
    );
  }

  async function abrirCaixa(dadosCaixa) {
    return executarAcao(
      () => api.abrirCaixa(dadosCaixa, role),
      {
        successMessage: "Caixa aberto com sucesso."
      }
    );
  }

  async function fecharCaixa(dadosCaixa) {
    return executarAcao(
      () => api.fecharCaixa(dadosCaixa, role),
      {
        successMessage: "Caixa fechado com sucesso."
      }
    );
  }

  async function movimentarCaixa(dadosMovimento) {
    return executarAcao(
      () => api.movimentarCaixa(dadosMovimento, role),
      {
        successMessage: "Movimento de caixa registrado."
      }
    );
  }

  async function reabrirMesa(mesaId) {
    return executarAcao(
      () => api.reabrirMesa(mesaId, role),
      {
        mesaId,
        successMessage: "Mesa reaberta."
      }
    );
  }

  async function excluirHistorico(pedidoId, pinSensivel = "") {
    return executarAcao(
      () => api.excluirHistorico(pedidoId, role, pinSensivel),
      {
        successMessage: "Registro removido do historico."
      }
    );
  }

  async function criarProduto(dadosProduto) {
    return executarAcao(
      () => api.criarProduto(dadosProduto, role),
      {
        successMessage: "Produto cadastrado com sucesso."
      }
    );
  }

  async function atualizarProduto(produtoId, payload) {
    return executarAcao(
      () => api.atualizarProduto(produtoId, payload, role),
      {
        successMessage: "Produto atualizado com sucesso."
      }
    );
  }

  async function atualizarEstoqueProduto(produtoId, estoque) {
    return executarAcao(
      () => api.atualizarEstoqueProduto(produtoId, { estoque }, role),
      {
        successMessage: "Estoque atualizado."
      }
    );
  }

  async function atualizarEstoqueProdutoLote(payload, pinSensivel = "") {
    return executarAcao(
      () => api.atualizarEstoqueProdutoLote(payload, role, pinSensivel),
      {
        successMessage: "Ajuste em lote aplicado."
      }
    );
  }

  async function importarProdutosLote(payload, pinSensivel = "") {
    return executarAcao(
      () => api.importarProdutosLote(payload, role, pinSensivel),
      {
        successMessage: "Importacao em lote concluida."
      }
    );
  }

  async function removerProduto(produtoId, pinSensivel = "") {
    return executarAcao(
      () => api.removerProduto(produtoId, role, pinSensivel),
      {
        successMessage: "Produto removido com sucesso."
      }
    );
  }

  async function listarUsuariosSistema() {
    if (!hasPermission("APP_USUARIOS_GERIR")) return [];
    setLoading(true);
    try {
      const data = await api.getUsuarios(role);
      const lista = Array.isArray(data?.usuarios) ? data.usuarios : [];
      const catalogo = Array.isArray(data?.catalogo_permissoes) ? data.catalogo_permissoes : [];
      setUsuarios(lista);
      setCatalogoPermissoes(catalogo);
      return lista;
    } catch (error) {
      pushNotice("error", getErrorMessage(error));
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function criarUsuarioSistema(payload, pinSensivel = "") {
    return executarAcao(
      () => api.criarUsuario(payload, role, pinSensivel),
      {
        successMessage: "Usuario criado com sucesso.",
        syncOnError: false
      }
    );
  }

  async function atualizarUsuarioSistema(usuarioId, payload, pinSensivel = "") {
    return executarAcao(
      () => api.atualizarUsuario(usuarioId, payload, role, pinSensivel),
      {
        successMessage: "Usuario atualizado.",
        syncOnError: false
      }
    );
  }

  async function exportarBackupSistema() {
    if (!hasPermission("APP_BACKUP_GERIR")) return null;
    setLoading(true);
    try {
      const backup = await api.exportarBackup(role);
      pushNotice("success", "Backup gerado com sucesso.");
      return backup;
    } catch (error) {
      pushNotice("error", getErrorMessage(error));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function listarBackupsSistema(limit = 20) {
    if (!hasPermission("APP_BACKUP_GERIR")) {
      return { diretorio: "", backups: [], espelho_dir: "", retencao_dias: 30 };
    }
    setLoading(true);
    try {
      const data = await api.getBackups(role, limit);
      const payload = {
        diretorio: String(data?.diretorio || ""),
        backups: Array.isArray(data?.backups) ? data.backups : [],
        espelho_dir: String(data?.espelho_dir || ""),
        retencao_dias: Math.max(7, Math.min(365, Number(data?.retencao_dias || 30) || 30))
      };
      setBackupsSistema(payload);
      return payload;
    } catch (error) {
      pushNotice("error", getErrorMessage(error));
      return { diretorio: "", backups: [], espelho_dir: "", retencao_dias: 30 };
    } finally {
      setLoading(false);
    }
  }

  async function gerarBackupArquivoSistema() {
    if (!hasPermission("APP_BACKUP_GERIR")) return null;
    setLoading(true);
    try {
      const resultado = await api.gerarBackupArquivo(role);
      const data = await api.getBackups(role, 20).catch(() => null);
      if (data && mountedRef.current) {
        setBackupsSistema({
          diretorio: String(data?.diretorio || ""),
          backups: Array.isArray(data?.backups) ? data.backups : [],
          espelho_dir: String(data?.espelho_dir || ""),
          retencao_dias: Math.max(7, Math.min(365, Number(data?.retencao_dias || 30) || 30))
        });
      }
      pushNotice("success", "Arquivo de backup salvo no dispositivo.");
      return resultado;
    } catch (error) {
      pushNotice("error", getErrorMessage(error));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function executarBackupAutoSistema(force = false) {
    if (!hasPermission("APP_BACKUP_GERIR")) return null;
    setLoading(true);
    try {
      const resultado = await api.executarBackupAuto(role, force);
      const data = await api.getBackups(role, 20).catch(() => null);
      if (data && mountedRef.current) {
        setBackupsSistema({
          diretorio: String(data?.diretorio || ""),
          backups: Array.isArray(data?.backups) ? data.backups : [],
          espelho_dir: String(data?.espelho_dir || ""),
          retencao_dias: Math.max(7, Math.min(365, Number(data?.retencao_dias || 30) || 30))
        });
      }
      if (resultado?.executado) {
        pushNotice("success", "Backup automatico executado com sucesso.");
      } else {
        pushNotice("warning", "Backup automatico ja executado hoje.");
      }
      return resultado;
    } catch (error) {
      pushNotice("error", getErrorMessage(error));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function restaurarBackupSistema(backup, pinSensivel = "") {
    if (!hasPermission("APP_BACKUP_GERIR")) return null;
    setLoading(true);
    try {
      const resultado = await api.restaurarBackup(backup, role, pinSensivel);
      await recarregarTudo(null, { silent: true });
      pushNotice("success", "Backup restaurado com sucesso.");
      return resultado;
    } catch (error) {
      pushNotice("error", getErrorMessage(error));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function restaurarBackupArquivoSistema(arquivo, pinSensivel = "") {
    if (!hasPermission("APP_BACKUP_GERIR")) return null;
    const nomeArquivo = String(arquivo || "").trim();
    if (!nomeArquivo) return null;

    setLoading(true);
    try {
      const resultado = await api.restaurarBackupArquivo(nomeArquivo, role, pinSensivel);
      await recarregarTudo(null, { silent: true });
      pushNotice("success", `Backup restaurado: ${nomeArquivo}`);
      return resultado;
    } catch (error) {
      pushNotice("error", getErrorMessage(error));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function limparDadosSistema(options = {}, pinSensivel = "") {
    if (!hasPermission("APP_BACKUP_GERIR")) return null;
    setLoading(true);
    try {
      const payload = {
        confirmar: true,
        criar_mesas_padrao: Boolean(options?.criar_mesas_padrao),
        criar_produtos_padrao: Boolean(options?.criar_produtos_padrao)
      };
      const resultado = await api.limparDadosSistema(payload, role, pinSensivel);
      await recarregarTudo(null, { silent: true });
      pushNotice("success", "Sistema limpo com sucesso.");
      return resultado;
    } catch (error) {
      pushNotice("error", getErrorMessage(error));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function carregarAuditoria(limit = 200) {
    if (!hasPermission("APP_AUDITORIA_VER")) return [];
    setLoading(true);
    try {
      const data = await api.getAuditoria(role, limit);
      const logs = Array.isArray(data?.logs) ? data.logs : [];
      setAuditoria(logs);
      return logs;
    } catch (error) {
      pushNotice("error", getErrorMessage(error));
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function carregarSistemaConfig() {
    if (!hasPermission("APP_CONFIG_VER")) return DEFAULT_SISTEMA_CONFIG;
    setLoading(true);
    try {
      const data = await api.getSistemaConfig(role);
      const config = normalizarSistemaConfig(data?.config || {});
      setSistemaConfig(config);
      return config;
    } catch (error) {
      pushNotice("error", getErrorMessage(error));
      return DEFAULT_SISTEMA_CONFIG;
    } finally {
      setLoading(false);
    }
  }

  async function atualizarSistemaConfig(payload = {}) {
    if (!hasPermission("APP_CONFIG_VER")) return null;
    setLoading(true);
    try {
      const data = await api.atualizarSistemaConfig(payload, role);
      const config = normalizarSistemaConfig(data?.config || {});
      setSistemaConfig(config);
      pushNotice("success", "Configuracoes do sistema atualizadas.");
      return config;
    } catch (error) {
      pushNotice("error", getErrorMessage(error));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function exportarAuditoriaSistema(formato = "csv", limit = 1500) {
    if (!hasPermission("APP_AUDITORIA_VER")) return null;
    setLoading(true);
    try {
      const data = await api.exportarAuditoria(role, formato, limit);
      pushNotice("success", "Auditoria exportada com sucesso.");
      return data;
    } catch (error) {
      pushNotice("error", getErrorMessage(error));
      return null;
    } finally {
      setLoading(false);
    }
  }

  function alterarRole(novoRole) {
    if (authUser) return;
    const roleSanitizado = normalizarRolePermitido(novoRole, "GERENTE");
    localStorage.setItem("role", roleSanitizado);
    setRoleState(roleSanitizado);
  }

  function atualizarConfiguracoes(parcial) {
    setConfiguracoes((prev) => normalizarConfiguracoes({ ...prev, ...(parcial || {}) }));
  }

  function atualizarConfigImpressao(parcial) {
    setConfigImpressao((prev) => normalizarConfigImpressao({ ...prev, ...(parcial || {}) }));
  }

  function restaurarConfiguracoesPadrao() {
    setConfiguracoes(DEFAULT_CONFIGURACOES);
  }

  function restaurarConfigImpressaoPadrao() {
    setConfigImpressao(DEFAULT_CONFIG_IMPRESSAO);
  }

  const configuracaoImpressaoAtual = {
    ...configuracoes,
    ...configImpressao
  };

  function hasPermission(chave) {
    const key = String(chave || "").trim();
    if (!key) return true;

    const permissoes = authUser?.permissoes;
    if (permissoes && typeof permissoes === "object" && key in permissoes) {
      return Boolean(permissoes[key]);
    }

    return role === "GERENTE";
  }

  return (
    <AppContext.Provider
      value={{
        authReady,
        authUser,
        licencaInfo,
        licencaProcessando,
        verificarLicencaStatus,
        ativarLicenca,
        loginComPin,
        logoutSessao,
        role,
        setRole: alterarRole,
        mesas,
        produtos,
        historico,
        financeiro,
        caixa,
        usuarios,
        catalogoPermissoes,
        auditoria,
        backupsSistema,
        sistemaConfig,
        filtroFinanceiroData,
        filtroFinanceiroPeriodo,
        filtroHistoricoData,
        filtroHistoricoPeriodo,
        mesaSelecionada,
        pedidoAtivo,
        loading,
        notice,
        clearNotice,
        apiOnline,
        configuracoes,
        configImpressao,
        configuracaoImpressaoAtual,
        sincronizarAgora,
        atualizarConfiguracoes,
        atualizarConfigImpressao,
        restaurarConfiguracoesPadrao,
        restaurarConfigImpressaoPadrao,
        hasPermission,
        definirFiltroFinanceiroPorData,
        definirFiltroFinanceiroPeriodo,
        definirFiltroHistoricoPorData,
        definirFiltroHistoricoPeriodo,
        selecionarMesa,
        criarMesa,
        excluirMesa,
        abrirMesa,
        adicionarItem,
        atualizarQuantidadeItem,
        removerItem,
        fecharMesa,
        retomarFechamentoMesa,
        pagarMesa,
        abrirCaixa,
        fecharCaixa,
        movimentarCaixa,
        reabrirMesa,
        excluirHistorico,
        criarProduto,
        atualizarProduto,
        atualizarEstoqueProduto,
        atualizarEstoqueProdutoLote,
        importarProdutosLote,
        removerProduto,
        listarUsuariosSistema,
        criarUsuarioSistema,
        atualizarUsuarioSistema,
        exportarBackupSistema,
        listarBackupsSistema,
        gerarBackupArquivoSistema,
        executarBackupAutoSistema,
        restaurarBackupSistema,
        restaurarBackupArquivoSistema,
        limparDadosSistema,
        carregarAuditoria,
        carregarSistemaConfig,
        atualizarSistemaConfig,
        exportarAuditoriaSistema,
        recarregarTudo
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}


