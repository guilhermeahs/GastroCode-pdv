import React, { useEffect, useMemo, useRef, useState } from "react";

const WEEK_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTH_LABELS = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function toIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseIso(iso) {
  if (!iso) return null;

  const [yearRaw, monthRaw, dayRaw] = String(iso).split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function sameDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildCalendarDays(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  const days = [];

  for (let i = 0; i < 42; i += 1) {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + i);
    days.push(current);
  }

  return days;
}

export default function DatePickerField({
  value,
  onChange,
  placeholder = "Selecionar data",
  wrapperStyle = null,
  buttonStyle = null
}) {
  const wrapperRef = useRef(null);
  const today = useMemo(() => new Date(), []);
  const selectedDate = useMemo(() => parseIso(value), [value]);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(selectedDate || new Date());

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
    if (selectedDate) {
      setViewDate(selectedDate);
    }
  }, [selectedDate]);

  const days = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const monthLabel = `${MONTH_LABELS[viewDate.getMonth()]} de ${viewDate.getFullYear()}`;
  const displayValue = selectedDate
    ? selectedDate.toLocaleDateString("pt-BR")
    : placeholder;

  function selectDate(date) {
    onChange(toIso(date));
    setOpen(false);
  }

  function previousMonth() {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function nextMonth() {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  function goToday() {
    const now = new Date();
    setViewDate(now);
    onChange(toIso(now));
    setOpen(false);
  }

  function clearDate() {
    onChange("");
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} style={{ ...baseWrapperStyle, ...(wrapperStyle || {}) }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{ ...triggerStyle, ...(buttonStyle || {}) }}
      >
        <span style={{ color: selectedDate ? "#eef2ff" : "#97a3cf" }}>{displayValue}</span>
        <span style={{ color: "#9db7ff" }}>▾</span>
      </button>

      {open && (
        <div style={popoverStyle}>
          <div style={headerStyle}>
            <strong style={{ textTransform: "capitalize", fontSize: 16 }}>{monthLabel}</strong>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={previousMonth} style={iconButtonStyle}>
                ←
              </button>
              <button type="button" onClick={nextMonth} style={iconButtonStyle}>
                →
              </button>
            </div>
          </div>

          <div style={weekdaysStyle}>
            {WEEK_LABELS.map((label) => (
              <div key={label} style={weekdayCellStyle}>
                {label}
              </div>
            ))}
          </div>

          <div style={daysGridStyle}>
            {days.map((day) => {
              const inMonth = day.getMonth() === viewDate.getMonth();
              const isToday = sameDay(day, today);
              const isSelected = sameDay(day, selectedDate);

              return (
                <button
                  key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
                  type="button"
                  onClick={() => selectDate(day)}
                  style={{
                    ...dayButtonStyle,
                    color: inMonth ? "#ecf1ff" : "#6f7a9f",
                    border: isToday ? "1px solid #2f6fff" : "1px solid transparent",
                    background: isSelected
                      ? "linear-gradient(180deg, #2f6fff 0%, #2359e0 100%)"
                      : "transparent",
                    fontWeight: isSelected ? 800 : 600,
                    boxShadow: isSelected ? "0 0 0 1px rgba(90, 143, 255, 0.4)" : "none"
                  }}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div style={footerStyle}>
            <button type="button" onClick={clearDate} style={ghostButtonStyle}>
              Limpar
            </button>
            <button type="button" onClick={goToday} style={ghostButtonStyle}>
              Hoje
            </button>
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
  minWidth: 170,
  height: 42,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid #3b4263",
  background: "linear-gradient(180deg, #181d36 0%, #11162c 100%)",
  color: "#eef2ff",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontWeight: 600,
  cursor: "pointer"
};

const popoverStyle = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  width: 300,
  borderRadius: 16,
  border: "1px solid #31406b",
  background: "linear-gradient(180deg, #141a31 0%, #0f1326 100%)",
  boxShadow: "0 14px 34px rgba(0, 0, 0, 0.45)",
  padding: 12,
  zIndex: 90
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 10
};

const iconButtonStyle = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid #3a4a77",
  background: "#1a2343",
  color: "#d3deff",
  cursor: "pointer",
  fontWeight: 800
};

const weekdaysStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  marginBottom: 6
};

const weekdayCellStyle = {
  textAlign: "center",
  color: "#9fb0df",
  fontSize: 12,
  fontWeight: 700,
  padding: "4px 0"
};

const daysGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 4
};

const dayButtonStyle = {
  height: 34,
  borderRadius: 8,
  fontSize: 14,
  cursor: "pointer",
  transition: "all 100ms ease"
};

const footerStyle = {
  marginTop: 10,
  display: "flex",
  justifyContent: "space-between",
  gap: 8
};

const ghostButtonStyle = {
  border: "1px solid #31406b",
  borderRadius: 8,
  background: "transparent",
  color: "#c7d6ff",
  padding: "6px 10px",
  cursor: "pointer",
  fontWeight: 700
};
