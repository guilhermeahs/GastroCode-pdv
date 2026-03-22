import React from "react";

export default function ConfirmDialog({
  open,
  title = "Confirmar acao",
  message = "",
  details = "",
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  processing = false,
  variant = "primary",
  confirmDisabled = false,
  maxWidth = 560,
  children = null,
  onConfirm,
  onCancel
}) {
  if (!open) return null;

  const isDanger = variant === "danger";

  return (
    <div style={overlayStyle} onMouseDown={onCancel}>
      <div
        style={dialogStyle(maxWidth)}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div style={headerStyle}>
          <div style={badgeStyle(isDanger)}>{isDanger ? "!" : "i"}</div>
          <h3 style={{ margin: 0 }}>{title}</h3>
        </div>
        {message ? <p style={messageStyle}>{message}</p> : null}

        {details ? (
          <pre style={detailsStyle}>
            {details}
          </pre>
        ) : null}

        {children ? <div style={{ marginBottom: 12 }}>{children}</div> : null}

        <div style={actionsStyle}>
          <button type="button" onClick={onCancel} style={cancelButtonStyle(processing)} disabled={processing}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={confirmButtonStyle(processing, variant)}
            disabled={processing || confirmDisabled}
          >
            {processing ? "Processando..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "radial-gradient(circle at 20% 0%, rgba(34, 65, 140, 0.2) 0%, rgba(4, 7, 16, 0.82) 45%)",
  display: "grid",
  placeItems: "center",
  padding: 16,
  zIndex: 140
};

function dialogStyle(maxWidth) {
  return {
    width: `min(${maxWidth}px, calc(100vw - 24px))`,
    borderRadius: 20,
    border: "1px solid #304577",
    background: "linear-gradient(140deg, #171f3d 0%, #11182f 62%, #0e1529 100%)",
    boxShadow: "0 20px 44px rgba(0, 0, 0, 0.48)",
    padding: 16,
    color: "#f3f6ff"
  };
}

const headerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 8
};

function badgeStyle(danger) {
  return {
    width: 26,
    height: 26,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    fontSize: 14,
    color: danger ? "#ffd6df" : "#e4ecff",
    border: `1px solid ${danger ? "#8c3d4f" : "#3f68e7"}`,
    background: danger ? "rgba(140, 61, 79, 0.33)" : "rgba(63, 104, 231, 0.24)"
  };
}

const messageStyle = {
  marginTop: 0,
  marginBottom: 10,
  color: "#c8d3f4",
  whiteSpace: "pre-wrap"
};

const detailsStyle = {
  margin: 0,
  marginBottom: 12,
  padding: 10,
  borderRadius: 12,
  border: "1px solid #334574",
  background: "#0f1630",
  color: "#e6ecff",
  maxHeight: 240,
  overflow: "auto",
  fontSize: 13,
  whiteSpace: "pre-wrap",
  fontFamily: "var(--font-mono)"
};

const actionsStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap"
};

function cancelButtonStyle(disabled) {
  return {
    border: "1px solid #4b5986",
    borderRadius: 10,
    background: "#1a2445",
    color: "#dbe5ff",
    fontWeight: 700,
    padding: "9px 12px",
    cursor: disabled ? "not-allowed" : "pointer"
  };
}

function confirmButtonStyle(disabled, variant) {
  const palette =
    variant === "danger"
      ? { border: "#8c3d4f", bg: "#582131", text: "#ffe7ec" }
      : { border: "#3f68e7", bg: "#2f62ef", text: "#ffffff" };

  return {
    border: `1px solid ${palette.border}`,
    borderRadius: 10,
    background: disabled ? "#4f5f92" : palette.bg,
    color: palette.text,
    fontWeight: 700,
    padding: "9px 12px",
    cursor: disabled ? "not-allowed" : "pointer"
  };
}
