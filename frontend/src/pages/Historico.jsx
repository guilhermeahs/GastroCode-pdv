import React, { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import DatePickerField from "../components/DatePickerField";
import SelectField from "../components/SelectField";
import ConfirmDialog from "../components/ConfirmDialog";
import { formatDateTimePtBr } from "../utils/datetime";

const HISTORICO_INICIAL = 40;
const HISTORICO_PASSO = 80;

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function nomeFormaPagamento(codigo) {
  const code = String(codigo || "").toUpperCase();
  if (code === "PIX") return "Pix";
  if (code === "CREDITO") return "Credito";
  if (code === "DEBITO") return "Debito";
  if (code === "DINHEIRO") return "Dinheiro";
  if (code === "MISTO") return "Misto";
  return code || "Nao informado";
}

function resumoPagamentos(pagamentos = []) {
  const lista = Array.isArray(pagamentos) ? pagamentos : [];
  if (lista.length < 1) return "Nao informado";
  if (lista.length === 1) return nomeFormaPagamento(lista[0].forma_pagamento);
  return `Misto (${lista.map((item) => nomeFormaPagamento(item.forma_pagamento)).join(" + ")})`;
}

function hojeLocalIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function Historico() {
  const {
    historico,
    reabrirMesa,
    excluirHistorico,
    hasPermission,
    loading,
    filtroHistoricoPeriodo,
    definirFiltroHistoricoPorData,
    definirFiltroHistoricoPeriodo
  } = useApp();

  const [busca, setBusca] = useState("");
  const [formaFiltro, setFormaFiltro] = useState("TODOS");
  const [confirmExcluirOpen, setConfirmExcluirOpen] = useState(false);
  const [registroExcluir, setRegistroExcluir] = useState(null);
  const [pinSeguranca, setPinSeguranca] = useState("");
  const [dataInicio, setDataInicio] = useState(() => filtroHistoricoPeriodo?.data_inicio || "");
  const [dataFim, setDataFim] = useState(() => filtroHistoricoPeriodo?.data_fim || "");
  const [quantidadeRenderizada, setQuantidadeRenderizada] = useState(HISTORICO_INICIAL);
  const buscaDeferred = React.useDeferredValue(busca);

  if (!hasPermission("APP_HISTORICO_VER")) {
    return <p>Sem permissao para acessar o historico.</p>;
  }

  React.useEffect(() => {
    setDataInicio(filtroHistoricoPeriodo?.data_inicio || "");
    setDataFim(filtroHistoricoPeriodo?.data_fim || "");
  }, [filtroHistoricoPeriodo?.data_inicio, filtroHistoricoPeriodo?.data_fim]);

  const formasPagamento = useMemo(() => {
    const formas = new Set();
    for (const item of historico) {
      const formaPrincipal = String(item.forma_pagamento || "").toUpperCase();
      if (formaPrincipal) formas.add(formaPrincipal);
      if (Array.isArray(item.pagamentos)) {
        for (const pag of item.pagamentos) {
          const forma = String(pag?.forma_pagamento || "").toUpperCase();
          if (forma) formas.add(forma);
        }
      }
    }
    return ["TODOS", ...formas];
  }, [historico]);

  const opcoesFormaPagamento = useMemo(() => {
    return formasPagamento.map((forma) => ({
      value: forma,
      label: forma === "TODOS" ? "Todas as formas" : nomeFormaPagamento(forma)
    }));
  }, [formasPagamento]);

  const filtrado = useMemo(() => {
    const termo = buscaDeferred.trim().toLowerCase();

    return historico.filter((item) => {
      const formaAtual = String(item.forma_pagamento || "").toUpperCase();
      const pagamentos = Array.isArray(item.pagamentos) ? item.pagamentos : [];
      const formasDoRegistro =
        pagamentos.length > 0
          ? pagamentos.map((pag) => String(pag.forma_pagamento || "").toUpperCase())
          : [formaAtual];

      const formaOk =
        formaFiltro === "TODOS" ||
        formasDoRegistro.includes(formaFiltro) ||
        (formaFiltro === "MISTO" && formasDoRegistro.length > 1);

      const buscaOk =
        !termo ||
        String(item.mesa_numero).includes(termo) ||
        String(item.forma_pagamento || "").toLowerCase().includes(termo) ||
        resumoPagamentos(item.pagamentos).toLowerCase().includes(termo) ||
        String(item.total || "").includes(termo);

      return formaOk && buscaOk;
    });
  }, [historico, buscaDeferred, formaFiltro]);

  const resumo = useMemo(() => {
    const faturamento = filtrado.reduce((acc, item) => acc + Number(item.total || 0), 0);
    const taxaServico = filtrado.reduce((acc, item) => acc + Number(item.taxa_servico_valor || 0), 0);
    return {
      contas: filtrado.length,
      faturamento,
      taxaServico
    };
  }, [filtrado]);

  React.useEffect(() => {
    setQuantidadeRenderizada(HISTORICO_INICIAL);
  }, [busca, formaFiltro, dataInicio, dataFim, historico.length]);

  const registrosVisiveis = useMemo(() => {
    return filtrado.slice(0, quantidadeRenderizada);
  }, [filtrado, quantidadeRenderizada]);

  function abrirConfirmExcluir(item) {
    setRegistroExcluir(item);
    setPinSeguranca("");
    setConfirmExcluirOpen(true);
  }

  async function confirmarExcluirHistorico() {
    if (!registroExcluir) return;
    const pin = String(pinSeguranca || "").trim();
    if (!/^\d{4,8}$/.test(pin)) {
      alert("Informe o PIN do gerente (4 a 8 numeros).");
      return;
    }

    const ok = await excluirHistorico(registroExcluir.id, pin);
    if (ok) {
      setConfirmExcluirOpen(false);
      setRegistroExcluir(null);
      setPinSeguranca("");
    }
  }

  function aplicarPeriodoHistorico() {
    definirFiltroHistoricoPeriodo({
      data_inicio: dataInicio || "",
      data_fim: dataFim || dataInicio || ""
    });
  }

  function limparPeriodoHistorico() {
    setDataInicio("");
    setDataFim("");
    definirFiltroHistoricoPorData("");
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Historico de contas fechadas</h2>

      <div style={filtrosGridStyle}>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por mesa, valor ou pagamento"
          style={{ ...inputStyle, ...filtroBuscaStyle }}
        />

        <SelectField
          value={formaFiltro}
          onChange={setFormaFiltro}
          options={opcoesFormaPagamento}
          placeholder="Filtrar forma"
          wrapperStyle={filtroSelectStyle}
          menuStyle={{ minWidth: 220 }}
        />

        <DatePickerField
          value={dataInicio || ""}
          onChange={setDataInicio}
          placeholder="Data inicial"
          wrapperStyle={filtroDateStyle}
        />

        <DatePickerField
          value={dataFim || ""}
          onChange={setDataFim}
          placeholder="Data final"
          wrapperStyle={filtroDateStyle}
        />

        <button
          type="button"
          style={{ ...buttonStyle(false), ...filtroButtonStyle }}
          onClick={aplicarPeriodoHistorico}
        >
          Aplicar periodo
        </button>

        <button
          type="button"
          style={{ ...buttonStyle(false), ...filtroButtonStyle }}
          onClick={() => definirFiltroHistoricoPorData(hojeLocalIso())}
        >
          Filtrar hoje
        </button>

        <button
          type="button"
          style={{ ...secondaryButtonStyle(false), ...filtroButtonStyle }}
          onClick={limparPeriodoHistorico}
        >
          Limpar data
        </button>
      </div>

      <div style={resumoGridStyle}>
        <div style={resumoCardStyle}>
          <small>Contas</small>
          <strong>{resumo.contas}</strong>
        </div>

        <div style={resumoCardStyle}>
          <small>Faturamento</small>
          <strong>{moeda(resumo.faturamento)}</strong>
        </div>

        <div style={resumoCardStyle}>
          <small>Taxa de servico</small>
          <strong>{moeda(resumo.taxaServico)}</strong>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {filtrado.length === 0 && <div style={cardStyle}>Nenhum registro encontrado.</div>}

        {filtrado.length > 0 && (
          <div style={subResumoListaStyle}>
            Mostrando {registrosVisiveis.length} de {filtrado.length} registro(s)
          </div>
        )}

        {registrosVisiveis.map((item) => (
          <div key={item.id} style={cardStyle}>
            <div style={topoCardStyle}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>Mesa {item.mesa_numero}</div>
              <span style={chipFormaStyle}>{resumoPagamentos(item.pagamentos)}</span>
            </div>

            <div style={dadosCardGridStyle}>
              <div>
                <small style={labelStyle}>Fechado em</small>
                <div>{formatDateTimePtBr(item.closed_at)}</div>
              </div>

              {item.garcom_nome_fechamento && (
                <div>
                  <small style={labelStyle}>Garcom no fechamento</small>
                  <div>{item.garcom_nome_fechamento}</div>
                </div>
              )}

              <div>
                <small style={labelStyle}>Subtotal</small>
                <div>{moeda(item.subtotal)}</div>
              </div>

              <div>
                <small style={labelStyle}>Taxa de servico</small>
                <div>
                  {moeda(item.taxa_servico_valor)} ({Number(item.taxa_servico_percent || 0)}%)
                </div>
              </div>

              {Number(item.couvert_artistico_total || 0) > 0 && (
                <div>
                  <small style={labelStyle}>Couvert artistico</small>
                  <div>{moeda(item.couvert_artistico_total)}</div>
                </div>
              )}

              <div>
                <small style={labelStyle}>Total</small>
                <div style={{ fontWeight: 700 }}>{moeda(item.total)}</div>
              </div>

              <div>
                <small style={labelStyle}>Pessoas</small>
                <div>{item.pessoas}</div>
              </div>
            </div>

            <button
              onClick={() => reabrirMesa(item.mesa_id)}
              style={buttonStyle(loading)}
              disabled={loading}
            >
              Reabrir mesa
            </button>

            <button
              onClick={() => abrirConfirmExcluir(item)}
              style={dangerButtonStyle(loading)}
              disabled={loading}
            >
              Excluir do historico
            </button>

            {Array.isArray(item.pagamentos) && item.pagamentos.length > 1 && (
              <div style={pagamentosMistosStyle}>
                {item.pagamentos.map((pagamento, index) => (
                  <div key={`${item.id}-${index}`} style={pagamentoMistoItemStyle}>
                    <span>{nomeFormaPagamento(pagamento.forma_pagamento)}</span>
                    <strong>{moeda(pagamento.valor)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {registrosVisiveis.length < filtrado.length && (
          <button
            type="button"
            style={secondaryButtonStyle(loading)}
            onClick={() => setQuantidadeRenderizada((prev) => prev + HISTORICO_PASSO)}
            disabled={loading}
          >
            Carregar mais historico
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmExcluirOpen}
        title={`Excluir registro da mesa ${registroExcluir?.mesa_numero || "-"}`}
        message="Esse registro de historico e financeiro sera removido permanentemente."
        details="Seguranca: confirme com o PIN do gerente."
        confirmLabel="Excluir registro"
        cancelLabel="Cancelar"
        variant="danger"
        processing={loading}
        confirmDisabled={!/^\d{4,8}$/.test(String(pinSeguranca || "").trim())}
        onCancel={() => {
          if (loading) return;
          setConfirmExcluirOpen(false);
          setRegistroExcluir(null);
          setPinSeguranca("");
        }}
        onConfirm={confirmarExcluirHistorico}
      >
        <input
          type="password"
          inputMode="numeric"
          value={pinSeguranca}
          onChange={(e) => setPinSeguranca(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="PIN gerente (4 a 8 numeros)"
          style={inputStyle}
        />
      </ConfirmDialog>
    </div>
  );
}

const filtrosGridStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 12,
  alignItems: "end"
};

const filtroBuscaStyle = {
  flex: "2 1 280px",
  minWidth: 260
};

const filtroSelectStyle = {
  flex: "1 1 220px",
  minWidth: 200
};

const filtroDateStyle = {
  flex: "0 1 180px",
  minWidth: 170
};

const filtroButtonStyle = {
  flex: "0 0 auto",
  minWidth: 170,
  whiteSpace: "nowrap"
};

const inputStyle = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #3b4263",
  background: "#121427",
  color: "#fff"
};

const resumoGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  marginBottom: 12
};

const resumoCardStyle = {
  border: "1px solid #2d3352",
  borderRadius: 14,
  padding: "10px 12px",
  background: "#141a32",
  display: "grid",
  gap: 6
};

const subResumoListaStyle = {
  color: "#a9b0cf",
  fontSize: 13
};

const cardStyle = {
  border: "1px solid #2d3352",
  borderRadius: 16,
  padding: 14,
  background: "#151a31"
};

const topoCardStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 10
};

const chipFormaStyle = {
  border: "1px solid #31539c",
  background: "#142445",
  color: "#9ec2ff",
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 12,
  fontWeight: 700
};

const dadosCardGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 8
};

const pagamentosMistosStyle = {
  marginTop: 10,
  border: "1px solid #2d3352",
  borderRadius: 10,
  background: "#11172e",
  padding: 8,
  display: "grid",
  gap: 6
};

const pagamentoMistoItemStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  color: "#d7def9"
};

const labelStyle = {
  color: "#a9b0cf"
};

function buttonStyle(disabled) {
  return {
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    background: disabled ? "#646c8a" : "#f2a640",
    color: "#111",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700
  };
}

function secondaryButtonStyle(disabled) {
  return {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #3d4770",
    background: disabled ? "#252a44" : "#1b213c",
    color: "#d7def9",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700
  };
}

function dangerButtonStyle(disabled) {
  return {
    marginLeft: 8,
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #7a3b49",
    background: disabled ? "#5f3942" : "#4c1d27",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700
  };
}
