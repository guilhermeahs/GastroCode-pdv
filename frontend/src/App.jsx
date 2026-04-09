import React, { useEffect, useMemo, useState } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import PainelMesas from "./pages/PainelMesas";
import Entregas from "./pages/Entregas";
import Financeiro from "./pages/Financeiro";
import Relatorios from "./pages/Relatorios";
import Historico from "./pages/Historico";
import Configuracoes from "./pages/Configuracoes";
import Impressao from "./pages/Impressao";
import SelectField from "./components/SelectField";
import { api } from "./services/api";
import { getReleaseName, getReleaseNotesForVersion, getReleaseNotesTimeline } from "./data/releaseNotes";
import { formatDateTimePtBr } from "./utils/datetime";

const CONTATO_RENOVACAO = "5531995172257";
const APP_NOME_PADRAO = "GastroCode Brasil PDV";
const CHANGELOG_SEEN_VERSION_KEY = "gcb_pdv_seen_version";
const CHANGELOG_LAST_VERSION_KEY = "gcb_pdv_last_app_version";

function montarLinkRenovacao(licencaInfo) {
  const diasRestantes = Number(licencaInfo?.licenca?.dias_restantes);
  const linhas = [
    "Ola! Quero renovar minha licenca do PDV.",
    `Dispositivo: ${String(licencaInfo?.codigo_dispositivo || "-")}`,
    `Status: ${String(licencaInfo?.status || "-")}`,
    Number.isFinite(diasRestantes)
      ? `Dias restantes: ${diasRestantes}`
      : "Dias restantes: sem expiracao definida"
  ];

  if (licencaInfo?.licenca?.expira_em) {
    linhas.push(
      `Expira em: ${formatDateTimePtBr(licencaInfo.licenca.expira_em)}`
    );
  }

  const texto = encodeURIComponent(linhas.join("\n"));
  return `https://api.whatsapp.com/send?phone=${CONTATO_RENOVACAO}&text=${texto}`;
}

function NoticeBar({ notice, onClose }) {
  if (!notice) return null;

  const palette = {
    success: { bg: "#0d3a2c", border: "#1f8a63" },
    warning: { bg: "#3b2a0f", border: "#b4832d" },
    error: { bg: "#41161c", border: "#b74b5b" }
  };

  const style = palette[notice.type] || palette.error;

  return (
    <div
      style={{
        position: "fixed",
        top: 14,
        right: 14,
        width: "min(520px, calc(100vw - 28px))",
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 12,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        zIndex: 220
      }}
    >
      <span>{notice.text}</span>
      <button onClick={onClose} style={smallButtonStyle}>
        Fechar
      </button>
    </div>
  );
}

function ApiOfflineBar({ onRetry }) {
  return (
    <div
      style={{
        marginBottom: 14,
        background: "#3f1820",
        border: "1px solid #9b3b4d",
        borderRadius: 12,
        padding: "10px 12px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap"
      }}
    >
      <span>
        API offline. Inicie o backend em `http://localhost:3001` e clique em sincronizar.
      </span>
      <button onClick={onRetry} style={smallButtonStyle}>
        Sincronizar
      </button>
    </div>
  );
}

function ChangelogUpdateModal({ open, releaseName, version, notes, onClose }) {
  if (!open) return null;

  return (
    <div style={changelogOverlayStyle}>
      <div style={changelogCardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 8, fontFamily: "var(--font-heading)" }}>
          App atualizado com sucesso
        </h3>
        <div style={{ color: "#b9c3ea", marginBottom: 8 }}>
          {releaseName || (version ? `v${version}` : "Nova versao")}
        </div>
        <pre style={changelogPreStyle}>{notes || "Atualizacao instalada com sucesso."}</pre>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" onClick={onClose} style={smallButtonStyle}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div style={brandMarkWrapStyle} aria-hidden>
      <svg viewBox="0 0 96 96" style={{ width: 36, height: 36 }}>
        <defs>
          <linearGradient id="brandCoin" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffd86b" />
            <stop offset="100%" stopColor="#f4a938" />
          </linearGradient>
          <linearGradient id="brandTop" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5be3b0" />
            <stop offset="100%" stopColor="#2e63f4" />
          </linearGradient>
        </defs>
        <circle cx="48" cy="48" r="44" fill="url(#brandCoin)" opacity="0.16" />
        <circle cx="48" cy="48" r="35" fill="#121a34" stroke="#f4c35b" strokeWidth="4" />
        <path d="M26 53h44v16H26z" fill="url(#brandTop)" rx="4" />
        <path d="M30 50l8-10 10 8 18-18" fill="none" stroke="#f4c35b" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function DesktopTopbar({
  titulo,
  maximizada,
  onMinimizar,
  onAlternarMaximizacao,
  onFechar
}) {
  return (
    <div style={desktopTopbarWrapStyle}>
      <div style={desktopTopbarDragAreaStyle}>
        <div style={desktopTopbarBrandDotStyle} />
        <span style={desktopTopbarTitleStyle}>{titulo || APP_NOME_PADRAO}</span>
      </div>
      <div style={desktopTopbarControlsStyle}>
        <button
          type="button"
          aria-label="Minimizar janela"
          onClick={onMinimizar}
          style={desktopTopbarControlButtonStyle}
        >
          <WindowControlIcon type="minimize" />
        </button>
        <button
          type="button"
          aria-label={maximizada ? "Restaurar janela" : "Maximizar janela"}
          onClick={onAlternarMaximizacao}
          style={desktopTopbarControlButtonStyle}
        >
          <WindowControlIcon type={maximizada ? "restore" : "maximize"} />
        </button>
        <button
          type="button"
          aria-label="Fechar janela"
          onClick={onFechar}
          style={desktopTopbarCloseButtonStyle}
        >
          <WindowControlIcon type="close" />
        </button>
      </div>
    </div>
  );
}

function WindowControlIcon({ type }) {
  if (type === "minimize") {
    return (
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
        <path d="M2 9h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "restore") {
    return (
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
        <rect x="2.6" y="3.6" width="6.2" height="5.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4 2.6h5.4V8" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }

  if (type === "close") {
    return (
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
        <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
      <rect x="2.4" y="2.4" width="7.2" height="7.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function LicencaPanel() {
  const { ativarLicenca, verificarLicencaStatus, licencaInfo, licencaProcessando } = useApp();
  const [chave, setChave] = useState("");
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const renovacaoWhatsappHref = useMemo(() => montarLinkRenovacao(licencaInfo), [licencaInfo]);

  async function handleAtivar(e) {
    e.preventDefault();
    setErro("");

    const resultado = await ativarLicenca(chave);
    if (!resultado || !resultado.ativa) {
      setErro(resultado?.mensagem || "Nao foi possivel ativar a licenca.");
    }
  }

  async function handleRevalidar() {
    setErro("");
    await verificarLicencaStatus();
  }

  async function handleCopiarCodigo() {
    const codigo = String(licencaInfo?.codigo_dispositivo || "").trim();
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {}
  }

  return (
    <div style={loginPageStyle}>
      <div style={loginCardStyle}>
        <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)" }}>Ativacao de Licenca</h2>
        <p style={{ color: "#b8bdd4", marginTop: -4 }}>
          Envie o codigo deste dispositivo para emissao da licenca e cole o token assinado.
        </p>

        <div style={{ ...statusBoxStyle, borderColor: "#385072", background: "#121e36", marginBottom: 10 }}>
          <div style={{ color: "#9ec7ff", fontSize: 12, marginBottom: 4 }}>Codigo do dispositivo</div>
          <strong style={{ fontFamily: "Consolas, Menlo, monospace", fontSize: 15 }}>
            {licencaInfo?.codigo_dispositivo || "Carregando..."}
          </strong>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={smallButtonStyle} onClick={handleCopiarCodigo}>
              {copiado ? "Copiado" : "Copiar codigo"}
            </button>
            <button type="button" style={smallButtonStyle} onClick={handleRevalidar}>
              Revalidar status
            </button>
          </div>
        </div>

        <div style={{ ...statusBoxStyle, borderColor: "#3a4670", background: "#151a31" }}>
          <strong>Status: {licencaInfo?.status || "-"}</strong>
          <div style={{ color: "#b8bdd4", marginTop: 4 }}>
            {licencaInfo?.mensagem || "Aguardando validacao de licenca."}
          </div>
          <div style={{ color: "#b8bdd4", marginTop: 4 }}>
            Plano: {licencaInfo?.licenca?.plano || "-"}
          </div>
          <div style={{ color: "#b8bdd4", marginTop: 4 }}>
            Offline tolerado: {Number(licencaInfo?.licenca?.offline_tolerancia_dias || 0) || "-"} dia(s)
          </div>
          {licencaInfo?.chave_publica_fingerprint ? (
            <div style={{ marginTop: 6, color: "#9ec7ff", fontSize: 12 }}>
              Chave publica (fingerprint):{" "}
              <strong style={{ fontFamily: "Consolas, Menlo, monospace" }}>
                {licencaInfo.chave_publica_fingerprint}
              </strong>
            </div>
          ) : null}
          {licencaInfo?.licenca?.chave_mascara ? (
            <div style={{ marginTop: 6, color: "#8fd8ba" }}>
              Chave atual: <strong>{licencaInfo.licenca.chave_mascara}</strong>
            </div>
          ) : null}
        </div>

        <div style={licencaContatoStyle}>
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

        <form onSubmit={handleAtivar} style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <div>
            <label style={loginLabelStyle}>Token de licenca</label>
            <input
              value={chave}
              onChange={(e) => setChave(e.target.value)}
              placeholder="Cole aqui: HB1.payload.assinatura"
              style={loginInputStyle}
              autoComplete="off"
            />
          </div>

          {erro ? (
            <div style={{ ...statusBoxStyle, borderColor: "#9b3b4d", background: "#41161c", color: "#ffe3e8" }}>
              {erro}
            </div>
          ) : null}

          <button type="submit" style={loginButtonStyle(licencaProcessando)} disabled={licencaProcessando}>
            {licencaProcessando ? "Ativando..." : "Ativar licenca"}
          </button>
        </form>
      </div>
    </div>
  );
}

function LoginPanel() {
  const { loginComPin, loading } = useApp();
  const [usuarios, setUsuarios] = useState([]);
  const [usuarioId, setUsuarioId] = useState("");
  const [apelido, setApelido] = useState("");
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;

    api
      .authUsuariosLogin()
      .then((data) => {
        if (!ativo) return;
        const lista = Array.isArray(data?.usuarios) ? data.usuarios : [];
        setUsuarios(lista);
        if (lista.length > 0) {
          setUsuarioId(String(lista[0].id));
        }
      })
      .catch(() => {
        if (!ativo) return;
        setUsuarios([]);
      });

    return () => {
      ativo = false;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");

    if (!pin.trim()) {
      setErro("Informe o PIN.");
      return;
    }

    const payload = usuarioId
      ? { usuario_id: Number(usuarioId), pin: pin.trim() }
      : { apelido: apelido.trim(), pin: pin.trim() };

    const resultado = await loginComPin(payload);
    if (!resultado) {
      setErro("Falha no login. Confira usuario e PIN.");
      return;
    }

    setPin("");
  }

  const usuarioOptions = usuarios.map((item) => ({
    value: String(item.id),
    label: `${item.nome} (${item.role})`
  }));

  return (
    <div style={loginPageStyle}>
      <div style={loginShellStyle}>
        <section style={loginShowcaseStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <BrandMark />
            <div>
              <div style={loginShowcaseBadgeStyle}>GastroCode Brasil PDV</div>
              <h1 style={loginShowcaseTitleStyle}>Operacao de restaurante sem atrasos no caixa</h1>
            </div>
          </div>

          <p style={loginShowcaseTextStyle}>
            Controle mesas, fechamento, impressao, historico e integracoes em uma unica tela.
            Feito para atendimento rapido no salao e delivery.
          </p>

          <div style={loginFeatureGridStyle}>
            <div style={loginFeatureCardStyle}>
              <strong>Mesas e comandas</strong>
              <small style={loginFeatureSmallStyle}>Abertura, fechamento e reabertura com rastreio.</small>
            </div>
            <div style={loginFeatureCardStyle}>
              <strong>Financeiro vivo</strong>
              <small style={loginFeatureSmallStyle}>Resumo de caixa e relatorios por periodo.</small>
            </div>
            <div style={loginFeatureCardStyle}>
              <strong>Impressao termica</strong>
              <small style={loginFeatureSmallStyle}>Pre-conta, comprovante e fechamento de caixa.</small>
            </div>
            <div style={loginFeatureCardStyle}>
              <strong>Entrega online</strong>
              <small style={loginFeatureSmallStyle}>Pedidos pendentes e despacho para motoboy.</small>
            </div>
          </div>
        </section>

        <div style={loginCardStyle}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)" }}>Acesso do Sistema</h2>
          <p style={{ color: "#b8bdd4", marginTop: -4 }}>Entre com usuario e PIN para continuar.</p>

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
            {usuarioOptions.length > 0 ? (
              <div>
                <label style={loginLabelStyle}>Usuario</label>
                <SelectField
                  value={usuarioId}
                  onChange={setUsuarioId}
                  options={usuarioOptions}
                  buttonStyle={selectLikeInputStyle}
                />
              </div>
            ) : (
              <div>
                <label style={loginLabelStyle}>Apelido do usuario</label>
                <input
                  value={apelido}
                  onChange={(e) => setApelido(e.target.value)}
                  placeholder="Ex.: gerente"
                  style={loginInputStyle}
                  autoComplete="username"
                />
              </div>
            )}

            <div>
              <label style={loginLabelStyle}>PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="4 a 8 numeros"
                style={loginInputStyle}
                autoComplete="current-password"
              />
            </div>

            {erro && (
              <div style={{ border: "1px solid #9b3b4d", background: "#41161c", borderRadius: 10, padding: 10 }}>
                {erro}
              </div>
            )}

            <button type="submit" style={loginButtonStyle(loading)} disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <div style={{ marginTop: 12, color: "#aeb6d3", fontSize: 13 }}>
            Dica inicial: `gerente/1234`, `garcom/1111`.
          </div>
        </div>
      </div>
    </div>
  );
}

function Layout() {
  const [pagina, setPagina] = useState("mesas");
  const [showLoadingHint, setShowLoadingHint] = useState(false);
  const [janelaMaximizada, setJanelaMaximizada] = useState(false);
  const [changelogModal, setChangelogModal] = useState({
    open: false,
    version: "",
    releaseName: "",
    notes: ""
  });
  const {
    authReady,
    authUser,
    licencaInfo,
    role,
    hasPermission,
    logoutSessao,
    loading,
    mesas,
    notice,
    clearNotice,
    apiOnline,
    sincronizarAgora,
    configuracoes
  } = useApp();
  const isDesktop =
    typeof window !== "undefined" && Boolean(window?.desktopRuntime?.isDesktop);
  const desktopWindowControls =
    typeof window !== "undefined" ? window?.desktopRuntime?.windowControls || null : null;
  const desktopUpdater = typeof window !== "undefined" ? window?.desktopRuntime?.updater || null : null;
  const topbarCustomDesktop =
    isDesktop &&
    desktopWindowControls &&
    typeof desktopWindowControls.minimize === "function" &&
    typeof desktopWindowControls.toggleMaximize === "function" &&
    typeof desktopWindowControls.close === "function";
  const nomeLoja = String(configuracoes?.estabelecimento_nome || "").trim();
  const tituloTopo = nomeLoja || APP_NOME_PADRAO;
  const podeVerMesas = hasPermission("APP_MESAS_VER");
  const podeVerEntregas = hasPermission("APP_ENTREGAS_VER");
  const podeVerHistorico = hasPermission("APP_HISTORICO_VER");
  const podeVerImpressao = hasPermission("APP_IMPRESSAO");
  const podeVerConfiguracoes = hasPermission("APP_CONFIG_VER");
  const podeVerRelatorios = hasPermission("APP_FINANCEIRO_RELATORIOS");
  const podeVerFinanceiro = [
    "APP_FINANCEIRO_VER",
    "APP_CAIXA_GERIR",
    "APP_PRODUTOS_VER",
    "APP_PRODUTOS_CADASTRAR",
    "APP_PRODUTOS_EDITAR",
    "APP_PRODUTOS_ESTOQUE",
    "APP_PRODUTOS_IMPORTAR",
    "APP_PRODUTOS_EXCLUIR"
  ].some((chave) => hasPermission(chave));

  useEffect(() => {
    document.title = nomeLoja ? `${nomeLoja} | PDV` : APP_NOME_PADRAO;
  }, [nomeLoja]);

  useEffect(() => {
    const permitidas = [];
    if (podeVerMesas) permitidas.push("mesas");
    if (podeVerEntregas) permitidas.push("entregas");
    if (podeVerFinanceiro) permitidas.push("financeiro");
    if (podeVerRelatorios) permitidas.push("relatorios");
    if (podeVerHistorico) permitidas.push("historico");
    if (podeVerImpressao) permitidas.push("impressao");
    if (podeVerConfiguracoes) permitidas.push("configuracoes");

    if (permitidas.length === 0) return;
    if (!permitidas.includes(pagina)) {
      setPagina(permitidas[0]);
    }
  }, [
    pagina,
    podeVerMesas,
    podeVerEntregas,
    podeVerFinanceiro,
    podeVerRelatorios,
    podeVerHistorico,
    podeVerImpressao,
    podeVerConfiguracoes
  ]);

  useEffect(() => {
    if (!topbarCustomDesktop) return undefined;
    let ativo = true;

    async function sincronizarEstadoJanela() {
      try {
        const maximizada = await desktopWindowControls.isMaximized();
        if (ativo) {
          setJanelaMaximizada(Boolean(maximizada));
        }
      } catch {}
    }

    sincronizarEstadoJanela();
    const unsubscribe =
      typeof desktopWindowControls.onMaximizeChanged === "function"
        ? desktopWindowControls.onMaximizeChanged((maximizada) => {
            setJanelaMaximizada(Boolean(maximizada));
          })
        : null;

    return () => {
      ativo = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [topbarCustomDesktop, desktopWindowControls]);

  useEffect(() => {
    if (!isDesktop || !authUser || typeof localStorage === "undefined") return undefined;
    if (!desktopUpdater || typeof desktopUpdater.getState !== "function") return undefined;

    let ativo = true;
    async function verificarChangelogPosAtualizacao() {
      try {
        const updaterState = await desktopUpdater.getState();
        if (!ativo) return;

        const versaoAtual = String(updaterState?.versionAtual || "")
          .trim()
          .replace(/^v/i, "");
        if (!versaoAtual) return;

        const versaoAnterior = String(localStorage.getItem(CHANGELOG_LAST_VERSION_KEY) || "")
          .trim()
          .replace(/^v/i, "");
        const versaoVista = String(localStorage.getItem(CHANGELOG_SEEN_VERSION_KEY) || "")
          .trim()
          .replace(/^v/i, "");

        const versaoBaseAnterior = versaoAnterior || versaoVista || "";

        if (!versaoBaseAnterior) {
          localStorage.setItem(CHANGELOG_LAST_VERSION_KEY, versaoAtual);
          localStorage.setItem(CHANGELOG_SEEN_VERSION_KEY, versaoAtual);
          return;
        }

        const mudouVersao = versaoBaseAnterior !== versaoAtual;
        const precisaMostrar = mudouVersao || versaoVista !== versaoAtual;

        localStorage.setItem(CHANGELOG_LAST_VERSION_KEY, versaoAtual);
        if (!precisaMostrar) return;

        const notesTimeline = getReleaseNotesTimeline(versaoAtual);
        const notesAtual =
          String(updaterState?.releaseNotes || "").trim() || getReleaseNotesForVersion(versaoAtual);
        const notes =
          notesTimeline ||
          notesAtual ||
          "- Melhorias e correcoes gerais desta versao.";
        const releaseName =
          String(updaterState?.releaseName || "").trim() || getReleaseName(versaoAtual) || `v${versaoAtual}`;

        setChangelogModal({
          open: true,
          version: versaoAtual,
          releaseName,
          notes
        });
      } catch {}
    }

    verificarChangelogPosAtualizacao();
    return () => {
      ativo = false;
    };
  }, [isDesktop, authUser, desktopUpdater]);

  function fecharChangelogModal() {
    if (typeof localStorage !== "undefined" && changelogModal.version) {
      localStorage.setItem(CHANGELOG_LAST_VERSION_KEY, changelogModal.version);
      localStorage.setItem(CHANGELOG_SEEN_VERSION_KEY, changelogModal.version);
    }
    setChangelogModal((prev) => ({ ...prev, open: false }));
  }

  async function minimizarJanelaDesktop() {
    if (!topbarCustomDesktop) return;
    try {
      await desktopWindowControls.minimize();
    } catch {}
  }

  async function alternarMaximizacaoJanelaDesktop() {
    if (!topbarCustomDesktop) return;
    try {
      const maximizada = await desktopWindowControls.toggleMaximize();
      setJanelaMaximizada(Boolean(maximizada));
    } catch {}
  }

  async function fecharJanelaDesktop() {
    if (!topbarCustomDesktop) return;
    try {
      await desktopWindowControls.close();
    } catch {}
  }

  useEffect(() => {
    if (!loading) {
      setShowLoadingHint(false);
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setShowLoadingHint(true);
    }, 450);

    return () => clearTimeout(timeoutId);
  }, [loading]);

  const resumo = useMemo(() => {
    const total = mesas.length;
    const livres = mesas.filter((m) => m.status === "LIVRE").length;
    const ocupadas = mesas.filter((m) => m.status === "OCUPADA").length;
    const fechando = mesas.filter((m) => m.status === "FECHANDO").length;
    return { total, livres, ocupadas, fechando };
  }, [mesas]);

  const licencaDiasRestantes = Number(licencaInfo?.licenca?.dias_restantes);
  const licencaAtiva = Boolean(licencaInfo?.ativa);
  const licencaExpiraEmBreve =
    licencaAtiva &&
    Number.isFinite(licencaDiasRestantes) &&
    licencaDiasRestantes >= 0 &&
    licencaDiasRestantes <= 15;
  const mostrarFaixaLicenca = licencaExpiraEmBreve;
  const renovacaoWhatsappHref = useMemo(() => montarLinkRenovacao(licencaInfo), [licencaInfo]);

  if (!authReady || licencaInfo?.loading) {
    return (
      <div style={loginPageStyle}>
        <div style={loginCardStyle}>Carregando sessao e licenca...</div>
      </div>
    );
  }

  if (!licencaInfo?.ativa) {
    return <LicencaPanel />;
  }

  if (!authUser) {
    return <LoginPanel />;
  }

  return (
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
        maxWidth: "100vw",
        boxSizing: "border-box",
        background: "radial-gradient(circle at top, #1b1c2a 0%, #0b0b0b 55%)",
        color: "#fff",
        padding: topbarCustomDesktop
          ? `14px clamp(12px, 2vw, 20px) 20px`
          : `20px clamp(12px, 2vw, 20px) 20px`,
        fontFamily: "var(--font-body)",
        colorScheme: "dark"
        }}
      >
      {topbarCustomDesktop ? (
        <div style={{ position: "sticky", top: 10, zIndex: 148, marginBottom: 8 }}>
          <DesktopTopbar
            titulo={tituloTopo}
            maximizada={janelaMaximizada}
            onMinimizar={minimizarJanelaDesktop}
            onAlternarMaximizacao={alternarMaximizacaoJanelaDesktop}
            onFechar={fecharJanelaDesktop}
          />
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: 8,
          marginBottom: 12
        }}
      >
        <header
          style={{
            display: "grid",
            gap: 10,
            marginBottom: 2,
            padding: "12px clamp(12px, 1.6vw, 18px)",
            borderRadius: 16,
            border: "1px solid #324171",
            background:
              "linear-gradient(118deg, #182245 0%, #0f162e 56%, #0b1022 100%)",
            boxShadow: "0 14px 30px rgba(0, 0, 0, 0.34)"
          }}
        >
          <div style={brandHeaderStyle}>
            <div style={brandIdentityStyle}>
              <BrandMark />
              <div style={{ minWidth: 0 }}>
                <h1 style={topTitleStyle}>{tituloTopo}</h1>
                <small style={topSubtitleStyle}>
                  Operacao de salao, historico de contas e resumo financeiro
                </small>
              </div>
            </div>
            <small style={topHeaderHintStyle}>
              {showLoadingHint ? "Sincronizando dados..." : "Pronto para operacao"}
            </small>
          </div>
        </header>
      </div>

      <nav
        style={{
          ...topNavShellStyle,
          position: "sticky",
          top: topbarCustomDesktop ? 56 : 10,
          zIndex: 147,
          marginBottom: 12
        }}
      >
        <div style={userBadgeStyle}>
          {authUser.nome} ({role})
        </div>

        <div style={topNavActionsStyle}>
          {podeVerMesas && (
            <button onClick={() => setPagina("mesas")} style={navButton(pagina === "mesas")}>
              Mesas
            </button>
          )}

          {podeVerEntregas && (
            <button onClick={() => setPagina("entregas")} style={navButton(pagina === "entregas")}>
              Online
            </button>
          )}

          {podeVerFinanceiro && (
            <button onClick={() => setPagina("financeiro")} style={navButton(pagina === "financeiro")}>
              Financeiro
            </button>
          )}

          {podeVerRelatorios && (
            <button onClick={() => setPagina("relatorios")} style={navButton(pagina === "relatorios")}>
              Relatorios
            </button>
          )}

          {podeVerHistorico && (
            <button onClick={() => setPagina("historico")} style={navButton(pagina === "historico")}>
              Historico
            </button>
          )}

          {podeVerImpressao && (
            <button onClick={() => setPagina("impressao")} style={navButton(pagina === "impressao")}>
              Impressao
            </button>
          )}

          {podeVerConfiguracoes && (
            <button onClick={() => setPagina("configuracoes")} style={navButton(pagina === "configuracoes")}>
              Configuracoes
            </button>
          )}
        </div>

        <button onClick={logoutSessao} style={logoutButtonStyle}>
          Sair
        </button>
      </nav>

      {!apiOnline && <ApiOfflineBar onRetry={sincronizarAgora} />}
      {mostrarFaixaLicenca && (
        <div
          style={{
            ...licencaAvisoStyle,
            ...(licencaExpiraEmBreve
              ? {}
              : {
                  border: "1px solid #2f5f3d",
                  background:
                    "linear-gradient(120deg, rgba(19, 52, 35, 0.9) 0%, rgba(14, 42, 28, 0.92) 100%)",
                  color: "#cef8df"
                })
          }}
        >
          <strong>
            {Number.isFinite(licencaDiasRestantes)
              ? `Licenca expira em ${licencaDiasRestantes} dia(s).`
              : "Licenca ativa."}
          </strong>
          <span>
            Entre em contato para renovacao:{" "}
            <a
              href={renovacaoWhatsappHref}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#9bc6ff", fontWeight: 800 }}
            >
              +55 31 99517-2257
            </a>
          </span>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 10,
          marginBottom: 14
        }}
      >
        <StatCard label="Mesas" value={resumo.total} />
        <StatCard label="Livres" value={resumo.livres} />
        <StatCard label="Ocupadas" value={resumo.ocupadas} />
        <StatCard label="Fechando" value={resumo.fechando} />
      </div>

      <NoticeBar notice={notice} onClose={clearNotice} />
      {showLoadingHint && <LoadingPill />}

      {pagina === "mesas" && podeVerMesas && <PainelMesas />}
      {pagina === "entregas" && podeVerEntregas && <Entregas />}
      {pagina === "financeiro" && podeVerFinanceiro && <Financeiro />}
      {pagina === "relatorios" && podeVerRelatorios && <Relatorios />}
      {pagina === "historico" && podeVerHistorico && <Historico />}
      {pagina === "configuracoes" && podeVerConfiguracoes && <Configuracoes />}
      {pagina === "impressao" && podeVerImpressao && <Impressao />}
      <ChangelogUpdateModal
        open={changelogModal.open}
        version={changelogModal.version}
        releaseName={changelogModal.releaseName}
        notes={changelogModal.notes}
        onClose={fecharChangelogModal}
      />
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid #2f3553",
        background: "rgba(17, 20, 33, 0.8)",
        padding: "10px 12px"
      }}
    >
      <div style={{ fontSize: 12, color: "#afb5d2" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function LoadingPill() {
  return <div style={loadingPillStyle}>Atualizando dados...</div>;
}

function navButton(active) {
  return {
    minHeight: 38,
    padding: "7px 12px",
    borderRadius: 11,
    border: active ? "1px solid #74a8ff" : "1px solid #3d4c82",
    background: active
      ? "linear-gradient(120deg, #2f6fff 0%, #4d86ff 100%)"
      : "linear-gradient(120deg, #182246 0%, #101938 100%)",
    color: "#f7f9ff",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: "0.1px",
    boxShadow: active ? "0 8px 16px rgba(49, 112, 255, 0.34)" : "0 2px 8px rgba(0, 0, 0, 0.18)"
  };
}

const desktopTopbarWrapStyle = {
  height: 38,
  position: "relative",
  zIndex: 1,
  display: "flex",
  alignItems: "stretch",
  justifyContent: "space-between",
  gap: 4,
  border: "1px solid #2f3f72",
  borderRadius: 10,
  background: "linear-gradient(120deg, rgba(16, 24, 50, 0.96) 0%, rgba(11, 17, 36, 0.96) 100%)",
  boxShadow: "0 6px 14px rgba(0, 0, 0, 0.28)",
  marginBottom: 0
};

const desktopTopbarDragAreaStyle = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 12px",
  WebkitAppRegion: "drag",
  userSelect: "none"
};

const desktopTopbarBrandDotStyle = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: "linear-gradient(120deg, #5be3b0 0%, #2e63f4 100%)",
  boxShadow: "0 0 10px rgba(72, 138, 255, 0.55)"
};

const desktopTopbarTitleStyle = {
  fontSize: 12,
  color: "#cfd9fa",
  fontWeight: 700,
  letterSpacing: "0.15px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis"
};

const desktopTopbarControlsStyle = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 4px 4px 0",
  WebkitAppRegion: "no-drag"
};

const desktopTopbarControlButtonStyle = {
  minWidth: 30,
  width: 30,
  height: 28,
  borderRadius: 8,
  border: "1px solid #3a4f8b",
  background: "linear-gradient(140deg, #1d2c5e 0%, #17234a 100%)",
  color: "#e3ecff",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  boxShadow: "0 3px 8px rgba(0, 0, 0, 0.2)"
};

const desktopTopbarCloseButtonStyle = {
  ...desktopTopbarControlButtonStyle,
  border: "1px solid #a24a63",
  background: "linear-gradient(140deg, #6a2a3d 0%, #542030 100%)",
  color: "#ffeaf0"
};

const brandHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minWidth: 0,
  flexWrap: "wrap"
};

const brandIdentityStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minWidth: 0
};

const topTitleStyle = {
  margin: 0,
  fontFamily: "var(--font-heading)",
  fontSize: "clamp(34px, 3.2vw, 52px)",
  lineHeight: 1.04,
  letterSpacing: "-0.35px"
};

const topSubtitleStyle = {
  color: "#b6c1e6",
  marginTop: 2,
  display: "inline-block"
};

const topHeaderHintStyle = {
  color: "#93a5db",
  fontSize: 12,
  fontWeight: 700,
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid #364982",
  background: "rgba(18, 28, 61, 0.75)"
};

const brandMarkWrapStyle = {
  width: 46,
  height: 46,
  borderRadius: 14,
  border: "1px solid #3f4f85",
  background: "linear-gradient(145deg, #1a2a57 0%, #121f42 100%)",
  display: "grid",
  placeItems: "center",
  boxShadow: "0 6px 18px rgba(0, 0, 0, 0.35)"
};

const topNavShellStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  minWidth: 0,
  border: "1px solid #34457b",
  borderRadius: 14,
  background: "linear-gradient(120deg, #111935 0%, #0b1125 100%)",
  padding: "8px 9px",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.05)"
};

const topNavActionsStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  flex: "1 1 320px",
  minWidth: 0
};

const selectLikeInputStyle = {
  minHeight: 42,
  border: "1px solid #333a59",
  background: "#15172a",
  borderRadius: 10
};

const loginPageStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "20px clamp(14px, 2vw, 26px)",
  background: "radial-gradient(circle at top, #1b1c2a 0%, #0b0b0b 55%)",
  color: "#fff",
  fontFamily: "var(--font-body)"
};

const loginShellStyle = {
  width: "min(1120px, 100%)",
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  alignItems: "stretch"
};

const loginShowcaseStyle = {
  border: "1px solid #2f3f74",
  borderRadius: 18,
  background:
    "linear-gradient(130deg, rgba(18, 31, 69, 0.95) 0%, rgba(14, 22, 47, 0.93) 52%, rgba(10, 15, 35, 0.95) 100%)",
  boxShadow: "0 16px 34px rgba(0, 0, 0, 0.33)",
  padding: "22px clamp(14px, 2vw, 24px)",
  display: "grid",
  gap: 14
};

const loginShowcaseBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 11px",
  borderRadius: 999,
  border: "1px solid #4d6fcb",
  background: "rgba(31, 65, 153, 0.34)",
  fontSize: 12,
  fontWeight: 800,
  color: "#d7e5ff"
};

const loginShowcaseTitleStyle = {
  margin: "7px 0 0",
  fontFamily: "var(--font-heading)",
  fontSize: "clamp(26px, 3vw, 38px)",
  lineHeight: 1.08
};

const loginShowcaseTextStyle = {
  margin: 0,
  color: "#b5c3ea",
  lineHeight: 1.5,
  maxWidth: 640
};

const loginFeatureGridStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(2, minmax(180px, 1fr))"
};

const loginFeatureCardStyle = {
  border: "1px solid #334a87",
  borderRadius: 12,
  background: "linear-gradient(125deg, rgba(19, 35, 79, 0.78) 0%, rgba(15, 24, 53, 0.82) 100%)",
  padding: "10px 11px",
  display: "grid",
  gap: 4
};

const loginFeatureSmallStyle = {
  color: "#a7b5de",
  lineHeight: 1.35
};

const loginCardStyle = {
  width: "100%",
  border: "1px solid #324171",
  borderRadius: 18,
  background:
    "linear-gradient(130deg, rgba(18, 28, 62, 0.95) 0%, rgba(15, 22, 46, 0.93) 62%, rgba(12, 18, 39, 0.95) 100%)",
  boxShadow: "0 14px 30px rgba(0, 0, 0, 0.34)",
  padding: "18px clamp(14px, 1.7vw, 20px)"
};

const loginLabelStyle = {
  display: "block",
  marginBottom: 6,
  color: "#b8bdd4",
  fontSize: 13
};

const loginInputStyle = {
  width: "100%",
  minHeight: 42,
  border: "1px solid #333a59",
  borderRadius: 10,
  background: "#15172a",
  color: "#fff",
  padding: "0 12px",
  boxSizing: "border-box"
};

function loginButtonStyle(disabled) {
  return {
    minHeight: 42,
    border: "none",
    borderRadius: 10,
    background: disabled ? "#556287" : "#2e63f4",
    color: "#fff",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer"
  };
}

const userBadgeStyle = {
  border: "1px solid #44558f",
  borderRadius: 12,
  background: "linear-gradient(120deg, #1a244a 0%, #131d3d 100%)",
  padding: "7px 10px",
  fontSize: 13,
  color: "#e0e8ff",
  whiteSpace: "nowrap",
  maxWidth: 240,
  overflow: "hidden",
  textOverflow: "ellipsis",
  fontWeight: 700
};

const logoutButtonStyle = {
  minHeight: 38,
  padding: "7px 13px",
  borderRadius: 11,
  border: "1px solid #a14a62",
  background: "linear-gradient(120deg, #68273b 0%, #863249 100%)",
  color: "#ffe9ee",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 14,
  whiteSpace: "nowrap",
  boxShadow: "0 6px 14px rgba(122, 47, 68, 0.35)"
};

const statusBoxStyle = {
  border: "1px solid #3a4670",
  borderRadius: 10,
  background: "#151a31",
  padding: "10px 12px"
};

const smallButtonStyle = {
  border: "1px solid #555",
  background: "transparent",
  color: "#fff",
  borderRadius: 8,
  padding: "4px 8px",
  cursor: "pointer"
};

const changelogOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(8, 12, 24, 0.68)",
  display: "grid",
  placeItems: "center",
  zIndex: 120,
  padding: 14
};

const changelogCardStyle = {
  width: "min(760px, 100%)",
  borderRadius: 14,
  border: "1px solid #3d4b7a",
  background: "linear-gradient(145deg, #131c3a 0%, #0f1730 100%)",
  boxShadow: "0 18px 34px rgba(0, 0, 0, 0.44)",
  padding: 16
};

const changelogPreStyle = {
  margin: 0,
  maxHeight: "56vh",
  overflow: "auto",
  whiteSpace: "pre-wrap",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  lineHeight: 1.5,
  color: "#e7ecff",
  background: "rgba(8, 12, 24, 0.34)",
  border: "1px solid #2d375f",
  borderRadius: 10,
  padding: 12
};

const loadingPillStyle = {
  position: "fixed",
  left: "50%",
  bottom: 16,
  transform: "translateX(-50%)",
  background: "rgba(247, 199, 107, 0.14)",
  color: "#f7c76b",
  border: "1px solid rgba(247, 199, 107, 0.55)",
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 700,
  zIndex: 70
};

const licencaContatoStyle = {
  marginTop: 10,
  border: "1px solid #3a4670",
  borderRadius: 10,
  background: "#12182e",
  padding: "9px 10px",
  color: "#d5defe",
  fontSize: 13
};

const licencaAvisoStyle = {
  marginBottom: 14,
  border: "1px solid #5f4e24",
  borderRadius: 12,
  background: "linear-gradient(120deg, rgba(64, 49, 14, 0.92) 0%, rgba(50, 39, 12, 0.94) 100%)",
  color: "#ffe8ad",
  padding: "10px 12px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap"
};

export default function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
