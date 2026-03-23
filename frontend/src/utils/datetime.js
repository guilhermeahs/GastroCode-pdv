function parseSqliteUtcTimestamp(value) {
  const match = String(value || "")
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/
    );

  if (!match) return null;

  const [
    ,
    yearRaw,
    monthRaw,
    dayRaw,
    hourRaw,
    minuteRaw,
    secondRaw = "00",
    milliRaw = "0"
  ] = match;

  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  const milli = Number(String(milliRaw).padEnd(3, "0").slice(0, 3));

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, milli));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseServerDateTime(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const byNumber = new Date(value);
    return Number.isNaN(byNumber.getTime()) ? null : byNumber;
  }

  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  const hasTimezone = /(?:[zZ]|[+\-]\d{2}:?\d{2})$/.test(raw);
  if (hasTimezone) {
    const byIso = new Date(raw);
    return Number.isNaN(byIso.getTime()) ? null : byIso;
  }

  const bySqliteUtc = parseSqliteUtcTimestamp(raw);
  if (bySqliteUtc) return bySqliteUtc;

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function formatDateTimePtBr(value, fallback = "-") {
  const parsed = parseServerDateTime(value);
  if (!parsed) return fallback;
  return parsed.toLocaleString("pt-BR");
}
