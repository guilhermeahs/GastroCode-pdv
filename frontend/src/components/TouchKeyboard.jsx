import React, { useEffect, useState } from "react";

const ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m", "-", "."]
];

export default function TouchKeyboard({
  open,
  value,
  onChange,
  onClose,
  title = "Teclado touch"
}) {
  const [caps, setCaps] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    function onEsc(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  function inserir(texto) {
    onChange(`${value || ""}${texto}`);
  }

  function apagar() {
    onChange(String(value || "").slice(0, -1));
  }

  function limpar() {
    onChange("");
  }

  function tocarTecla(tecla) {
    const texto = caps ? tecla.toUpperCase() : tecla;
    inserir(texto);
  }

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <strong>{title}</strong>
          <button type="button" onClick={onClose} style={closeButtonStyle}>
            Fechar
          </button>
        </div>

        <div style={previewStyle}>{value || " "}</div>

        <div style={rowsStyle}>
          {ROWS.map((row, index) => (
            <div key={index} style={rowStyle}>
              {row.map((key) => (
                <button key={key} type="button" onClick={() => tocarTecla(key)} style={keyStyle}>
                  {caps ? key.toUpperCase() : key}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div style={actionsStyle}>
          <button type="button" onClick={() => setCaps((prev) => !prev)} style={capsButtonStyle(caps)}>
            {caps ? "ABC" : "abc"}
          </button>
          <button type="button" onClick={() => inserir(" ")} style={spaceButtonStyle}>
            Espaco
          </button>
          <button type="button" onClick={apagar} style={smallActionStyle}>
            Apagar
          </button>
          <button type="button" onClick={limpar} style={smallActionStyle}>
            Limpar
          </button>
        </div>
      </div>
    </div>
  );
}

const backdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.42)",
  display: "grid",
  alignItems: "end",
  justifyItems: "center",
  padding: 10,
  zIndex: 200
};

const panelStyle = {
  width: "min(980px, calc(100vw - 16px))",
  borderRadius: 16,
  border: "1px solid #2e3c6a",
  background: "linear-gradient(180deg, #10162f 0%, #0a1022 100%)",
  boxShadow: "0 -8px 28px rgba(0, 0, 0, 0.35)",
  padding: 12,
  display: "grid",
  gap: 10
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8
};

const closeButtonStyle = {
  border: "1px solid #465486",
  borderRadius: 10,
  background: "#1a2447",
  color: "#dce6ff",
  padding: "8px 12px",
  fontWeight: 700,
  cursor: "pointer"
};

const previewStyle = {
  minHeight: 46,
  border: "1px solid #3a4a7d",
  borderRadius: 12,
  background: "#0d1329",
  padding: "10px 12px",
  color: "#fff",
  fontSize: 20,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};

const rowsStyle = {
  display: "grid",
  gap: 8
};

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(58px, 1fr))",
  gap: 8
};

const keyStyle = {
  minHeight: 52,
  borderRadius: 12,
  border: "1px solid #43558f",
  background: "#1a2550",
  color: "#fff",
  fontSize: 21,
  fontWeight: 700,
  cursor: "pointer",
  touchAction: "manipulation"
};

const actionsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
  gap: 8
};

function capsButtonStyle(active) {
  return {
    minHeight: 50,
    borderRadius: 12,
    border: `1px solid ${active ? "#5f86ff" : "#43558f"}`,
    background: active ? "#2b58e4" : "#1a2550",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer"
  };
}

const spaceButtonStyle = {
  minHeight: 50,
  borderRadius: 12,
  border: "1px solid #43558f",
  background: "#253261",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer"
};

const smallActionStyle = {
  minHeight: 50,
  borderRadius: 12,
  border: "1px solid #43558f",
  background: "#1a2550",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer"
};
