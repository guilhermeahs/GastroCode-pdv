import React from "react";

const statusStyle = {
  LIVRE: { bg: "#153d2e", border: "#25654b", label: "Livre" },
  OCUPADA: { bg: "#4b2f13", border: "#8a5a24", label: "Ocupada" },
  FECHANDO: { bg: "#4a1026", border: "#8f2a48", label: "Fechando" }
};

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

export default function CardMesa({ mesa, selected, onClick, touchMode = false, searchTerm = "" }) {
  const style = statusStyle[mesa.status] || statusStyle.LIVRE;
  const clienteNome = String(mesa.cliente_nome || "").trim();
  const termoBusca = String(searchTerm || "").trim().toLowerCase();
  const clienteEmDestaque =
    clienteNome && termoBusca.length > 0 && clienteNome.toLowerCase().includes(termoBusca);

  return (
    <button
      onClick={onClick}
      style={{
        border: selected ? "2px solid #2e63f4" : `1px solid ${style.border}`,
        background: style.bg,
        color: "#fff",
        borderRadius: 16,
        padding: touchMode ? 16 : 14,
        textAlign: "left",
        cursor: "pointer",
        minHeight: touchMode ? 142 : 128,
        boxShadow: selected ? "0 0 0 2px rgba(46, 99, 244, 0.25)" : "none",
        display: "grid",
        gap: touchMode ? 10 : 8,
        touchAction: "manipulation"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ fontSize: touchMode ? 24 : 22, fontWeight: 800 }}>Mesa {mesa.numero}</div>
        <span
          style={{
            fontSize: touchMode ? 13 : 12,
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 999,
            padding: touchMode ? "5px 10px" : "3px 8px"
          }}
        >
          {style.label}
        </span>
      </div>

      <div style={{ fontSize: touchMode ? 16 : 14, opacity: 0.9 }}>Total atual: {moeda(mesa.total)}</div>
      {clienteNome && (
        <div
          style={{
            fontSize: touchMode ? 13 : 13,
            color: clienteEmDestaque ? "#ffe5b0" : "#d3d8e8",
            fontWeight: clienteEmDestaque ? 700 : 500
          }}
        >
          Cliente: {clienteNome}
        </div>
      )}
      <div style={{ fontSize: touchMode ? 13 : 12, color: "#d3d8e8" }}>Pessoas: {mesa.pessoas || 1}</div>
    </button>
  );
}
