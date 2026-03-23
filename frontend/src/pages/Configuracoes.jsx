import React, { useEffect, useMemo, useState } from "react";
import SelectField from "../components/SelectField";
import ConfirmDialog from "../components/ConfirmDialog";
import { useApp } from "../context/AppContext";
import { formatDateTimePtBr } from "../utils/datetime";

const ROLE_OPTIONS = [
  { value: "GARCOM", label: "Garcom" },
  { value: "GERENTE", label: "Gerente" }
];
const CONTATO_RENOVACAO = "5531995172257";
const SUPORTE_FIXO = {
  nome: "GastroCode Brasil",
  telefone: "31995172257",
  email: "guilherme.honoratos08@gmail.com",
  site: ""
};

const userDefault = {
  nome: "",
  apelido: "",
  role: "GARCOM",
  pin: "",
  perfil_personalizado: false,
  perfil_nome: "",
  permissoes: {}
};

function formatarBytes(bytes) {
  const valor = Number(bytes || 0);
  if (!Number.isFinite(valor) || valor <= 0) return "0 B";
  if (valor < 1024) return `${Math.round(valor)} B`;
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`;
  return `${(valor / (1024 * 1024)).toFixed(2)} MB`;
}

function formatarDataHora(valor) {
  return formatDateTimePtBr(valor);
}

function apenasDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function formatarDocumentoInput(valor) {
  const digits = apenasDigitos(valor).slice(0, 14);

  if (digits.length <= 11) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }

  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function todosDigitosIguais(digits) {
  return /^(\d)\1+$/.test(String(digits || ""));
}

function validarCpf(digitsRaw) {
  const digits = String(digitsRaw || "");
  if (digits.length !== 11 || todosDigitosIguais(digits)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i += 1) {
    soma += Number(digits[i]) * (10 - i);
  }

  let dv1 = (soma * 10) % 11;
  if (dv1 === 10) dv1 = 0;
  if (dv1 !== Number(digits[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i += 1) {
    soma += Number(digits[i]) * (11 - i);
  }

  let dv2 = (soma * 10) % 11;
  if (dv2 === 10) dv2 = 0;
  return dv2 === Number(digits[10]);
}

function validarCnpj(digitsRaw) {
  const digits = String(digitsRaw || "");
  if (digits.length !== 14 || todosDigitosIguais(digits)) return false;

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, ...pesos1];

  let soma = 0;
  for (let i = 0; i < 12; i += 1) {
    soma += Number(digits[i]) * pesos1[i];
  }
  let resto = soma % 11;
  const dv1 = resto < 2 ? 0 : 11 - resto;
  if (dv1 !== Number(digits[12])) return false;

  soma = 0;
  for (let i = 0; i < 13; i += 1) {
    soma += Number(digits[i]) * pesos2[i];
  }
  resto = soma % 11;
  const dv2 = resto < 2 ? 0 : 11 - resto;
  return dv2 === Number(digits[13]);
}

function formatarTelefoneInput(valor) {
  const digits = apenasDigitos(valor).slice(0, 11);

  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function normalizarCidadeUfInput(valor) {
  return String(valor || "")
    .replace(/[^A-Za-zÀ-ÿ .'-]/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 90);
}

function mapaPermissoesUsuario(usuario, catalogoPermissoes) {
  const catalogo = Array.isArray(catalogoPermissoes) ? catalogoPermissoes : [];
  const permissaoRaw = usuario?.permissoes && typeof usuario.permissoes === "object" ? usuario.permissoes : {};

  if (catalogo.length < 1) {
    const fallback = {};
    for (const [chave, ativo] of Object.entries(permissaoRaw)) {
      fallback[chave] = Boolean(ativo);
    }
    return fallback;
  }

  const mapa = {};
  for (const item of catalogo) {
    const chave = String(item?.chave || "").trim();
    if (!chave) continue;
    mapa[chave] = Boolean(permissaoRaw[chave]);
  }
  return mapa;
}

export default function Configuracoes() {
  const {
    role,
    hasPermission,
    licencaInfo,
    loading,
    configuracoes,
    atualizarConfiguracoes,
    restaurarConfiguracoesPadrao,
    usuarios,
    catalogoPermissoes,
    auditoria,
    backupsSistema,
    sistemaConfig,
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
    exportarAuditoriaSistema
  } = useApp();

  const [novoUsuario, setNovoUsuario] = useState(userDefault);
  const [edicoes, setEdicoes] = useState({});
  const [processandoUsuario, setProcessandoUsuario] = useState(false);
  const [processandoBackup, setProcessandoBackup] = useState(false);
  const [processandoBackupLocal, setProcessandoBackupLocal] = useState(false);
  const [processandoBackupAuto, setProcessandoBackupAuto] = useState(false);
  const [processandoLimpeza, setProcessandoLimpeza] = useState(false);
  const [processandoSistemaConfig, setProcessandoSistemaConfig] = useState(false);
  const [exportandoAuditoria, setExportandoAuditoria] = useState(false);
  const [filtroAuditoria, setFiltroAuditoria] = useState("");
  const [localSistemaConfig, setLocalSistemaConfig] = useState(sistemaConfig);
  const [updaterInfo, setUpdaterInfo] = useState({
    enabled: false,
    status: "idle",
    message: "Atualizacao nao iniciada.",
    versionAtual: "",
    versionNova: "",
    releaseName: "",
    releaseNotes: "",
    feedUrl: "",
    progress: 0
  });
  const [processandoUpdater, setProcessandoUpdater] = useState(false);
  const [erroOperacao, setErroOperacao] = useState("");
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);
  const [confirmRestoreArquivoOpen, setConfirmRestoreArquivoOpen] = useState(false);
  const [confirmLimpezaOpen, setConfirmLimpezaOpen] = useState(false);
  const [arquivoBackupPendente, setArquivoBackupPendente] = useState(null);
  const [arquivoBackupSelecionado, setArquivoBackupSelecionado] = useState(null);
  const [codigoLimpeza, setCodigoLimpeza] = useState("");
  const [pinSeguranca, setPinSeguranca] = useState("");
  const [processandoRestoreArquivo, setProcessandoRestoreArquivo] = useState(false);
  const desktopUpdater =
    typeof window !== "undefined" ? window.desktopRuntime?.updater || null : null;

  const pinSegurancaValido = /^\d{4,8}$/.test(String(pinSeguranca || "").trim());
  const podeGerirBackup = hasPermission("APP_BACKUP_GERIR");

  useEffect(() => {
    setEdicoes((prev) => {
      const next = {};
      for (const user of usuarios || []) {
        const anterior = prev?.[user.id] || {};
        next[user.id] = {
          nome: user.nome,
          apelido: user.apelido,
          role: user.role,
          ativo: Boolean(user.ativo),
          pin: String(anterior.pin || ""),
          perfil_personalizado: Boolean(user.perfil_personalizado),
          perfil_nome: String(user.perfil_nome || ""),
          permissoes: mapaPermissoesUsuario(user, catalogoPermissoes)
        };
      }
      return next;
    });
  }, [usuarios, catalogoPermissoes]);

  useEffect(() => {
    listarUsuariosSistema();
    carregarAuditoria(200);
    listarBackupsSistema(40);
    carregarSistemaConfig();
  }, []);

  useEffect(() => {
    setLocalSistemaConfig(sistemaConfig);
  }, [sistemaConfig]);

  useEffect(() => {
    if (!Array.isArray(catalogoPermissoes) || catalogoPermissoes.length < 1) return;
    setNovoUsuario((prev) => {
      const atual = prev?.permissoes && typeof prev.permissoes === "object" ? prev.permissoes : {};
      const nextPermissoes = {};
      for (const item of catalogoPermissoes) {
        const chave = String(item?.chave || "").trim();
        if (!chave) continue;
        nextPermissoes[chave] = Boolean(atual[chave]);
      }
      return {
        ...prev,
        permissoes: nextPermissoes
      };
    });
  }, [catalogoPermissoes]);

  useEffect(() => {
    if (!desktopUpdater) return undefined;
    let ativo = true;
    const unsubscribe = desktopUpdater.onStatus((payload) => {
      if (!ativo) return;
      setUpdaterInfo((prev) => ({ ...prev, ...(payload || {}) }));
    });

    desktopUpdater
      .getState()
      .then((payload) => {
        if (!ativo) return;
        setUpdaterInfo((prev) => ({ ...prev, ...(payload || {}) }));
      })
      .catch(() => null);

    return () => {
      ativo = false;
      try {
        unsubscribe();
      } catch {}
    };
  }, [desktopUpdater]);

  if (!hasPermission("APP_CONFIG_VER")) {
    return <p>Sem permissao para acessar configuracoes.</p>;
  }

  function handleReset() {
    setErroOperacao("");
    setConfirmResetOpen(true);
  }

  function confirmarReset() {
    restaurarConfiguracoesPadrao();
    setConfirmResetOpen(false);
  }

  function toggle(chave) {
    atualizarConfiguracoes({ [chave]: !configuracoes[chave] });
  }

  async function handleCriarUsuario(e) {
    e.preventDefault();
    setProcessandoUsuario(true);
    try {
      const payload = {
        nome: novoUsuario.nome,
        apelido: novoUsuario.apelido,
        role: novoUsuario.role,
        pin: novoUsuario.pin
      };
      if (novoUsuario.perfil_personalizado) {
        payload.perfil_personalizado = true;
        payload.perfil_nome = String(novoUsuario.perfil_nome || "").trim();
        payload.permissoes = { ...(novoUsuario.permissoes || {}) };
      }
      const resultado = await criarUsuarioSistema(payload, "");
      if (resultado) {
        const permissaoInicial = {};
        for (const item of catalogoPermissoes || []) {
          const chave = String(item?.chave || "").trim();
          if (!chave) continue;
          permissaoInicial[chave] = false;
        }
        setNovoUsuario({ ...userDefault, permissoes: permissaoInicial });
        setErroOperacao("");
        await listarUsuariosSistema();
      } else {
        setErroOperacao("Nao foi possivel criar usuario. Verifique campos e apelido unico.");
      }
    } finally {
      setProcessandoUsuario(false);
    }
  }

  async function handleSalvarUsuario(userId) {
    const edit = edicoes[userId];
    if (!edit) return;
    setProcessandoUsuario(true);
    try {
      const payload = {
        nome: edit.nome,
        apelido: edit.apelido,
        role: edit.role,
        ativo: edit.ativo,
        perfil_personalizado: Boolean(edit.perfil_personalizado),
        perfil_nome: edit.perfil_personalizado ? String(edit.perfil_nome || "").trim() : "",
        permissoes: edit.perfil_personalizado ? { ...(edit.permissoes || {}) } : {}
      };
      if (String(edit.pin || "").trim()) {
        payload.pin = String(edit.pin || "").trim();
      }
      const ok = await atualizarUsuarioSistema(userId, payload, "");
      if (ok) {
        setEdicoes((prev) => ({
          ...prev,
          [userId]: {
            ...prev[userId],
            pin: ""
          }
        }));
        setErroOperacao("");
        await listarUsuariosSistema();
      } else {
        setErroOperacao("Nao foi possivel atualizar usuario. Verifique dados informados.");
      }
    } finally {
      setProcessandoUsuario(false);
    }
  }

  function togglePermissaoNovo(chave) {
    setNovoUsuario((prev) => ({
      ...prev,
      permissoes: {
        ...(prev.permissoes || {}),
        [chave]: !Boolean(prev?.permissoes?.[chave])
      }
    }));
  }

  function togglePermissaoEdicao(userId, chave) {
    setEdicoes((prev) => {
      const atual = prev?.[userId] || {};
      return {
        ...prev,
        [userId]: {
          ...atual,
          permissoes: {
            ...(atual.permissoes || {}),
            [chave]: !Boolean(atual?.permissoes?.[chave])
          }
        }
      };
    });
  }

  async function handleExportarBackup() {
    setProcessandoBackup(true);
    try {
      const backup = await exportarBackupSistema();
      if (!backup) return;

      const nomeArquivo = `backup-pdv-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.json`;
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivo;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setProcessandoBackup(false);
    }
  }

  async function handleImportarBackup(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;

    setErroOperacao("");
    setArquivoBackupPendente(arquivo);
    setConfirmImportOpen(true);
  }

  async function confirmarImportarBackup() {
    if (!arquivoBackupPendente) return;
    if (!pinSegurancaValido) {
      setErroOperacao("Informe o PIN de seguranca (4 a 8 numeros) para restaurar backup.");
      return;
    }
    setProcessandoBackup(true);
    try {
      const texto = await arquivoBackupPendente.text();
      const json = JSON.parse(texto);
      if (!json || typeof json !== "object" || !json.tables || typeof json.tables !== "object") {
        throw new Error(
          "Arquivo nao e um backup valido do sistema. Use um JSON exportado nesta tela."
        );
      }
      const ok = await restaurarBackupSistema(json, pinSeguranca);
      if (ok) {
        setErroOperacao("");
        await Promise.all([
          listarUsuariosSistema(),
          carregarAuditoria(200),
          listarBackupsSistema(40),
          carregarSistemaConfig()
        ]);
      } else {
        setErroOperacao("Nao foi possivel restaurar o backup. Confirme PIN e permissoes do usuario logado.");
      }
    } catch (error) {
      setErroOperacao(error?.message || "Arquivo de backup invalido.");
    } finally {
      setProcessandoBackup(false);
      setConfirmImportOpen(false);
      setArquivoBackupPendente(null);
    }
  }

  function handleAbrirRestoreArquivo(backupItem) {
    setArquivoBackupSelecionado(backupItem || null);
    setConfirmRestoreArquivoOpen(true);
    setErroOperacao("");
  }

  async function confirmarRestoreArquivo() {
    if (!arquivoBackupSelecionado?.arquivo) return;
    if (!pinSegurancaValido) {
      setErroOperacao("Informe o PIN de seguranca (4 a 8 numeros) para restaurar backup.");
      return;
    }

    setProcessandoRestoreArquivo(true);
    try {
      const ok = await restaurarBackupArquivoSistema(arquivoBackupSelecionado.arquivo, pinSeguranca);
      if (ok) {
        setErroOperacao("");
        await Promise.all([
          listarUsuariosSistema(),
          carregarAuditoria(200),
          listarBackupsSistema(40),
          carregarSistemaConfig()
        ]);
      } else {
        setErroOperacao("Nao foi possivel restaurar o backup. Confirme PIN e permissoes do usuario logado.");
      }
    } finally {
      setProcessandoRestoreArquivo(false);
      setConfirmRestoreArquivoOpen(false);
      setArquivoBackupSelecionado(null);
    }
  }

  async function handleGerarBackupLocal() {
    setProcessandoBackupLocal(true);
    try {
      await gerarBackupArquivoSistema();
      await listarBackupsSistema(40);
    } finally {
      setProcessandoBackupLocal(false);
    }
  }

  async function handleBackupAuto(force = false) {
    setProcessandoBackupAuto(true);
    try {
      await executarBackupAutoSistema(force);
      await listarBackupsSistema(40);
    } finally {
      setProcessandoBackupAuto(false);
    }
  }

  async function handleAtualizarBackups() {
    setProcessandoBackupLocal(true);
    try {
      await listarBackupsSistema(40);
    } finally {
      setProcessandoBackupLocal(false);
    }
  }

  async function handleSalvarSistemaConfig(parcial = null) {
    setProcessandoSistemaConfig(true);
    try {
      const payload = parcial || localSistemaConfig;
      const atualizado = await atualizarSistemaConfig(payload);
      if (atualizado) {
        setLocalSistemaConfig(atualizado);
        await listarBackupsSistema(40);
      }
    } finally {
      setProcessandoSistemaConfig(false);
    }
  }

  async function handleConcluirOnboarding() {
    await handleSalvarSistemaConfig({ onboarding_concluido: true });
  }

  async function handleExportarAuditoria(formato = "csv") {
    setExportandoAuditoria(true);
    try {
      const resultado = await exportarAuditoriaSistema(formato, 3000);
      if (!resultado?.conteudo || !resultado?.filename) return;
      const mime = formato === "json" ? "application/json" : "text/csv;charset=utf-8";
      const blob = new Blob([resultado.conteudo], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = resultado.filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportandoAuditoria(false);
    }
  }

  async function handleLimparSistemaPublicacao() {
    setErroOperacao("");
    setCodigoLimpeza("");
    setConfirmLimpezaOpen(true);
  }

  async function confirmarLimpezaSistema() {
    if (codigoLimpeza !== "LIMPAR") {
      setErroOperacao("Digite LIMPAR para confirmar a limpeza.");
      return;
    }
    if (!pinSegurancaValido) {
      setErroOperacao("Informe o PIN de seguranca (4 a 8 numeros) para limpar dados.");
      return;
    }
    setProcessandoLimpeza(true);
    try {
      const resultado = await limparDadosSistema({
        criar_mesas_padrao: false,
        criar_produtos_padrao: false
      }, pinSeguranca);
      if (resultado) {
        setErroOperacao("");
        await Promise.all([
          listarUsuariosSistema(),
          carregarAuditoria(200),
          listarBackupsSistema(40),
          carregarSistemaConfig()
        ]);
      }
    } finally {
      setProcessandoLimpeza(false);
      setConfirmLimpezaOpen(false);
    }
  }

  async function handleVerificarAtualizacao() {
    if (!desktopUpdater) return;
    setProcessandoUpdater(true);
    try {
      const payload = await desktopUpdater.checkNow();
      if (payload && typeof payload === "object") {
        setUpdaterInfo((prev) => ({ ...prev, ...payload }));
      }
    } finally {
      setProcessandoUpdater(false);
    }
  }

  async function handleInstalarAtualizacao() {
    if (!desktopUpdater) return;
    setProcessandoUpdater(true);
    try {
      await desktopUpdater.installNow();
    } finally {
      setProcessandoUpdater(false);
    }
  }

  const auditoriaFiltrada = useMemo(() => {
    const termo = String(filtroAuditoria || "").trim().toLowerCase();
    if (!termo) return auditoria || [];
    return (auditoria || []).filter((item) => {
      return (
        String(item.acao || "").toLowerCase().includes(termo) ||
        String(item.usuario_nome || "").toLowerCase().includes(termo) ||
        String(item.rota || "").toLowerCase().includes(termo)
      );
    });
  }, [auditoria, filtroAuditoria]);

  const updaterReleaseNotes = useMemo(() => {
    const texto = String(updaterInfo?.releaseNotes || "")
      .replace(/\r/g, "")
      .trim();
    return texto;
  }, [updaterInfo?.releaseNotes]);

  const onboardingPendente = !Boolean(localSistemaConfig?.onboarding_concluido);
  const licencaDiasRestantes = Number(licencaInfo?.licenca?.dias_restantes);
  const licencaExpiraEmBreve =
    licencaInfo?.ativa &&
    Number.isFinite(licencaDiasRestantes) &&
    licencaDiasRestantes >= 0 &&
    licencaDiasRestantes <= 10;
  const licencaOfflineDias = Number(licencaInfo?.licenca?.offline_tolerancia_dias || 0);
  const renovacaoWhatsappHref = useMemo(() => {
    const linhas = [
      "Ola! Quero renovar minha licenca do PDV.",
      `Dispositivo: ${String(licencaInfo?.codigo_dispositivo || "-")}`,
      `Status: ${String(licencaInfo?.status || "-")}`,
      Number.isFinite(licencaDiasRestantes)
        ? `Dias restantes: ${licencaDiasRestantes}`
        : "Dias restantes: sem expiracao definida"
    ];

    if (licencaInfo?.licenca?.expira_em) {
      linhas.push(
        `Expira em: ${formatDateTimePtBr(licencaInfo.licenca.expira_em)}`
      );
    }

    const texto = encodeURIComponent(linhas.join("\n"));
    return `https://api.whatsapp.com/send?phone=${CONTATO_RENOVACAO}&text=${texto}`;
  }, [licencaInfo, licencaDiasRestantes]);

  const errosEstabelecimento = useMemo(() => {
    const nome = String(configuracoes.estabelecimento_nome || "").trim();
    const documentoDigits = apenasDigitos(configuracoes.estabelecimento_documento);
    const telefoneDigits = apenasDigitos(configuracoes.estabelecimento_telefone);
    const cidadeUf = String(configuracoes.estabelecimento_cidade_uf || "").trim();

      return {
        nome: nome && /^\d+$/.test(nome) ? "Nome fantasia nao pode ser apenas numeros." : "",
        documento: (() => {
          if (!documentoDigits) return "";
          if (documentoDigits.length !== 11 && documentoDigits.length !== 14) {
            return "Documento precisa ter 11 (CPF) ou 14 (CNPJ) digitos.";
          }
          if (documentoDigits.length === 11 && !validarCpf(documentoDigits)) {
            return "CPF invalido. Verifique os digitos informados.";
          }
          if (documentoDigits.length === 14 && !validarCnpj(documentoDigits)) {
            return "CNPJ invalido. Verifique os digitos informados.";
          }
          return "";
        })(),
        telefone:
          telefoneDigits && telefoneDigits.length !== 10 && telefoneDigits.length !== 11
            ? "Telefone precisa ter DDD + numero (10 ou 11 digitos)."
          : "",
      cidade_uf:
        cidadeUf && !/^[A-Za-zÀ-ÿ .'-]+(?:\s*-\s*[A-Za-z]{2})?$/.test(cidadeUf)
          ? "Use formato: Cidade - UF (ex.: Sao Paulo - SP)."
          : ""
    };
  }, [
    configuracoes.estabelecimento_nome,
    configuracoes.estabelecimento_documento,
    configuracoes.estabelecimento_telefone,
    configuracoes.estabelecimento_cidade_uf
  ]);

  return (
    <div style={pageStyle}>
      <h2 style={{ margin: 0 }}>Configuracoes</h2>
      {erroOperacao && <div style={erroStyle}>{erroOperacao}</div>}

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Licenca e renovacao</h3>
        <p style={subtleTextStyle}>
          Controle de validade da licenca ativa neste dispositivo.
        </p>

        <div style={licencaStatusBoxStyle(licencaInfo?.ativa, licencaExpiraEmBreve)}>
          <strong>
            Status: {licencaInfo?.status || "-"}
          </strong>
          <div>{licencaInfo?.mensagem || "Sem informacoes de licenca."}</div>
          <div>
            {Number.isFinite(licencaDiasRestantes)
              ? `Dias restantes: ${licencaDiasRestantes}`
              : "Dias restantes: sem expiracao definida"}
          </div>
          <div>
            Expira em:{" "}
            {licencaInfo?.licenca?.expira_em
              ? formatDateTimePtBr(licencaInfo.licenca.expira_em)
              : "-"}
          </div>
          <div>Plano: {licencaInfo?.licenca?.plano || "-"}</div>
          <div>
            Offline tolerado:{" "}
            {Number.isFinite(licencaOfflineDias) && licencaOfflineDias > 0
              ? `${licencaOfflineDias} dia(s)`
              : "-"}
          </div>
          <div>
            Dispositivo: {licencaInfo?.codigo_dispositivo || "-"}
          </div>
          <div>
            Renovacao:{" "}
            <a
              href={renovacaoWhatsappHref}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#9bc6ff", fontWeight: 800 }}
            >
              Abrir WhatsApp de renovacao
            </a>
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Seguranca operacional</h3>
        <p style={subtleTextStyle}>
          PIN obrigatorio para acoes sensiveis (restauracao de backup e limpeza).
        </p>
        <div style={{ ...inputGridStyle, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 360px))" }}>
          <Field
            label="PIN de seguranca (gerente)"
            hint="Nao e salvo no banco. Fica apenas nesta tela durante o uso."
          >
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pinSeguranca}
              onChange={(event) => setPinSeguranca(event.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="4 a 8 numeros"
              style={inputStyle}
            />
          </Field>
        </div>
      </section>

      {onboardingPendente && (
        <section style={cardDestaqueStyle}>
          <h3 style={{ marginTop: 0 }}>Onboarding rapido para publicacao</h3>
          <p style={subtleTextStyle}>
            Finalize esse checklist para deixar o app pronto para operar e vender.
          </p>
          <div style={checklistStyle}>
            <div>1. Preencha dados do estabelecimento e impressao.</div>
            <div>2. Configure backup (espelho e retencao).</div>
            <div>3. Confira contatos de suporte e exporte auditoria teste.</div>
          </div>
          <button
            type="button"
            style={primaryButtonStyle(processandoSistemaConfig)}
            disabled={processandoSistemaConfig}
            onClick={handleConcluirOnboarding}
          >
            {processandoSistemaConfig ? "Salvando..." : "Marcar onboarding como concluido"}
          </button>
        </section>
      )}

      <div style={pageGridStyle}>
        <section style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Dados do estabelecimento</h3>
          <p style={subtleTextStyle}>Esses dados aparecem nos comprovantes e no preview de impressao.</p>

          <div style={inputGridStyle}>
            <Field
              label="Nome fantasia"
              error={errosEstabelecimento.nome}
              hint="Nome que aparece no topo e nos comprovantes."
            >
              <input
                value={configuracoes.estabelecimento_nome}
                onChange={(e) =>
                  atualizarConfiguracoes({ estabelecimento_nome: String(e.target.value || "").slice(0, 90) })
                }
                placeholder="Ex.: Restaurante Jennifer"
                style={inputStyle}
                maxLength={90}
              />
            </Field>

            <Field
              label="Documento (CNPJ/CPF)"
              error={errosEstabelecimento.documento}
              hint="Aceita CPF (11) ou CNPJ (14)."
            >
              <input
                value={configuracoes.estabelecimento_documento}
                onChange={(e) =>
                  atualizarConfiguracoes({
                    estabelecimento_documento: formatarDocumentoInput(e.target.value)
                  })
                }
                placeholder="Ex.: 00.000.000/0001-00"
                style={inputStyle}
                inputMode="numeric"
                maxLength={18}
              />
            </Field>

            <Field
              label="Telefone"
              error={errosEstabelecimento.telefone}
              hint="Formato automatico com DDD."
            >
              <input
                value={configuracoes.estabelecimento_telefone}
                onChange={(e) =>
                  atualizarConfiguracoes({
                    estabelecimento_telefone: formatarTelefoneInput(e.target.value)
                  })
                }
                placeholder="Ex.: (11) 99999-9999"
                style={inputStyle}
                inputMode="numeric"
                maxLength={15}
              />
            </Field>

            <Field
              label="Cidade/UF"
              error={errosEstabelecimento.cidade_uf}
              hint="Sugestao: Cidade - UF"
            >
              <input
                value={configuracoes.estabelecimento_cidade_uf}
                onChange={(e) =>
                  atualizarConfiguracoes({
                    estabelecimento_cidade_uf: normalizarCidadeUfInput(e.target.value)
                  })
                }
                placeholder="Ex.: Sao Paulo - SP"
                style={inputStyle}
                maxLength={90}
              />
            </Field>
          </div>

          <div style={{ marginTop: 10 }}>
            <Field label="Endereco">
              <input
                value={configuracoes.estabelecimento_endereco}
                onChange={(e) => atualizarConfiguracoes({ estabelecimento_endereco: e.target.value })}
                placeholder="Rua, numero, bairro"
                style={inputStyle}
              />
            </Field>
          </div>
        </section>

        <section style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Operacao de mesas</h3>
          <p style={subtleTextStyle}>Regras de abertura e comportamento padrao no atendimento.</p>

          <div style={configStackStyle}>
            <SwitchRow
              label="Exigir nome do cliente ao abrir mesa"
              checked={configuracoes.exigir_nome_cliente}
              onToggle={() => toggle("exigir_nome_cliente")}
            />

            <SwitchRow
              label="Teclado touch automatico na busca"
              checked={configuracoes.teclado_touch_automatico}
              onToggle={() => toggle("teclado_touch_automatico")}
            />

            <SwitchRow
              label="Solicitar nome do garcom ao enviar mesa para fechamento"
              checked={configuracoes.solicitar_nome_garcom_fechamento}
              onToggle={() => toggle("solicitar_nome_garcom_fechamento")}
            />

            <div style={numberGridStyle}>
              <Field label="Pessoas padrao na conta">
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={configuracoes.pessoas_padrao_conta}
                  onChange={(e) => atualizarConfiguracoes({ pessoas_padrao_conta: Number(e.target.value) })}
                  style={inputStyle}
                />
              </Field>

              <Field label="Atualizacao automatica (segundos)">
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={configuracoes.auto_refresh_segundos}
                  onChange={(e) => atualizarConfiguracoes({ auto_refresh_segundos: Number(e.target.value) })}
                  style={inputStyle}
                />
              </Field>
            </div>
          </div>
        </section>

        <section style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Fechamento de conta</h3>
          <p style={subtleTextStyle}>
            Padrao da taxa de servico e do couvert artistico na hora de fechar/pagar mesa.
          </p>

          <div style={configStackStyle}>
            <SwitchRow
              label="Cobrar taxa de servico por padrao"
              checked={configuracoes.cobrar_taxa_servico_padrao}
              onToggle={() => toggle("cobrar_taxa_servico_padrao")}
            />

            <Field label="Taxa de servico padrao (%)">
              <input
                type="number"
                min="0"
                max="30"
                step="0.1"
                value={configuracoes.taxa_servico_padrao_percent}
                onChange={(e) =>
                  atualizarConfiguracoes({ taxa_servico_padrao_percent: Number(e.target.value) })
                }
                style={inputStyle}
                disabled={!configuracoes.cobrar_taxa_servico_padrao}
              />
            </Field>

            <SwitchRow
              label="Cobrar couvert artistico por padrao"
              checked={configuracoes.cobrar_couvert_artistico_padrao}
              onToggle={() => toggle("cobrar_couvert_artistico_padrao")}
            />

            <Field label="Couvert artistico por pessoa (R$)">
              <input
                type="number"
                min="0"
                max="200"
                step="0.01"
                value={configuracoes.couvert_artistico_valor}
                onChange={(e) =>
                  atualizarConfiguracoes({ couvert_artistico_valor: Number(e.target.value) })
                }
                style={inputStyle}
                disabled={!configuracoes.cobrar_couvert_artistico_padrao}
              />
            </Field>
          </div>
        </section>
      </div>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Usuarios e PIN</h3>
        <p style={subtleTextStyle}>Controle de acessos por perfil com trilha de auditoria.</p>

        <form onSubmit={handleCriarUsuario} style={{ ...inputGridStyle, alignItems: "end" }}>
          <Field label="Nome">
            <input
              value={novoUsuario.nome}
              onChange={(e) => setNovoUsuario((prev) => ({ ...prev, nome: e.target.value }))}
              placeholder="Nome do usuario"
              style={inputStyle}
            />
          </Field>

          <Field label="Apelido (login)">
            <input
              value={novoUsuario.apelido}
              onChange={(e) => setNovoUsuario((prev) => ({ ...prev, apelido: e.target.value }))}
              placeholder="Ex.: garcom-noite"
              style={inputStyle}
            />
          </Field>

          <Field label="Perfil">
            <SelectField
              value={novoUsuario.role}
              onChange={(value) => setNovoUsuario((prev) => ({ ...prev, role: value }))}
              options={ROLE_OPTIONS}
              buttonStyle={inputStyle}
            />
          </Field>

          <Field label="PIN (4-8 numeros)">
            <input
              type="password"
              inputMode="numeric"
              value={novoUsuario.pin}
              onChange={(e) => setNovoUsuario((prev) => ({ ...prev, pin: e.target.value.replace(/\D/g, "") }))}
              placeholder="PIN inicial"
              style={inputStyle}
            />
          </Field>

          <button
            type="submit"
            style={primaryButtonStyle(processandoUsuario)}
            disabled={processandoUsuario}
          >
            {processandoUsuario ? "Salvando..." : "Criar usuario"}
          </button>

          <div style={{ gridColumn: "1 / -1", display: "grid", gap: 8 }}>
            <SwitchRow
              label="Perfil personalizado (editar permissoes)"
              checked={Boolean(novoUsuario.perfil_personalizado)}
              onToggle={() =>
                setNovoUsuario((prev) => ({
                  ...prev,
                  perfil_personalizado: !Boolean(prev.perfil_personalizado)
                }))
              }
            />
            {novoUsuario.perfil_personalizado && (
              <>
                <Field label="Nome do perfil personalizado">
                  <input
                    value={novoUsuario.perfil_nome}
                    onChange={(e) =>
                      setNovoUsuario((prev) => ({ ...prev, perfil_nome: e.target.value }))
                    }
                    placeholder="Ex.: Garcom Senior, Caixa noturno..."
                    style={inputStyle}
                  />
                </Field>
                <div style={permissoesGridStyle}>
                  {(catalogoPermissoes || []).length > 0 ? (
                    (catalogoPermissoes || []).map((item) => {
                      const chave = String(item?.chave || "");
                      return (
                        <label key={chave} style={permissaoItemStyle}>
                          <input
                            type="checkbox"
                            checked={Boolean(novoUsuario?.permissoes?.[chave])}
                            onChange={() => togglePermissaoNovo(chave)}
                          />
                          <span>{item?.label || chave}</span>
                        </label>
                      );
                    })
                  ) : (
                    <div style={fieldHintStyle}>Catalogo de permissoes indisponivel no momento.</div>
                  )}
                </div>
              </>
            )}
          </div>
        </form>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {(usuarios || []).map((user) => {
            const edit = edicoes[user.id] || {
              nome: user.nome,
              apelido: user.apelido,
              role: user.role,
              ativo: Boolean(user.ativo),
              pin: "",
              perfil_personalizado: Boolean(user.perfil_personalizado),
              perfil_nome: String(user.perfil_nome || ""),
              permissoes: mapaPermissoesUsuario(user, catalogoPermissoes)
            };

            return (
              <div key={user.id} style={userRowStyle}>
                <input
                  value={edit.nome}
                  onChange={(e) =>
                    setEdicoes((prev) => ({
                      ...prev,
                      [user.id]: { ...edit, nome: e.target.value }
                    }))
                  }
                  style={inputStyle}
                />
                <input
                  value={edit.apelido}
                  onChange={(e) =>
                    setEdicoes((prev) => ({
                      ...prev,
                      [user.id]: { ...edit, apelido: e.target.value }
                    }))
                  }
                  style={inputStyle}
                />
                <SelectField
                  value={edit.role}
                  onChange={(value) =>
                    setEdicoes((prev) => ({
                      ...prev,
                      [user.id]: { ...edit, role: value }
                    }))
                  }
                  options={ROLE_OPTIONS}
                  buttonStyle={inputStyle}
                />
                <input
                  type="password"
                  inputMode="numeric"
                  value={edit.pin}
                  onChange={(e) =>
                    setEdicoes((prev) => ({
                      ...prev,
                      [user.id]: { ...edit, pin: e.target.value.replace(/\D/g, "") }
                    }))
                  }
                  placeholder="Novo PIN (opcional)"
                  style={inputStyle}
                />
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() =>
                    setEdicoes((prev) => ({
                      ...prev,
                      [user.id]: { ...edit, ativo: !edit.ativo }
                    }))
                  }
                >
                  {edit.ativo ? "Ativo" : "Inativo"}
                </button>
                <button
                  type="button"
                  style={primaryButtonStyle(processandoUsuario)}
                  onClick={() => handleSalvarUsuario(user.id)}
                  disabled={processandoUsuario}
                >
                  Salvar
                </button>

                <div style={{ gridColumn: "1 / -1", display: "grid", gap: 8 }}>
                  <SwitchRow
                    label="Perfil personalizado (editar permissoes)"
                    checked={Boolean(edit.perfil_personalizado)}
                    onToggle={() =>
                      setEdicoes((prev) => ({
                        ...prev,
                        [user.id]: {
                          ...edit,
                          perfil_personalizado: !Boolean(edit.perfil_personalizado)
                        }
                      }))
                    }
                  />

                  {edit.perfil_personalizado ? (
                    <>
                      <Field label="Nome do perfil personalizado">
                        <input
                          value={edit.perfil_nome || ""}
                          onChange={(e) =>
                            setEdicoes((prev) => ({
                              ...prev,
                              [user.id]: {
                                ...edit,
                                perfil_nome: e.target.value
                              }
                            }))
                          }
                          placeholder="Ex.: Supervisor, Atendimento noturno..."
                          style={inputStyle}
                        />
                      </Field>

                      <div style={permissoesGridStyle}>
                        {(catalogoPermissoes || []).length > 0 ? (
                          (catalogoPermissoes || []).map((item) => {
                            const chave = String(item?.chave || "").trim();
                            if (!chave) return null;
                            return (
                              <label key={chave} style={permissaoItemStyle}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(edit?.permissoes?.[chave])}
                                  onChange={() => togglePermissaoEdicao(user.id, chave)}
                                />
                                <span>{item?.label || chave}</span>
                              </label>
                            );
                          })
                        ) : (
                          <div style={fieldHintStyle}>Catalogo de permissoes indisponivel no momento.</div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={fieldHintStyle}>
                      Usando permissoes padrao do perfil {edit.role === "GERENTE" ? "GERENTE" : "GARCOM"}.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Backup e restauracao</h3>
        <p style={subtleTextStyle}>
          Exporte/importe backup manual e acompanhe os arquivos salvos automaticamente no dispositivo.
        </p>

        {!podeGerirBackup && (
          <div style={erroStyle}>
            Seu perfil nao tem permissao de backup/restauracao. Habilite <code>APP_BACKUP_GERIR</code>.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            style={primaryButtonStyle(processandoBackup || loading)}
            onClick={handleExportarBackup}
            disabled={processandoBackup || loading || !podeGerirBackup}
          >
            {processandoBackup ? "Gerando..." : "Exportar backup"}
          </button>

          <label style={secondaryButtonStyle}>
            Restaurar backup
            <input
              type="file"
              accept="application/json"
              onChange={handleImportarBackup}
              style={{ display: "none" }}
              disabled={processandoBackup || loading || !podeGerirBackup}
            />
          </label>
        </div>

        <div style={backupMetaGridStyle}>
          <div style={backupMetaCardStyle}>
            <div style={labelStyle}>Diretorio local de backups</div>
            <div style={pathValueStyle}>{backupsSistema?.diretorio || "-"}</div>
          </div>
          <div style={backupMetaCardStyle}>
            <div style={labelStyle}>Arquivos locais encontrados</div>
            <strong>{Array.isArray(backupsSistema?.backups) ? backupsSistema.backups.length : 0}</strong>
          </div>
        </div>

        <div style={backupMetaGridStyle}>
          <Field label="Diretorio espelho (opcional)">
            <input
              value={localSistemaConfig.backup_mirror_dir || ""}
              onChange={(e) =>
                setLocalSistemaConfig((prev) => ({ ...prev, backup_mirror_dir: e.target.value }))
              }
              placeholder="Ex.: D:\\Backups\\PDV"
              style={inputStyle}
            />
          </Field>

          <Field label="Retencao de backups (dias)">
            <input
              type="number"
              min="7"
              max="365"
              value={localSistemaConfig.backup_retain_days || 30}
              onChange={(e) =>
                setLocalSistemaConfig((prev) => ({
                  ...prev,
                  backup_retain_days: Number(e.target.value || 30)
                }))
              }
              style={inputStyle}
            />
          </Field>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            style={primaryButtonStyle(processandoSistemaConfig || loading)}
            disabled={processandoSistemaConfig || loading || !podeGerirBackup}
            onClick={() =>
              handleSalvarSistemaConfig({
                backup_mirror_dir: localSistemaConfig.backup_mirror_dir || "",
                backup_retain_days: localSistemaConfig.backup_retain_days || 30
              })
            }
          >
            {processandoSistemaConfig ? "Salvando..." : "Salvar config de backup"}
          </button>

          <div style={subtleTextStyle}>
            Espelho atual: {backupsSistema?.espelho_dir ? backupsSistema.espelho_dir : "Nao configurado"} | Retencao:{" "}
            {backupsSistema?.retencao_dias || 30} dias
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            style={primaryButtonStyle(processandoBackupLocal || loading)}
            onClick={handleGerarBackupLocal}
            disabled={processandoBackupLocal || loading || !podeGerirBackup}
          >
            {processandoBackupLocal ? "Salvando..." : "Gerar arquivo local"}
          </button>

          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => handleBackupAuto(false)}
            disabled={processandoBackupAuto || loading || !podeGerirBackup}
          >
            {processandoBackupAuto ? "Processando..." : "Executar backup auto"}
          </button>

          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => handleBackupAuto(true)}
            disabled={processandoBackupAuto || loading || !podeGerirBackup}
          >
            Forcar backup hoje
          </button>

          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={handleAtualizarBackups}
            disabled={processandoBackupLocal || loading || !podeGerirBackup}
          >
            Atualizar lista
          </button>
        </div>

        <div style={backupListStyle}>
          {(backupsSistema?.backups || []).map((item) => (
            <div key={`${item.arquivo}-${item.atualizado_em}`} style={backupItemStyle}>
              <div style={{ fontWeight: 700, wordBreak: "break-word" }}>{item.arquivo}</div>
              <div style={backupMetaLineStyle}>
                <span>{formatarBytes(item.tamanho_bytes)}</span>
                <span>{formatarDataHora(item.atualizado_em)}</span>
              </div>
              <div style={backupPathLineStyle}>{item.caminho}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => handleAbrirRestoreArquivo(item)}
                  disabled={processandoRestoreArquivo || processandoBackup || loading || !podeGerirBackup}
                >
                  Restaurar este backup
                </button>
              </div>
            </div>
          ))}
          {(backupsSistema?.backups || []).length === 0 && (
            <div style={{ color: "#b8c0db" }}>Nenhum backup local encontrado ainda.</div>
          )}
        </div>
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Suporte e compliance</h3>
        <p style={subtleTextStyle}>
          Dados de contato e exportacao da auditoria para suporte tecnico e prestacao de contas.
        </p>

        <div style={inputGridStyle}>
          <Field label="Nome do suporte">
            <input
              value={SUPORTE_FIXO.nome}
              style={inputStyle}
              readOnly
              disabled
            />
          </Field>

          <Field label="Telefone/WhatsApp">
            <input
              value={SUPORTE_FIXO.telefone}
              style={inputStyle}
              readOnly
              disabled
            />
          </Field>

          <Field label="E-mail de suporte">
            <input
              value={SUPORTE_FIXO.email}
              style={inputStyle}
              readOnly
              disabled
            />
          </Field>

          <Field label="Site/pagina de ajuda">
            <input
              value={SUPORTE_FIXO.site || "Ainda nao temos"}
              style={inputStyle}
              readOnly
              disabled
            />
          </Field>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => handleExportarAuditoria("csv")}
            disabled={exportandoAuditoria || loading}
          >
            {exportandoAuditoria ? "Exportando..." : "Exportar auditoria CSV"}
          </button>

          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => handleExportarAuditoria("json")}
            disabled={exportandoAuditoria || loading}
          >
            Exportar auditoria JSON
          </button>
        </div>
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Atualizacao do aplicativo</h3>
        <p style={subtleTextStyle}>
          Atualiza sem reinstalar quando o pacote publicado tiver versao nova.
        </p>

        {!desktopUpdater && (
          <div style={{ color: "#b8c0db" }}>
            Esse recurso aparece somente no app desktop (Electron).
          </div>
        )}

        {desktopUpdater && (
          <>
            <div style={backupMetaGridStyle}>
              <div style={backupMetaCardStyle}>
                <div style={labelStyle}>Versao atual</div>
                <strong>{updaterInfo.versionAtual || "-"}</strong>
              </div>
              <div style={backupMetaCardStyle}>
                <div style={labelStyle}>Nova versao</div>
                <strong>{updaterInfo.versionNova || "-"}</strong>
              </div>
              <div style={backupMetaCardStyle}>
                <div style={labelStyle}>Release</div>
                <strong>{updaterInfo.releaseName || "-"}</strong>
              </div>
            </div>

            <div style={{ marginTop: 10, color: "#d7def9" }}>{updaterInfo.message || "-"}</div>
            {updaterInfo.feedUrl ? (
              <div style={{ marginTop: 4, color: "#9ea7c8", fontSize: 12, wordBreak: "break-all" }}>
                Fonte de update: {updaterInfo.feedUrl}
              </div>
            ) : null}
            {Number(updaterInfo.progress || 0) > 0 && (
              <div style={progressWrapStyle}>
                <div style={progressFillStyle(Number(updaterInfo.progress || 0))} />
              </div>
            )}

            {updaterReleaseNotes ? (
              <div style={changelogWrapStyle}>
                <div style={labelStyle}>Changelog da nova versao</div>
                <pre style={changelogBoxStyle}>{updaterReleaseNotes}</pre>
              </div>
            ) : null}

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                style={primaryButtonStyle(processandoUpdater)}
                onClick={handleVerificarAtualizacao}
                disabled={processandoUpdater}
              >
                Verificar atualizacao
              </button>
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={handleInstalarAtualizacao}
                disabled={processandoUpdater || updaterInfo.status !== "downloaded"}
              >
                Reiniciar e instalar
              </button>
            </div>
          </>
        )}
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Publicacao limpa</h3>
        <p style={subtleTextStyle}>
          Remove todos os dados locais de teste para deixar o sistema zerado antes de publicar.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            style={dangerButtonStyle(processandoLimpeza || loading)}
            onClick={handleLimparSistemaPublicacao}
            disabled={processandoLimpeza || loading}
          >
            {processandoLimpeza ? "Limpando..." : "Limpar dados de teste"}
          </button>
          <span style={subtleTextStyle}>Login padrao apos limpeza: gerente/1234 e garcom/1111</span>
        </div>
      </section>

      <section style={cardStyle}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Auditoria (ultimas acoes)</h3>
          <button type="button" style={secondaryButtonStyle} onClick={() => carregarAuditoria(200)}>
            Atualizar
          </button>
        </div>

        <input
          value={filtroAuditoria}
          onChange={(e) => setFiltroAuditoria(e.target.value)}
          placeholder="Filtrar por acao, usuario ou rota"
          style={{ ...inputStyle, marginTop: 10 }}
        />

        <div style={auditListStyle}>
          {auditoriaFiltrada.slice(0, 80).map((log) => (
            <div key={log.id} style={auditItemStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>{log.acao}</strong>
                <span>{formatDateTimePtBr(log.created_at)}</span>
              </div>
              <div style={{ color: "#b8c0db", fontSize: 13 }}>
                {log.usuario_nome || "Sistema"} ({log.role || "N/A"}) - {log.rota || "-"} - {log.status_code || "-"}
              </div>
            </div>
          ))}
          {auditoriaFiltrada.length === 0 && <div style={{ color: "#b8c0db" }}>Nenhum registro encontrado.</div>}
        </div>
      </section>

      <div style={actionsStyle}>
        <button type="button" onClick={handleReset} style={secondaryButtonStyle}>
          Restaurar padrao
        </button>
        <span style={subtleTextStyle}>Salvamento automatico no dispositivo</span>
      </div>

      <ConfirmDialog
        open={confirmResetOpen}
        title="Restaurar configuracoes gerais"
        message="Deseja restaurar as configuracoes para o padrao do sistema?"
        confirmLabel="Restaurar"
        cancelLabel="Cancelar"
        variant="danger"
        onCancel={() => setConfirmResetOpen(false)}
        onConfirm={confirmarReset}
      />

      <ConfirmDialog
        open={confirmImportOpen}
        title="Restaurar backup"
        message={`O arquivo "${arquivoBackupPendente?.name || "selecionado"}" vai substituir os dados atuais.`}
        details="Essa acao substitui mesas, contas, financeiro e configuracoes. PIN de seguranca obrigatorio."
        confirmLabel={processandoBackup ? "Restaurando..." : "Restaurar agora"}
        cancelLabel="Cancelar"
        variant="danger"
        processing={processandoBackup}
        confirmDisabled={!pinSegurancaValido}
        onCancel={() => {
          if (processandoBackup) return;
          setConfirmImportOpen(false);
          setArquivoBackupPendente(null);
        }}
        onConfirm={confirmarImportarBackup}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <label style={labelStyle}>PIN de seguranca do usuario logado</label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pinSeguranca}
            onChange={(event) => setPinSeguranca(event.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="4 a 8 numeros"
            style={inputStyle}
            autoFocus
          />
          {!pinSegurancaValido && (
            <div style={fieldErrorStyle}>Digite o PIN (4 a 8 numeros) para habilitar a restauracao.</div>
          )}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmRestoreArquivoOpen}
        title="Restaurar backup da lista"
        message={`O arquivo "${arquivoBackupSelecionado?.arquivo || "-"}" vai substituir os dados atuais.`}
        details="Essa acao substitui mesas, contas, financeiro e configuracoes. PIN de seguranca obrigatorio."
        confirmLabel={processandoRestoreArquivo ? "Restaurando..." : "Restaurar agora"}
        cancelLabel="Cancelar"
        variant="danger"
        processing={processandoRestoreArquivo}
        confirmDisabled={!pinSegurancaValido}
        onCancel={() => {
          if (processandoRestoreArquivo) return;
          setConfirmRestoreArquivoOpen(false);
          setArquivoBackupSelecionado(null);
        }}
        onConfirm={confirmarRestoreArquivo}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <label style={labelStyle}>PIN de seguranca do usuario logado</label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pinSeguranca}
            onChange={(event) => setPinSeguranca(event.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="4 a 8 numeros"
            style={inputStyle}
            autoFocus
          />
          {!pinSegurancaValido && (
            <div style={fieldErrorStyle}>Digite o PIN (4 a 8 numeros) para habilitar a restauracao.</div>
          )}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmLimpezaOpen}
        title="Limpar dados para publicacao"
        message="Essa acao apaga mesas, produtos, historico e financeiro locais."
        details="Para confirmar, digite LIMPAR e mantenha PIN valido."
        confirmLabel={processandoLimpeza ? "Limpando..." : "Limpar dados"}
        cancelLabel="Cancelar"
        variant="danger"
        processing={processandoLimpeza}
        confirmDisabled={codigoLimpeza !== "LIMPAR" || !pinSegurancaValido}
        onCancel={() => {
          if (processandoLimpeza) return;
          setConfirmLimpezaOpen(false);
          setCodigoLimpeza("");
        }}
        onConfirm={confirmarLimpezaSistema}
      >
        <input
          value={codigoLimpeza}
          onChange={(e) => setCodigoLimpeza(e.target.value.toUpperCase())}
          placeholder="Digite LIMPAR"
          style={inputStyle}
          autoFocus
        />
      </ConfirmDialog>
    </div>
  );
}

function Field({ label, children, hint = "", error = "" }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {error ? <div style={fieldErrorStyle}>{error}</div> : null}
      {!error && hint ? <div style={fieldHintStyle}>{hint}</div> : null}
    </div>
  );
}

function SwitchRow({ label, checked, onToggle }) {
  return (
    <button type="button" onClick={onToggle} style={switchRowStyle(checked)}>
      <span style={{ minWidth: 0, flex: 1 }}>{label}</span>
      <strong>{checked ? "ON" : "OFF"}</strong>
    </button>
  );
}

const pageGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: 14
};

const cardDestaqueStyle = {
  border: "1px solid #3f68e7",
  borderRadius: 16,
  background: "linear-gradient(145deg, #1a2445 0%, #121a35 100%)",
  padding: 16,
  boxShadow: "0 12px 28px rgba(12, 28, 74, 0.28)"
};

const checklistStyle = {
  display: "grid",
  gap: 6,
  marginBottom: 12,
  color: "#d7def9"
};

const permissoesGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 8,
  border: "1px solid #30375a",
  borderRadius: 10,
  background: "#10162d",
  padding: 10
};

const permissaoItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  border: "1px solid #313960",
  borderRadius: 8,
  background: "#171f3f",
  color: "#d8e0fc",
  padding: "6px 8px",
  fontSize: 13
};

const cardStyle = {
  border: "1px solid #2d3352",
  borderRadius: 16,
  background: "#161a30",
  padding: 16,
  minWidth: 0,
  overflow: "hidden"
};

const inputGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10
};

const configStackStyle = {
  display: "grid",
  gap: 10
};

const numberGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  alignItems: "start"
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  color: "#aeb6d3",
  fontSize: 13
};

const inputStyle = {
  width: "100%",
  minWidth: 0,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #3a4166",
  background: "#101427",
  color: "#fff",
  boxSizing: "border-box"
};

const fieldErrorStyle = {
  marginTop: 6,
  color: "#ffb7c5",
  fontSize: 12,
  fontWeight: 700
};

const fieldHintStyle = {
  marginTop: 6,
  color: "#93a0c9",
  fontSize: 12
};

const actionsStyle = {
  marginTop: -2,
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap"
};

const subtleTextStyle = {
  color: "#aeb6d3",
  marginTop: 0,
  marginBottom: 10
};

const erroStyle = {
  border: "1px solid #9b3b4d",
  borderRadius: 12,
  background: "#41161c",
  color: "#ffdce4",
  padding: "8px 10px"
};

function licencaStatusBoxStyle(ativa, expiraEmBreve) {
  if (!ativa) {
    return {
      border: "1px solid #9b3b4d",
      borderRadius: 12,
      background: "#3f1820",
      color: "#ffdce4",
      padding: 12,
      display: "grid",
      gap: 6
    };
  }

  if (expiraEmBreve) {
    return {
      border: "1px solid #b4832d",
      borderRadius: 12,
      background: "#3b2a0f",
      color: "#ffe8ad",
      padding: 12,
      display: "grid",
      gap: 6
    };
  }

  return {
    border: "1px solid #2f5f3d",
    borderRadius: 12,
    background: "#123423",
    color: "#cef8df",
    padding: 12,
    display: "grid",
    gap: 6
  };
}

const secondaryButtonStyle = {
  border: "1px solid #3d4770",
  borderRadius: 10,
  padding: "10px 12px",
  fontWeight: 700,
  background: "#1b213c",
  color: "#d7def9",
  cursor: "pointer"
};

function dangerButtonStyle(disabled) {
  return {
    border: "1px solid #7a3b49",
    borderRadius: 10,
    padding: "10px 12px",
    fontWeight: 700,
    background: disabled ? "#5f3942" : "#4c1d27",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer"
  };
}

function switchRowStyle(active) {
  return {
    border: `1px solid ${active ? "#2e63f4" : "#3d4770"}`,
    borderRadius: 10,
    background: active ? "rgba(46, 99, 244, 0.18)" : "#141b35",
    color: "#fff",
    padding: "10px 12px",
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    cursor: "pointer",
    textAlign: "left",
    alignItems: "center",
    flexWrap: "wrap"
  };
}

function primaryButtonStyle(disabled) {
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

const backupMetaGridStyle = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10
};

const backupMetaCardStyle = {
  border: "1px solid #30375a",
  borderRadius: 12,
  background: "#12172d",
  padding: 10,
  minWidth: 0
};

const pathValueStyle = {
  wordBreak: "break-word",
  fontFamily: "Consolas, Menlo, monospace",
  color: "#d7def9"
};

const backupListStyle = {
  marginTop: 12,
  display: "grid",
  gap: 8,
  maxHeight: 280,
  overflow: "auto",
  paddingRight: 4
};

const backupItemStyle = {
  border: "1px solid #30375a",
  borderRadius: 10,
  background: "#12172d",
  padding: 10,
  display: "grid",
  gap: 6
};

const backupMetaLineStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  color: "#aeb6d3",
  fontSize: 13,
  flexWrap: "wrap"
};

const backupPathLineStyle = {
  wordBreak: "break-word",
  fontFamily: "Consolas, Menlo, monospace",
  fontSize: 12,
  color: "#9ea7c8"
};

const progressWrapStyle = {
  marginTop: 8,
  height: 10,
  borderRadius: 999,
  border: "1px solid #35426e",
  background: "#0f152c",
  overflow: "hidden"
};

function progressFillStyle(percent) {
  const valor = Math.max(0, Math.min(100, Number(percent || 0)));
  return {
    width: `${valor}%`,
    height: "100%",
    borderRadius: 999,
    background: "#2e63f4"
  };
}

const changelogWrapStyle = {
  marginTop: 12
};

const changelogBoxStyle = {
  margin: 0,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #2f3a60",
  background: "#0e1430",
  color: "#dfe6ff",
  fontFamily: "Consolas, Menlo, monospace",
  fontSize: 12,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 220,
  overflow: "auto"
};

const pageStyle = {
  display: "grid",
  gap: 16,
  width: "100%",
  minWidth: 0
};

const userRowStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 8,
  border: "1px solid #30375a",
  borderRadius: 12,
  padding: 10,
  background: "#13172b"
};

const auditListStyle = {
  marginTop: 10,
  display: "grid",
  gap: 8,
  maxHeight: 360,
  overflow: "auto",
  paddingRight: 4
};

const auditItemStyle = {
  border: "1px solid #30375a",
  borderRadius: 10,
  background: "#12172d",
  padding: 10,
  display: "grid",
  gap: 4
};
