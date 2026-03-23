import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import { formatDateTimePtBr } from "../utils/datetime";
import ConfirmDialog from "../components/ConfirmDialog";
import SelectField from "../components/SelectField";

function agoraDataIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function agoraHora() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function inteiro(valor) {
  return Number(valor || 0).toLocaleString("pt-BR");
}

function classificarOrigem(numero) {
  const n = String(numero || "").trim();
  if (/^\d{3}$/.test(n)) return "ANOTA_AI";
  if (/^\d{4}$/.test(n)) return "IFOOD";
  if (/^\d{6}$/.test(n)) return "NINENINE";
  return "DESCONHECIDO";
}

function nomeOrigem(origem) {
  const key = String(origem || "").toUpperCase();
  if (key === "ANOTA_AI") return "Anota Ai";
  if (key === "IFOOD") return "iFood";
  if (key === "NINENINE") return "99";
  return "Manual";
}

function nomePagamentoEntrega(payment) {
  const key = String(payment || "").toUpperCase();
  if (key === "PIX") return "Pix";
  if (key === "DINHEIRO") return "Dinheiro";
  if (key === "DEBITO") return "Debito";
  if (key === "CREDITO") return "Credito";
  if (key === "ONLINE") return "Online";
  return key || "Nao informado";
}

const PAGAMENTO_ENTREGA_OPTIONS = [
  { value: "ONLINE", label: "Online" },
  { value: "PIX", label: "Pix" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "DEBITO", label: "Debito" },
  { value: "CREDITO", label: "Credito" }
];

function toDateLocal(dateStr, timeStr = "00:00") {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split("-").map((item) => Number(item));
  const [hh, mm] = String(timeStr || "00:00").split(":").map((item) => Number(item));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, Number(hh || 0), Number(mm || 0), 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function buildLocalIso(dateStr, timeStr = "00:00") {
  const d = toDateLocal(dateStr, timeStr);
  return d ? d.toISOString() : undefined;
}

function inRange(targetISO, fromDate, fromTime, toDate, toTime) {
  const target = new Date(targetISO);
  if (Number.isNaN(target.getTime())) return false;

  const from = fromDate ? toDateLocal(fromDate, fromTime || "00:00") : null;
  const to = toDate ? toDateLocal(toDate, toTime || "23:59") : null;

  if (!from && !to) return true;
  if (from && to && to >= from) {
    return target >= from && target <= to;
  }
  if (from && to && to < from) {
    const candidate = new Date(target);
    if (candidate < from) candidate.setDate(candidate.getDate() + 1);
    const toPlus = new Date(to);
    toPlus.setDate(toPlus.getDate() + 1);
    return candidate >= from && candidate <= toPlus;
  }
  if (from && !to) return target >= from;
  if (!from && to) return target <= to;
  return true;
}

function parsePedidos(rawText) {
  const tokens = String(rawText || "")
    .replace(/[;,\t]+/g, " ")
    .replace(/\r/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const unicos = [];
  const vistos = new Set();
  for (const item of tokens) {
    const key = item.toLowerCase();
    if (vistos.has(key)) continue;
    vistos.add(key);
    unicos.push(item);
  }
  return unicos;
}

function filtrarMotoboys(lista, q, fromDate, fromTime, toDate, toTime) {
  const query = String(q || "")
    .trim()
    .toLowerCase();

  return (Array.isArray(lista) ? lista : [])
    .map((motoboy) => {
      const pedidos = Array.isArray(motoboy.pedidos) ? motoboy.pedidos : [];
      const pedidosFiltrados = pedidos.filter((pedido) =>
        inRange(pedido.dataISO, fromDate, fromTime, toDate, toTime)
      );
      return {
        ...motoboy,
        pedidosFiltrados
      };
    })
    .filter((motoboy) => {
      if (!query) return true;
      const byNome = String(motoboy.nome || "")
        .toLowerCase()
        .includes(query);
      if (byNome) return true;
      return motoboy.pedidosFiltrados.some((pedido) =>
        String(pedido.numero || "")
          .toLowerCase()
          .includes(query)
      );
    });
}

function MotoboyCard({
  motoboy,
  fromDate,
  fromTime,
  toDate,
  toTime,
  podeGerir,
  onRefresh,
  onFeedback
}) {
  const [removing, setRemoving] = useState(false);
  const [pedidoParaRemover, setPedidoParaRemover] = useState(null);
  const [confirmarExcluirMotoboy, setConfirmarExcluirMotoboy] = useState(false);
  const [confirmProcessing, setConfirmProcessing] = useState(false);

  const pedidosFiltrados = useMemo(() => {
    return (motoboy.pedidos || [])
      .filter((pedido) => inRange(pedido.dataISO, fromDate, fromTime, toDate, toTime))
      .slice()
      .sort((a, b) => {
        const t1 = new Date(a.dataISO).getTime();
        const t2 = new Date(b.dataISO).getTime();
        return t2 - t1;
      });
  }, [motoboy.pedidos, fromDate, fromTime, toDate, toTime]);

  const porDia = useMemo(() => {
    const mapa = new Map();
    for (const pedido of pedidosFiltrados) {
      const date = new Date(pedido.dataISO);
      if (Number.isNaN(date.getTime())) continue;
      const dia = date.toLocaleDateString("pt-BR");
      mapa.set(dia, Number(mapa.get(dia) || 0) + 1);
    }
    return Array.from(mapa.entries());
  }, [pedidosFiltrados]);

  async function confirmarRemocaoPedido() {
    if (!podeGerir || !pedidoParaRemover) return;
    setConfirmProcessing(true);
    try {
      await api.removerEntregasPedido(pedidoParaRemover.id, motoboy.roleRuntime);
      onFeedback("success", `Pedido #${pedidoParaRemover.numero} removido.`);
      setPedidoParaRemover(null);
      await onRefresh();
    } catch (error) {
      onFeedback("error", error?.message || "Falha ao remover pedido.");
    } finally {
      setConfirmProcessing(false);
    }
  }

  async function confirmarExclusaoMotoboy() {
    if (!podeGerir || removing) return;
    setRemoving(true);
    setConfirmProcessing(true);
    try {
      await api.excluirEntregasMotoboy(motoboy.id, motoboy.roleRuntime);
      onFeedback("success", "Motoboy excluido.");
      setConfirmarExcluirMotoboy(false);
      await onRefresh();
    } catch (error) {
      onFeedback("error", error?.message || "Falha ao excluir motoboy.");
    } finally {
      setRemoving(false);
      setConfirmProcessing(false);
    }
  }

  return (
    <section style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <h3 style={{ margin: 0, fontFamily: "var(--font-heading)" }}>{motoboy.nome}</h3>
          <div style={{ color: "#9cb0e8", fontSize: 12 }}>
            {inteiro(pedidosFiltrados.length)} pedido(s) no periodo
          </div>
        </div>

        {podeGerir ? (
          <button
            type="button"
            style={dangerMiniButtonStyle(removing)}
            onClick={() => setConfirmarExcluirMotoboy(true)}
            disabled={removing}
          >
            Excluir motoboy
          </button>
        ) : null}
      </div>

      {porDia.length > 0 ? (
        <div style={kpiWrapStyle}>
          {porDia.map(([dia, total]) => (
            <span key={`${motoboy.id}-${dia}`} style={kpiTagStyle}>
              {dia}: {inteiro(total)}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ color: "#9cb0e8", fontSize: 12 }}>Sem pedidos no periodo selecionado.</div>
      )}

      <div style={listStyle}>
        {pedidosFiltrados.length < 1 ? (
          <div style={{ color: "#a7b6e4", fontSize: 13 }}>Nenhum pedido encontrado para esse filtro.</div>
        ) : (
          pedidosFiltrados.map((pedido) => (
            <article key={pedido.id} style={pedidoItemStyle}>
              <div style={{ display: "grid", gap: 2 }}>
                <strong style={{ fontSize: 18, color: "#ffd27b" }}>#{pedido.numero}</strong>
                <span style={{ fontSize: 12, color: "#9cb0e8" }}>{formatDateTimePtBr(pedido.dataISO)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={sourceTagStyle}>{nomeOrigem(pedido.source)}</span>
                <span style={paymentTagStyle}>{nomePagamentoEntrega(pedido.payment)}</span>
                {podeGerir ? (
                  <button
                    type="button"
                    style={neutralMiniButtonStyle(false)}
                    onClick={() => setPedidoParaRemover({ id: pedido.id, numero: pedido.numero })}
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pedidoParaRemover)}
        title="Remover pedido"
        message={
          pedidoParaRemover
            ? `Deseja remover o pedido #${pedidoParaRemover.numero} deste motoboy?`
            : ""
        }
        details={`Motoboy: ${motoboy.nome}`}
        variant="danger"
        processing={confirmProcessing}
        confirmLabel="Remover pedido"
        cancelLabel="Cancelar"
        onCancel={() => {
          if (confirmProcessing) return;
          setPedidoParaRemover(null);
        }}
        onConfirm={confirmarRemocaoPedido}
      />

      <ConfirmDialog
        open={confirmarExcluirMotoboy}
        title="Excluir motoboy"
        message={`Excluir "${motoboy.nome}" e todos os pedidos vinculados?`}
        details="Essa acao remove o cadastro e todo o historico de pedidos desse motoboy."
        variant="danger"
        processing={confirmProcessing}
        confirmLabel="Excluir motoboy"
        cancelLabel="Cancelar"
        onCancel={() => {
          if (confirmProcessing) return;
          setConfirmarExcluirMotoboy(false);
        }}
        onConfirm={confirmarExclusaoMotoboy}
      />
    </section>
  );
}

export default function Entregas() {
  const { role, hasPermission } = useApp();
  const podeVerEntregas = hasPermission("APP_ENTREGAS_VER");
  const podeGerirEntregas = hasPermission("APP_ENTREGAS_GERIR");

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [motoboys, setMotoboys] = useState([]);
  const [resumo, setResumo] = useState({ motoboys: 0, pedidos: 0 });
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [fromTime, setFromTime] = useState("00:00");
  const [toTime, setToTime] = useState("23:59");
  const [novoNome, setNovoNome] = useState("");
  const [savingMotoboy, setSavingMotoboy] = useState(false);
  const [pedidoGlobalText, setPedidoGlobalText] = useState("");
  const [selectedMotoboyId, setSelectedMotoboyId] = useState("");
  const [paymentModeGlobal, setPaymentModeGlobal] = useState("ONLINE");
  const [useCustomWhenGlobal, setUseCustomWhenGlobal] = useState(false);
  const [whenDateGlobal, setWhenDateGlobal] = useState(agoraDataIso());
  const [whenTimeGlobal, setWhenTimeGlobal] = useState(agoraHora());
  const [addingGlobal, setAddingGlobal] = useState(false);

  function onFeedback(type, text) {
    setFeedback({ type, text, id: Date.now() });
  }

  useEffect(() => {
    if (!feedback) return undefined;
    const id = setTimeout(() => setFeedback(null), 3600);
    return () => clearTimeout(id);
  }, [feedback]);

  async function carregarDados() {
    if (!podeVerEntregas) return;
    setLoading(true);
    setErro("");
    try {
      const [motoboysData, resumoData] = await Promise.all([
        api.getEntregasMotoboys(role, ""),
        api.getEntregasResumo(role)
      ]);

      const lista = (Array.isArray(motoboysData) ? motoboysData : []).map((motoboy) => ({
        ...motoboy,
        roleRuntime: role,
        pedidos: (Array.isArray(motoboy.pedidos) ? motoboy.pedidos : []).map((pedido) => ({
          ...pedido,
          dataISO: String(pedido.data_iso || pedido.dataISO || ""),
          payment: String(pedido.payment || "ONLINE").toUpperCase()
        }))
      }));

      setMotoboys(lista);
      setSelectedMotoboyId((prev) => {
        const prevId = String(prev || "").trim();
        if (prevId && lista.some((motoboy) => String(motoboy.id) === prevId)) {
          return prevId;
        }
        return lista.length > 0 ? String(lista[0].id) : "";
      });
      setResumo({
        motoboys: Number(resumoData?.motoboys || lista.length || 0),
        pedidos: Number(resumoData?.pedidos || 0)
      });
    } catch (error) {
      setErro(error?.message || "Falha ao carregar entregas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, [role, podeVerEntregas]);

  async function criarMotoboy() {
    if (!podeGerirEntregas || savingMotoboy) return;
    const nome = String(novoNome || "").trim();
    if (!nome) {
      onFeedback("warning", "Informe o nome do motoboy.");
      return;
    }

    setSavingMotoboy(true);
    try {
      await api.criarEntregasMotoboy({ nome }, role);
      onFeedback("success", "Motoboy criado com sucesso.");
      setNovoNome("");
      await carregarDados();
    } catch (error) {
      onFeedback("error", error?.message || "Falha ao criar motoboy.");
    } finally {
      setSavingMotoboy(false);
    }
  }

  async function adicionarPedidosGlobal() {
    if (!podeGerirEntregas || addingGlobal) return;
    const motoboySelecionado = motoboys.find((motoboy) => String(motoboy.id) === String(selectedMotoboyId));
    if (!motoboySelecionado) {
      onFeedback("warning", "Selecione um motoboy para enviar os pedidos.");
      return;
    }

    const pedidos = parsePedidos(pedidoGlobalText);
    if (pedidos.length < 1) {
      onFeedback("warning", "Cole ou digite ao menos um pedido.");
      return;
    }

    const payload = {
      pedidos: pedidos.map((numero) => ({
        numero,
        source: classificarOrigem(numero),
        whenISO: useCustomWhenGlobal ? buildLocalIso(whenDateGlobal, whenTimeGlobal) : undefined,
        payment: String(paymentModeGlobal || "ONLINE").toUpperCase()
      }))
    };

    setAddingGlobal(true);
    try {
      const resultado = await api.adicionarEntregasPedidosLote(motoboySelecionado.id, payload, role);
      const addedCount = Number(resultado?.addedCount || 0);
      const duplicados = Array.isArray(resultado?.skippedDuplicates) ? resultado.skippedDuplicates.length : 0;
      const invalidos = Array.isArray(resultado?.invalid) ? resultado.invalid.length : 0;

      if (addedCount > 0) {
        onFeedback("success", `${motoboySelecionado.nome}: ${addedCount} pedido(s) adicionado(s).`);
      }
      if (duplicados > 0) {
        onFeedback("warning", `${motoboySelecionado.nome}: ${duplicados} pedido(s) ja existiam.`);
      }
      if (invalidos > 0) {
        onFeedback("error", `${motoboySelecionado.nome}: ${invalidos} pedido(s) invalidos.`);
      }

      if (addedCount > 0) {
        setPedidoGlobalText("");
      }

      await carregarDados();
    } catch (error) {
      onFeedback("error", error?.message || "Falha ao adicionar pedidos.");
    } finally {
      setAddingGlobal(false);
    }
  }

  const listaFiltrada = useMemo(() => {
    return filtrarMotoboys(motoboys, q, fromDate, fromTime, toDate, toTime);
  }, [motoboys, q, fromDate, fromTime, toDate, toTime]);

  const totalPedidosPeriodo = useMemo(() => {
    return listaFiltrada.reduce((acc, motoboy) => acc + Number(motoboy.pedidosFiltrados?.length || 0), 0);
  }, [listaFiltrada]);

  const motoboyOptions = useMemo(() => {
    return motoboys.map((motoboy) => ({
      value: String(motoboy.id),
      label: motoboy.nome
    }));
  }, [motoboys]);

  if (!podeVerEntregas) {
    return <p>Sem permissao para acessar entregas.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={headerCardStyle}>
        <div style={titleRowStyle}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-heading)" }}>Entregas e Motoboys</h2>
          <button type="button" style={neutralMiniButtonStyle(loading)} onClick={carregarDados} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div style={gridStatsStyle}>
          <div style={statCardStyle}>
            <span style={statLabelStyle}>Motoboys cadastrados</span>
            <strong style={statValueStyle}>{inteiro(resumo.motoboys)}</strong>
          </div>
          <div style={statCardStyle}>
            <span style={statLabelStyle}>Pedidos totais</span>
            <strong style={statValueStyle}>{inteiro(resumo.pedidos)}</strong>
          </div>
          <div style={statCardStyle}>
            <span style={statLabelStyle}>Pedidos no periodo filtrado</span>
            <strong style={statValueStyle}>{inteiro(totalPedidosPeriodo)}</strong>
          </div>
        </div>

        <div style={filterGridStyle}>
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Buscar motoboy ou numero do pedido"
            style={inputStyle}
          />
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} style={inputDateStyle} />
          <input type="time" value={fromTime} onChange={(event) => setFromTime(event.target.value)} style={inputDateStyle} />
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} style={inputDateStyle} />
          <input type="time" value={toTime} onChange={(event) => setToTime(event.target.value)} style={inputDateStyle} />
          <button
            type="button"
            style={neutralMiniButtonStyle(false)}
            onClick={() => {
              const hoje = agoraDataIso();
              setFromDate(hoje);
              setToDate(hoje);
              setFromTime("00:00");
              setToTime("23:59");
            }}
          >
            Hoje
          </button>
          <button
            type="button"
            style={neutralMiniButtonStyle(false)}
            onClick={() => {
              setFromDate("");
              setToDate("");
              setFromTime("00:00");
              setToTime("23:59");
            }}
          >
            Limpar filtro
          </button>
        </div>

        {podeGerirEntregas ? (
          <div style={createRowStyle}>
            <input
              value={novoNome}
              onChange={(event) => setNovoNome(event.target.value)}
              placeholder="Nome do motoboy"
              style={inputStyle}
            />
            <button type="button" style={primaryMiniButtonStyle(savingMotoboy)} onClick={criarMotoboy} disabled={savingMotoboy}>
              {savingMotoboy ? "Criando..." : "Adicionar motoboy"}
            </button>
          </div>
        ) : null}

        {podeGerirEntregas ? (
          <div style={centralAddBoxStyle}>
            <strong style={{ fontFamily: "var(--font-heading)" }}>Adicionar pedidos (painel unico)</strong>
            <textarea
              value={pedidoGlobalText}
              onChange={(event) => setPedidoGlobalText(event.target.value)}
              style={textAreaStyle}
              placeholder="Digite ou cole codigos separados por espaco, virgula ou Enter."
            />
            <div style={rowWrapStyle}>
              <div style={miniFieldStyle}>
                <span style={miniFieldLabelStyle}>Motoboy</span>
                <SelectField
                  value={selectedMotoboyId}
                  onChange={setSelectedMotoboyId}
                  options={motoboyOptions}
                  placeholder="Selecione o motoboy"
                  buttonStyle={inputDateStyle}
                  wrapperStyle={{ minWidth: 210, maxWidth: 280 }}
                  disabled={addingGlobal || motoboyOptions.length < 1}
                />
              </div>
              <div style={miniFieldStyle}>
                <span style={miniFieldLabelStyle}>Forma de pagamento</span>
                <SelectField
                  value={paymentModeGlobal}
                  onChange={setPaymentModeGlobal}
                  options={PAGAMENTO_ENTREGA_OPTIONS}
                  buttonStyle={inputDateStyle}
                  wrapperStyle={{ minWidth: 190, maxWidth: 230 }}
                  disabled={addingGlobal}
                />
              </div>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={useCustomWhenGlobal}
                  onChange={(event) => setUseCustomWhenGlobal(event.target.checked)}
                />
                <span>Definir data/hora manual</span>
              </label>
              {useCustomWhenGlobal ? (
                <>
                  <input
                    type="date"
                    value={whenDateGlobal}
                    onChange={(event) => setWhenDateGlobal(event.target.value)}
                    style={inputDateStyle}
                  />
                  <input
                    type="time"
                    value={whenTimeGlobal}
                    onChange={(event) => setWhenTimeGlobal(event.target.value)}
                    style={inputDateStyle}
                  />
                </>
              ) : null}
              <button
                type="button"
                style={primaryMiniButtonStyle(addingGlobal || motoboyOptions.length < 1)}
                onClick={adicionarPedidosGlobal}
                disabled={addingGlobal || motoboyOptions.length < 1}
              >
                {addingGlobal ? "Adicionando..." : "Adicionar pedidos ao motoboy"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {feedback ? (
        <div style={feedbackStyle(feedback.type)}>
          {feedback.text}
        </div>
      ) : null}

      {erro ? <div style={feedbackStyle("error")}>{erro}</div> : null}

      {listaFiltrada.length < 1 ? (
        <div style={emptyStyle}>
          Nenhum motoboy encontrado para o filtro atual.
        </div>
      ) : (
        <div style={cardsGridStyle}>
          {listaFiltrada.map((motoboy) => (
            <MotoboyCard
              key={motoboy.id}
              motoboy={motoboy}
              fromDate={fromDate}
              fromTime={fromTime}
              toDate={toDate}
              toTime={toTime}
              podeGerir={podeGerirEntregas}
              onRefresh={carregarDados}
              onFeedback={onFeedback}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const headerCardStyle = {
  border: "1px solid #2d3352",
  borderRadius: 16,
  background: "#151a31",
  padding: 14,
  display: "grid",
  gap: 10
};

const titleRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap"
};

const gridStatsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 8
};

const statCardStyle = {
  border: "1px solid #2e375a",
  borderRadius: 12,
  background: "#12182f",
  padding: "10px 12px",
  display: "grid",
  gap: 4
};

const statLabelStyle = {
  color: "#9fb0e3",
  fontSize: 12
};

const statValueStyle = {
  fontSize: 22,
  fontWeight: 800
};

const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 8,
  alignItems: "center"
};

const createRowStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8
};

const inputStyle = {
  minHeight: 40,
  border: "1px solid #3b4263",
  background: "#121427",
  borderRadius: 10,
  color: "#fff",
  padding: "0 12px",
  boxSizing: "border-box",
  width: "100%"
};

const inputDateStyle = {
  minHeight: 40,
  border: "1px solid #3b4263",
  background: "#121427",
  borderRadius: 10,
  color: "#fff",
  padding: "0 10px",
  boxSizing: "border-box",
  width: "100%"
};

const cardsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
  alignItems: "start"
};

const cardStyle = {
  border: "1px solid #2d3352",
  borderRadius: 16,
  background: "#151a31",
  padding: 12,
  display: "grid",
  gap: 10,
  alignContent: "start"
};

const cardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap"
};

const kpiWrapStyle = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap"
};

const kpiTagStyle = {
  border: "1px solid #3c4d87",
  borderRadius: 999,
  background: "#1d2646",
  color: "#bdd0ff",
  fontSize: 12,
  padding: "4px 8px"
};

const centralAddBoxStyle = {
  border: "1px solid #2f3a67",
  borderRadius: 12,
  background: "#10172f",
  padding: 10,
  display: "grid",
  gap: 8
};

const textAreaStyle = {
  minHeight: 74,
  border: "1px solid #3b4263",
  background: "#121427",
  borderRadius: 10,
  color: "#fff",
  padding: "10px 12px",
  resize: "vertical",
  fontFamily: "var(--font-body)"
};

const rowWrapStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap"
};

const miniFieldStyle = {
  display: "grid",
  gap: 4,
  minWidth: 190
};

const miniFieldLabelStyle = {
  color: "#9cb0e8",
  fontSize: 12
};

const checkboxLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "#c8d4ff",
  fontSize: 13
};

const listStyle = {
  border: "1px solid #2f3763",
  borderRadius: 12,
  background: "#0f152b",
  padding: 8,
  display: "grid",
  gap: 8,
  maxHeight: 320,
  overflow: "auto"
};

const pedidoItemStyle = {
  border: "1px solid #2d3352",
  borderRadius: 10,
  background: "#151d38",
  padding: "9px 10px",
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap"
};

const sourceTagStyle = {
  border: "1px solid #43579c",
  borderRadius: 999,
  background: "#1c2750",
  color: "#c8d6ff",
  fontSize: 12,
  padding: "4px 8px"
};

const paymentTagStyle = {
  border: "1px solid #2f6f58",
  borderRadius: 999,
  background: "#153327",
  color: "#d4ffe9",
  fontSize: 12,
  padding: "4px 8px"
};

function feedbackStyle(type = "info") {
  const map = {
    success: {
      background: "#133a2a",
      border: "#1d8f62",
      color: "#d8ffea"
    },
    warning: {
      background: "#423214",
      border: "#c58e2c",
      color: "#ffeab9"
    },
    error: {
      background: "#481a22",
      border: "#bb4759",
      color: "#ffe4e9"
    },
    info: {
      background: "#162642",
      border: "#3d62a7",
      color: "#d8e6ff"
    }
  };

  const palette = map[type] || map.info;
  return {
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
    borderRadius: 12,
    padding: "10px 12px"
  };
}

const emptyStyle = {
  border: "1px dashed #324170",
  borderRadius: 16,
  background: "#121a32",
  padding: "16px 14px",
  color: "#b7c6f1"
};

function neutralMiniButtonStyle(disabled) {
  return {
    minHeight: 38,
    border: "1px solid #3d4770",
    borderRadius: 10,
    background: disabled ? "#252a44" : "#1b213c",
    color: "#d7def9",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "0 12px"
  };
}

function primaryMiniButtonStyle(disabled) {
  return {
    minHeight: 38,
    border: "none",
    borderRadius: 10,
    background: disabled ? "#596288" : "#2e63f4",
    color: "#fff",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "0 12px"
  };
}

function dangerMiniButtonStyle(disabled) {
  return {
    minHeight: 34,
    border: "1px solid #92495f",
    borderRadius: 10,
    background: disabled ? "#563645" : "#6b2536",
    color: "#ffe8ee",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "0 12px"
  };
}
