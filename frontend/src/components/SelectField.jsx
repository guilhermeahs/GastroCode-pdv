import React, { useEffect, useMemo, useRef, useState } from "react";

export default function SelectField({
  value,
  onChange,
  options = [],
  placeholder = "Selecionar",
  wrapperStyle = null,
  buttonStyle = null,
  menuStyle = null,
  disabled = false
}) {
  const wrapperRef = useRef(null);
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    return options.find((option) => option.value === value) || null;
  }, [options, value]);

  useEffect(() => {
    if (!open) return undefined;

    function onOutsideClick(event) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function onEsc(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onOutsideClick);
    document.addEventListener("keydown", onEsc);

    return () => {
      document.removeEventListener("mousedown", onOutsideClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  function handleChoose(optionValue) {
    onChange(optionValue);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} style={{ ...baseWrapperStyle, ...(wrapperStyle || {}) }}>
      <button
        type="button"
        onClick={() => {
          if (!disabled) {
            setOpen((prev) => !prev);
          }
        }}
        style={{
          ...triggerStyle,
          ...(buttonStyle || {}),
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.7 : 1
        }}
        disabled={disabled}
      >
        <span style={{ color: selected ? "#eef2ff" : "#97a3cf" }}>{selected?.label || placeholder}</span>
        <span style={chevronStyle(open)}>{open ? "^" : "v"}</span>
      </button>

      {open && (
        <div style={{ ...popoverStyle, ...(menuStyle || {}) }}>
          <div style={optionsListStyle}>
            {options.map((option) => {
              const active = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleChoose(option.value)}
                  style={{
                    ...optionButtonStyle,
                    background: active ? "rgba(46, 99, 244, 0.24)" : "transparent",
                    border: active ? "1px solid rgba(101, 141, 255, 0.55)" : "1px solid transparent",
                    color: active ? "#dce8ff" : "#e7edff",
                    fontWeight: active ? 800 : 600
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const baseWrapperStyle = {
  position: "relative",
  width: "100%"
};

const triggerStyle = {
  width: "100%",
  minWidth: 0,
  height: 42,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid #3b4263",
  background: "linear-gradient(180deg, #181d36 0%, #11162c 100%)",
  color: "#eef2ff",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontWeight: 700
};

const popoverStyle = {
  position: "absolute",
  top: "calc(100% + 8px)",
  left: 0,
  minWidth: "100%",
  maxWidth: 360,
  borderRadius: 14,
  border: "1px solid #31406b",
  background: "linear-gradient(180deg, #141a31 0%, #0f1326 100%)",
  boxShadow: "0 14px 34px rgba(0, 0, 0, 0.45)",
  padding: 8,
  zIndex: 90,
  maxHeight: 260,
  overflowY: "auto"
};

const optionsListStyle = {
  display: "grid",
  gap: 6
};

const optionButtonStyle = {
  width: "100%",
  textAlign: "left",
  borderRadius: 10,
  padding: "9px 10px",
  cursor: "pointer",
  fontSize: 15
};

function chevronStyle(open) {
  return {
    color: "#9db7ff",
    fontSize: 15,
    fontWeight: 800,
    transform: open ? "translateY(-1px)" : "translateY(0)",
    transition: "transform 120ms ease"
  };
}
