const crypto = require("crypto");
const db = require("../config/db");
const SistemaConfig = require("../models/SistemaConfig");
const EntregaModel = require("../models/Entrega");

const CONFIG_KEYS = {
  enabled: "entregas_ifood_hmg_enabled",
  baseUrl: "entregas_ifood_base_url",
  tokenUrl: "entregas_ifood_token_url",
  pollingPath: "entregas_ifood_polling_path",
  ackPath: "entregas_ifood_ack_path",
  orderPath: "entregas_ifood_order_details_path",
  orderPathFallback: "entregas_ifood_order_details_path_fallback",
  apiKey: "entregas_ifood_api_key",
  bearerToken: "entregas_ifood_bearer_token",
  accessToken: "entregas_ifood_access_token",
  accessTokenExpiresAt: "entregas_ifood_access_token_expires_at",
  refreshToken: "entregas_ifood_refresh_token",
  clientId: "entregas_ifood_client_id",
  clientSecret: "entregas_ifood_client_secret",
  grantType: "entregas_ifood_grant_type",
  authorizationCode: "entregas_ifood_authorization_code",
  scope: "entregas_ifood_scope",
  pollingMerchants: "entregas_ifood_polling_merchants",
  pollingIntervalSeconds: "entregas_ifood_polling_interval_seconds",
  pollingExcludeHeartbeat: "entregas_ifood_polling_exclude_heartbeat",
  autoAck: "entregas_ifood_auto_ack",
  motoboyFallback: "entregas_ifood_motoboy_fallback",
  webhookSecret: "entregas_ifood_webhook_secret",
  webhookSignatureRequired: "entregas_ifood_webhook_signature_required",
  lastSyncAt: "entregas_ifood_last_hmg_sync_at",
  lastSyncResult: "entregas_ifood_last_hmg_sync_result",
  lastTokenRefreshAt: "entregas_ifood_last_token_refresh_at"
};

const DEFAULTS = {
  enabled: false,
  baseUrl: "https://merchant-api.ifood.com.br",
  tokenUrl: "/authentication/v1.0/oauth/token",
  pollingPath: "/events/v1.0/events:polling",
  ackPath: "/events/v1.0/events/acknowledgment",
  orderPath: "/order/v1.0/orders/{orderId}",
  orderPathFallback: "/orders/{orderId}",
  apiKey: "",
  bearerToken: "",
  accessToken: "",
  accessTokenExpiresAt: "",
  refreshToken: "",
  clientId: "",
  clientSecret: "",
  grantType: "client_credentials",
  authorizationCode: "",
  scope: "",
  pollingMerchants: "",
  pollingIntervalSeconds: 30,
  pollingExcludeHeartbeat: true,
  autoAck: true,
  motoboyFallback: "iFood",
  webhookSecret: "",
  webhookSignatureRequired: true,
  lastSyncAt: "",
  lastSyncResult: "",
  lastTokenRefreshAt: ""
};

const PAYMENT_MAP = {
  PIX: "PIX",
  DINHEIRO: "DINHEIRO",
  CASH: "DINHEIRO",
  CREDIT: "CREDITO",
  CREDITO: "CREDITO",
  DEBIT: "DEBITO",
  DEBITO: "DEBITO",
  ONLINE: "ONLINE",
  APP: "ONLINE"
};

const DEFAULT_MANUAL_CANCEL_OPTIONS = [
  {
    code: "OUT_OF_STOCK",
    label: "Item indisponivel",
    subreasons: [
      { code: "MAIN_ITEM_UNAVAILABLE", label: "Item principal indisponivel" },
      { code: "COMPLEMENT_UNAVAILABLE", label: "Complemento indisponivel" }
    ]
  },
  {
    code: "STORE_CLOSED",
    label: "Loja fechada",
    subreasons: [
      { code: "OUTSIDE_OPENING_HOURS", label: "Fora do horario de funcionamento" },
      { code: "UNEXPECTED_CLOSURE", label: "Fechamento inesperado" }
    ]
  },
  {
    code: "DELIVERY_AREA_UNAVAILABLE",
    label: "Area de entrega indisponivel",
    subreasons: [
      { code: "AREA_BLOCKED", label: "Area temporariamente bloqueada" },
      { code: "NO_COURIER", label: "Sem entregador disponivel" }
    ]
  },
  {
    code: "OPERATIONAL_ISSUE",
    label: "Problema operacional",
    subreasons: [
      { code: "SYSTEM_ISSUE", label: "Instabilidade no sistema" },
      { code: "PRODUCTION_DELAY", label: "Atraso de producao" }
    ]
  },
  {
    code: "CUSTOMER_REQUEST",
    label: "Solicitacao do cliente",
    subreasons: [
      { code: "WRONG_ADDRESS", label: "Endereco incorreto" },
      { code: "CUSTOMER_GAVE_UP", label: "Cliente desistiu do pedido" }
    ]
  }
];

const ORDER_CACHE_TTL_MS = 15 * 1000;
let ifoodSyncRunning = false;

db.exec(`
  CREATE TABLE IF NOT EXISTS ifood_event_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    merchant_id TEXT,
    order_id TEXT,
    code TEXT,
    full_code TEXT,
    created_at_event TEXT,
    received_at TEXT DEFAULT CURRENT_TIMESTAMP,
    acked_at TEXT,
    status TEXT NOT NULL DEFAULT 'RECEIVED',
    error TEXT,
    payload_json TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_ifood_event_logs_received_at
    ON ifood_event_logs(received_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ifood_event_logs_order_id
    ON ifood_event_logs(order_id);
  CREATE INDEX IF NOT EXISTS idx_ifood_event_logs_status
    ON ifood_event_logs(status);

  CREATE TABLE IF NOT EXISTS ifood_order_cache (
    order_id TEXT PRIMARY KEY,
    fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payload_json TEXT NOT NULL
  );
`);

const insertEventStmt = db.prepare(`
  INSERT INTO ifood_event_logs (
    event_id,
    merchant_id,
    order_id,
    code,
    full_code,
    created_at_event,
    status,
    error,
    payload_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(event_id) DO NOTHING
`);

const updateEventStatusStmt = db.prepare(`
  UPDATE ifood_event_logs
  SET status = ?,
      error = ?,
      acked_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE acked_at END
  WHERE event_id = ?
`);

const listEventsStmt = db.prepare(`
  SELECT
    id,
    event_id,
    merchant_id,
    order_id,
    code,
    full_code,
    created_at_event,
    received_at,
    acked_at,
    status,
    error,
    payload_json
  FROM ifood_event_logs
  ORDER BY datetime(received_at) DESC, id DESC
  LIMIT ?
`);

const metricsStmt = db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN acked_at IS NOT NULL THEN 1 ELSE 0 END) AS acked,
    SUM(CASE WHEN status IN ('ERROR','ACK_FAILED') THEN 1 ELSE 0 END) AS failed,
    SUM(CASE WHEN acked_at IS NULL THEN 1 ELSE 0 END) AS pending_ack
  FROM ifood_event_logs
`);

const metrics24hStmt = db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN acked_at IS NOT NULL THEN 1 ELSE 0 END) AS acked,
    SUM(CASE WHEN status IN ('ERROR','ACK_FAILED') THEN 1 ELSE 0 END) AS failed,
    SUM(CASE WHEN acked_at IS NULL THEN 1 ELSE 0 END) AS pending_ack
  FROM ifood_event_logs
  WHERE datetime(received_at) >= datetime('now', '-1 day')
`);

const scenarioOrdersStmt = db.prepare(`
  SELECT detalhes_json
  FROM motoboy_pedidos
  WHERE source = 'IFOOD'
    AND detalhes_json IS NOT NULL
    AND trim(detalhes_json) <> ''
  ORDER BY id DESC
  LIMIT 3000
`);

const cacheOrderGetStmt = db.prepare(`
  SELECT order_id, fetched_at, payload_json
  FROM ifood_order_cache
  WHERE order_id = ?
  LIMIT 1
`);

const cacheOrderUpsertStmt = db.prepare(`
  INSERT INTO ifood_order_cache (order_id, fetched_at, payload_json)
  VALUES (?, CURRENT_TIMESTAMP, ?)
  ON CONFLICT(order_id) DO UPDATE
  SET fetched_at = CURRENT_TIMESTAMP,
      payload_json = excluded.payload_json
`);

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "sim", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "nao", "off", "no"].includes(raw)) return false;
  return Boolean(fallback);
}

function toInt(value, fallback = 0, min = 0, max = 999999) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function pick(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const txt = String(value).trim();
    if (txt) return txt;
  }
  return "";
}

function parseJsonSafe(raw, fallback = null) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function compactObject(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  const output = {};
  for (const [key, item] of Object.entries(input)) {
    if (item === undefined || item === null || item === "") continue;
    output[key] = item;
  }
  return output;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTextKey(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function isGeneratedCancellationCode(code = "") {
  const txt = String(code || "").trim().toUpperCase();
  if (!txt) return true;
  return /^REASON_\d+$/.test(txt) || /^SUBREASON_\d+$/.test(txt);
}

function normalizeCancellationSubreason(entry, idx) {
  const obj = entry && typeof entry === "object" ? entry : {};
  const code = pick(
    obj?.code,
    obj?.reasonCode,
    obj?.reason_code,
    obj?.subreasonCode,
    obj?.subReasonCode,
    obj?.subreason_code,
    obj?.cancellationCode,
    obj?.cancellation_code,
    obj?.value,
    obj?.key,
    obj?.metadata?.code,
    obj?.subCode,
    obj?.id,
    typeof entry === "string" ? entry : ""
  )
    .trim()
    .slice(0, 100);
  const label = pick(
    obj?.label,
    obj?.name,
    obj?.description,
    obj?.reason,
    code
  )
    .trim()
    .slice(0, 160);
  const safeCode = code || `SUBREASON_${idx + 1}`;
  const safeLabel = label || safeCode;
  return {
    code: safeCode,
    label: safeLabel
  };
}

function normalizeCancellationOption(entry, idx) {
  const obj = entry && typeof entry === "object" ? entry : {};
  const code = pick(
    obj?.cancelCodeId,
    obj?.code,
    obj?.reasonCode,
    obj?.reason_code,
    obj?.cancellationCode,
    obj?.cancellation_code,
    obj?.cancellationReasonCode,
    obj?.cancellation_reason_code,
    obj?.reason?.code,
    obj?.reason?.reasonCode,
    obj?.metadata?.code,
    obj?.key,
    obj?.value,
    obj?.codeValue,
    obj?.id,
    typeof entry === "string" ? entry : ""
  )
    .trim()
    .slice(0, 100);
  const label = pick(
    obj?.description,
    obj?.label,
    obj?.name,
    obj?.description,
    obj?.reason,
    obj?.title,
    obj?.displayName,
    obj?.reason?.label,
    obj?.reason?.name,
    code
  )
    .trim()
    .slice(0, 180);
  const safeCode = code;
  const safeLabel = label || code || `REASON_${idx + 1}`;

  if (!safeCode) {
    return null;
  }

  const rawSub = [
    ...toArray(obj?.subreasons),
    ...toArray(obj?.subReasons),
    ...toArray(obj?.sub_reasons),
    ...toArray(obj?.subReasonsList),
    ...toArray(obj?.cancellationSubreasons),
    ...toArray(obj?.cancellationSubReasons),
    ...toArray(obj?.children),
    ...toArray(obj?.items)
  ];
  const dedupe = new Set();
  const subreasons = rawSub
    .map((sub, subIdx) => normalizeCancellationSubreason(sub, subIdx))
    .filter((sub) => {
      const key = String(sub.code || "").trim().toUpperCase();
      if (!key) return false;
      if (dedupe.has(key)) return false;
      dedupe.add(key);
      return true;
    });

  return {
    code: safeCode,
    label: safeLabel,
    subreasons
  };
}

function normalizeCancellationOptionsPayload(payload) {
  const root = payload && typeof payload === "object" ? payload : {};
  const rows = [
    ...toArray(payload),
    ...toArray(root?.items),
    ...toArray(root?.reasons),
    ...toArray(root?.cancellationReasons),
    ...toArray(root?.cancelReasons),
    ...toArray(root?.data)
  ];
  const dedupe = new Set();
  const normalized = rows
    .map((row, idx) => normalizeCancellationOption(row, idx))
    .filter(Boolean)
    .filter((item) => {
      const key = String(item.code || "").trim().toUpperCase();
      if (!key) return false;
      if (dedupe.has(key)) return false;
      dedupe.add(key);
      return true;
    });

  return normalized;
}

function defaultCancellationOptions() {
  return DEFAULT_MANUAL_CANCEL_OPTIONS.map((item, idx) =>
    normalizeCancellationOption(item, idx)
  ).filter(Boolean);
}

function formatNetworkError(url, error) {
  const code = String(error?.cause?.code || error?.code || "").trim().toUpperCase();
  const rawMessage = String(error?.message || "erro de rede");

  if (String(error?.name || "").toLowerCase() === "aborterror") {
    return `Timeout ao acessar ${url}. Verifique internet, VPN/proxy e firewall.`;
  }

  if (/fetch failed/i.test(rawMessage)) {
    if (code === "ENOTFOUND") {
      return `Dominio nao encontrado ao acessar ${url} (ENOTFOUND). Confira a URL base.`;
    }
    if (code === "ECONNREFUSED") {
      return `Conexao recusada ao acessar ${url} (ECONNREFUSED).`;
    }
    if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
      return `Tempo esgotado ao conectar em ${url} (${code}).`;
    }
    if (code === "ECONNRESET") {
      return `Conexao resetada ao acessar ${url} (ECONNRESET).`;
    }
    return `Falha de rede ao acessar ${url}. Verifique internet, URL e bloqueios locais.`;
  }

  return code ? `${rawMessage} (${code})` : rawMessage;
}

function formatErrorPart(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    return value
      .map((item) => formatErrorPart(item))
      .filter(Boolean)
      .join(" | ");
  }

  if (typeof value === "object") {
    const preferred = [
      value.message,
      value.error,
      value.detail,
      value.description,
      value.reason,
      value.title,
      value.code
    ]
      .map((item) => formatErrorPart(item))
      .filter(Boolean);
    if (preferred.length > 0) return preferred.join(" | ");
    try {
      const json = JSON.stringify(value);
      return json.length > 320 ? `${json.slice(0, 317)}...` : json;
    } catch {
      return "";
    }
  }

  return "";
}

function formatHttpErrorDetails(data, raw) {
  const fromData = formatErrorPart(data?.message || data?.error || data);
  if (fromData) return fromData;
  const fromRaw = String(raw || "").trim();
  if (!fromRaw) return "";
  return fromRaw.length > 320 ? `${fromRaw.slice(0, 317)}...` : fromRaw;
}

function normalizePayment(raw) {
  const key = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (!key) return "ONLINE";
  if (key.includes("PIX")) return "PIX";
  if (key.includes("CASH") || key.includes("DINHEIRO")) return "DINHEIRO";
  if (key.includes("DEBIT")) return "DEBITO";
  if (key.includes("CREDIT") || key.includes("CREDITO")) return "CREDITO";
  if (key.includes("ONLINE")) return "ONLINE";
  return PAYMENT_MAP[key] || "ONLINE";
}

function safeIso(value) {
  const parsed = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function csvList(value) {
  return String(value || "")
    .split(/[;,]+/g)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeMerchantIdList(value) {
  return csvList(value).map((item) => String(item || "").trim().replace(/\s+/g, ""));
}

function isLikelyInvalidPollingMerchantError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return Number(error?.statusCode || 0) === 400 && msg.includes("x-polling-merchants");
}

async function discoverMerchantsFromIfood(token, config) {
  const cfg = config || readConfig();
  const url = resolveUrl(cfg.base_url, "/merchant/v1.0/merchants");
  const response = await httpRequestJson(url, {
    method: "GET",
    headers: buildAuthHeaders(cfg, token),
    timeoutMs: 20000
  });

  const payload = response?.data;
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.merchants)
      ? payload.merchants
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

  const ids = Array.from(
    new Set(
      rows
        .map((item) =>
          pick(
            item?.id,
            item?.merchantId,
            item?.merchant_id,
            item?.uuid,
            item?.code
          )
        )
        .map((id) => String(id || "").trim().replace(/\s+/g, ""))
        .filter(Boolean)
    )
  );

  return ids;
}

function parseEventList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.events)) return payload.events;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.id || payload.eventId || payload.orderId) return [payload];
  return [];
}

function normalizeIfoodEvent(rawEvent = {}) {
  const source = rawEvent && typeof rawEvent === "object" ? rawEvent : {};
  const orderId = pick(source.orderId, source.order_id, source.order?.id, source.order?.orderId);
  const merchantId = pick(source.merchantId, source.merchant_id, source.merchant?.id);
  const fullCode = pick(source.fullCode, source.full_code, source.code);
  const code = pick(source.code, source.eventCode, fullCode);
  const createdAt = pick(source.createdAt, source.created_at, source.date, source.timestamp, new Date().toISOString());
  const idBase = pick(source.id, source.eventId, source.uuid);
  const fingerprint =
    idBase ||
    crypto
      .createHash("sha1")
      .update(JSON.stringify({ orderId, merchantId, fullCode, createdAt, source }))
      .digest("hex");

  return {
    eventId: String(fingerprint).slice(0, 120),
    orderId: String(orderId || "").slice(0, 120),
    merchantId: String(merchantId || "").slice(0, 120),
    code: String(code || "").slice(0, 40),
    fullCode: String(fullCode || "").slice(0, 80),
    createdAt: safeIso(createdAt),
    payload: source
  };
}

function eventSuggestsCancellation(event = {}) {
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const blob = [
    event?.code,
    event?.fullCode,
    payload?.code,
    payload?.fullCode,
    payload?.eventCode,
    payload?.type,
    payload?.status,
    payload?.orderStatus,
    payload?.metadata?.code,
    payload?.metadata?.type,
    payload?.metadata?.reason
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  if (!blob) return false;
  return /(CANCEL|CANCELED|CANCELLED|CANCELLATION|REJECT|DENIED)/.test(blob);
}

function resolveUrl(baseUrl, pathOrUrl, replacements = {}) {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  let rawPath = String(pathOrUrl || "").trim();
  if (!rawPath) rawPath = "/";

  for (const [key, value] of Object.entries(replacements || {})) {
    const token = `{${key}}`;
    rawPath = rawPath.split(token).join(encodeURIComponent(String(value || "")));
  }

  if (/^https?:\/\//i.test(rawPath)) {
    return rawPath;
  }

  if (!base) {
    throw new Error("Base URL iFood nao configurada.");
  }

  const pathWithSlash = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return `${base}${pathWithSlash}`;
}

async function httpRequestJson(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = options.headers || {};
  const timeoutMs = toInt(options.timeoutMs, 15000, 1000, 60000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body,
        signal: controller.signal
      });
    } catch (error) {
      throw new Error(formatNetworkError(url, error));
    }
    const raw = await response.text();
    const data = parseJsonSafe(raw, null);

    if (!response.ok) {
      const details = formatHttpErrorDetails(data, raw);
      const error = new Error(
        `HTTP ${response.status}${details ? ` - ${details}` : ""}`
      );
      error.statusCode = response.status;
      error.responseData = data;
      error.responseText = raw;
      throw error;
    }

    return {
      status: response.status,
      data: data !== null ? data : raw
    };
  } finally {
    clearTimeout(timer);
  }
}

function saveLastSync(message = "") {
  SistemaConfig.setMany({
    [CONFIG_KEYS.lastSyncAt]: new Date().toISOString(),
    [CONFIG_KEYS.lastSyncResult]: String(message || "")
  });
}

function updateEventStatus(eventId, status, error = "", acked = false) {
  updateEventStatusStmt.run(String(status || "PROCESSED"), String(error || ""), acked ? 1 : 0, String(eventId || ""));
}

function insertEventLog(event) {
  const payloadJson = JSON.stringify(event.payload || {});
  const info = insertEventStmt.run(
    event.eventId,
    event.merchantId || "",
    event.orderId || "",
    event.code || "",
    event.fullCode || "",
    event.createdAt || "",
    "RECEIVED",
    "",
    payloadJson
  );
  return Number(info.changes || 0) > 0;
}

function readConfig() {
  return {
    enabled: toBool(SistemaConfig.get(CONFIG_KEYS.enabled, DEFAULTS.enabled ? "1" : "0"), DEFAULTS.enabled),
    base_url: String(SistemaConfig.get(CONFIG_KEYS.baseUrl, DEFAULTS.baseUrl) || DEFAULTS.baseUrl).trim(),
    token_url: String(SistemaConfig.get(CONFIG_KEYS.tokenUrl, DEFAULTS.tokenUrl) || DEFAULTS.tokenUrl).trim(),
    polling_path: String(SistemaConfig.get(CONFIG_KEYS.pollingPath, DEFAULTS.pollingPath) || DEFAULTS.pollingPath).trim(),
    ack_path: String(SistemaConfig.get(CONFIG_KEYS.ackPath, DEFAULTS.ackPath) || DEFAULTS.ackPath).trim(),
    order_details_path: String(
      SistemaConfig.get(CONFIG_KEYS.orderPath, DEFAULTS.orderPath) || DEFAULTS.orderPath
    ).trim(),
    order_details_path_fallback: String(
      SistemaConfig.get(CONFIG_KEYS.orderPathFallback, DEFAULTS.orderPathFallback) || DEFAULTS.orderPathFallback
    ).trim(),
    api_key: String(SistemaConfig.get(CONFIG_KEYS.apiKey, DEFAULTS.apiKey) || "").trim(),
    bearer_token: String(SistemaConfig.get(CONFIG_KEYS.bearerToken, DEFAULTS.bearerToken) || "").trim(),
    access_token: String(SistemaConfig.get(CONFIG_KEYS.accessToken, DEFAULTS.accessToken) || "").trim(),
    access_token_expires_at: String(
      SistemaConfig.get(CONFIG_KEYS.accessTokenExpiresAt, DEFAULTS.accessTokenExpiresAt) || ""
    ).trim(),
    refresh_token: String(SistemaConfig.get(CONFIG_KEYS.refreshToken, DEFAULTS.refreshToken) || "").trim(),
    client_id: String(SistemaConfig.get(CONFIG_KEYS.clientId, DEFAULTS.clientId) || "").trim(),
    client_secret: String(SistemaConfig.get(CONFIG_KEYS.clientSecret, DEFAULTS.clientSecret) || "").trim(),
    grant_type: String(SistemaConfig.get(CONFIG_KEYS.grantType, DEFAULTS.grantType) || DEFAULTS.grantType).trim(),
    authorization_code: String(
      SistemaConfig.get(CONFIG_KEYS.authorizationCode, DEFAULTS.authorizationCode) || ""
    ).trim(),
    scope: String(SistemaConfig.get(CONFIG_KEYS.scope, DEFAULTS.scope) || "").trim(),
    polling_merchants: String(
      SistemaConfig.get(CONFIG_KEYS.pollingMerchants, DEFAULTS.pollingMerchants) || ""
    ).trim(),
    polling_interval_seconds: toInt(
      SistemaConfig.get(CONFIG_KEYS.pollingIntervalSeconds, String(DEFAULTS.pollingIntervalSeconds)),
      DEFAULTS.pollingIntervalSeconds,
      30,
      120
    ),
    polling_exclude_heartbeat: toBool(
      SistemaConfig.get(
        CONFIG_KEYS.pollingExcludeHeartbeat,
        DEFAULTS.pollingExcludeHeartbeat ? "1" : "0"
      ),
      DEFAULTS.pollingExcludeHeartbeat
    ),
    auto_ack: toBool(SistemaConfig.get(CONFIG_KEYS.autoAck, DEFAULTS.autoAck ? "1" : "0"), DEFAULTS.autoAck),
    motoboy_fallback: String(
      SistemaConfig.get(CONFIG_KEYS.motoboyFallback, DEFAULTS.motoboyFallback) || DEFAULTS.motoboyFallback
    ).trim(),
    webhook_secret: String(SistemaConfig.get(CONFIG_KEYS.webhookSecret, DEFAULTS.webhookSecret) || "").trim(),
    webhook_signature_required: toBool(
      SistemaConfig.get(
        CONFIG_KEYS.webhookSignatureRequired,
        DEFAULTS.webhookSignatureRequired ? "1" : "0"
      ),
      DEFAULTS.webhookSignatureRequired
    ),
    last_sync_at: String(SistemaConfig.get(CONFIG_KEYS.lastSyncAt, DEFAULTS.lastSyncAt) || "").trim(),
    last_sync_result: String(SistemaConfig.get(CONFIG_KEYS.lastSyncResult, DEFAULTS.lastSyncResult) || "").trim(),
    last_token_refresh_at: String(
      SistemaConfig.get(CONFIG_KEYS.lastTokenRefreshAt, DEFAULTS.lastTokenRefreshAt) || ""
    ).trim()
  };
}

function saveConfig(input = {}) {
  const current = readConfig();
  const next = {
    ...current,
    enabled: input.enabled === undefined ? current.enabled : toBool(input.enabled, current.enabled),
    base_url: input.base_url === undefined ? current.base_url : String(input.base_url || "").trim(),
    token_url: input.token_url === undefined ? current.token_url : String(input.token_url || "").trim(),
    polling_path: input.polling_path === undefined ? current.polling_path : String(input.polling_path || "").trim(),
    ack_path: input.ack_path === undefined ? current.ack_path : String(input.ack_path || "").trim(),
    order_details_path:
      input.order_details_path === undefined ? current.order_details_path : String(input.order_details_path || "").trim(),
    order_details_path_fallback:
      input.order_details_path_fallback === undefined
        ? current.order_details_path_fallback
        : String(input.order_details_path_fallback || "").trim(),
    api_key: input.api_key === undefined ? current.api_key : String(input.api_key || "").trim(),
    bearer_token: input.bearer_token === undefined ? current.bearer_token : String(input.bearer_token || "").trim(),
    access_token: input.access_token === undefined ? current.access_token : String(input.access_token || "").trim(),
    access_token_expires_at:
      input.access_token_expires_at === undefined
        ? current.access_token_expires_at
        : String(input.access_token_expires_at || "").trim(),
    refresh_token: input.refresh_token === undefined ? current.refresh_token : String(input.refresh_token || "").trim(),
    client_id: input.client_id === undefined ? current.client_id : String(input.client_id || "").trim(),
    client_secret: input.client_secret === undefined ? current.client_secret : String(input.client_secret || "").trim(),
    grant_type: input.grant_type === undefined ? current.grant_type : String(input.grant_type || "").trim(),
    authorization_code:
      input.authorization_code === undefined ? current.authorization_code : String(input.authorization_code || "").trim(),
    scope: input.scope === undefined ? current.scope : String(input.scope || "").trim(),
    polling_merchants:
      input.polling_merchants === undefined ? current.polling_merchants : String(input.polling_merchants || "").trim(),
    polling_interval_seconds:
      input.polling_interval_seconds === undefined
        ? current.polling_interval_seconds
        : toInt(input.polling_interval_seconds, current.polling_interval_seconds, 30, 120),
    polling_exclude_heartbeat:
      input.polling_exclude_heartbeat === undefined
        ? current.polling_exclude_heartbeat
        : toBool(input.polling_exclude_heartbeat, current.polling_exclude_heartbeat),
    auto_ack: input.auto_ack === undefined ? current.auto_ack : toBool(input.auto_ack, current.auto_ack),
    motoboy_fallback:
      input.motoboy_fallback === undefined
        ? current.motoboy_fallback
        : String(input.motoboy_fallback || "").trim().slice(0, 80),
    webhook_secret:
      input.webhook_secret === undefined ? current.webhook_secret : String(input.webhook_secret || "").trim(),
    webhook_signature_required:
      input.webhook_signature_required === undefined
        ? current.webhook_signature_required
        : toBool(input.webhook_signature_required, current.webhook_signature_required)
  };

  SistemaConfig.setMany({
    [CONFIG_KEYS.enabled]: next.enabled ? "1" : "0",
    [CONFIG_KEYS.baseUrl]: next.base_url || "",
    [CONFIG_KEYS.tokenUrl]: next.token_url || "",
    [CONFIG_KEYS.pollingPath]: next.polling_path || "",
    [CONFIG_KEYS.ackPath]: next.ack_path || "",
    [CONFIG_KEYS.orderPath]: next.order_details_path || "",
    [CONFIG_KEYS.orderPathFallback]: next.order_details_path_fallback || "",
    [CONFIG_KEYS.apiKey]: next.api_key || "",
    [CONFIG_KEYS.bearerToken]: next.bearer_token || "",
    [CONFIG_KEYS.accessToken]: next.access_token || "",
    [CONFIG_KEYS.accessTokenExpiresAt]: next.access_token_expires_at || "",
    [CONFIG_KEYS.refreshToken]: next.refresh_token || "",
    [CONFIG_KEYS.clientId]: next.client_id || "",
    [CONFIG_KEYS.clientSecret]: next.client_secret || "",
    [CONFIG_KEYS.grantType]: next.grant_type || "client_credentials",
    [CONFIG_KEYS.authorizationCode]: next.authorization_code || "",
    [CONFIG_KEYS.scope]: next.scope || "",
    [CONFIG_KEYS.pollingMerchants]: next.polling_merchants || "",
    [CONFIG_KEYS.pollingIntervalSeconds]: String(next.polling_interval_seconds || DEFAULTS.pollingIntervalSeconds),
    [CONFIG_KEYS.pollingExcludeHeartbeat]: next.polling_exclude_heartbeat ? "1" : "0",
    [CONFIG_KEYS.autoAck]: next.auto_ack ? "1" : "0",
    [CONFIG_KEYS.motoboyFallback]: next.motoboy_fallback || DEFAULTS.motoboyFallback,
    [CONFIG_KEYS.webhookSecret]: next.webhook_secret || "",
    [CONFIG_KEYS.webhookSignatureRequired]: next.webhook_signature_required ? "1" : "0"
  });

  return readConfig();
}

function loadCachedOrder(orderId, maxAgeMs = ORDER_CACHE_TTL_MS) {
  const orderIdText = String(orderId || "").trim();
  if (!orderIdText) return null;
  const row = cacheOrderGetStmt.get(orderIdText);
  if (!row) return null;
  if (Number.isFinite(Number(maxAgeMs)) && Number(maxAgeMs) >= 0) {
    const fetchedAt = new Date(String(row.fetched_at || ""));
    const fetchedTs = fetchedAt.getTime();
    if (Number.isFinite(fetchedTs)) {
      const age = Date.now() - fetchedTs;
      if (age > Number(maxAgeMs)) {
        return null;
      }
    }
  }
  return parseJsonSafe(row.payload_json, null);
}

function saveCachedOrder(orderId, payload = {}) {
  const orderIdText = String(orderId || "").trim();
  if (!orderIdText) return;
  cacheOrderUpsertStmt.run(orderIdText, JSON.stringify(payload || {}));
}

function buildAuthHeaders(config, token = "") {
  const headers = {
    accept: "application/json"
  };
  if (config.api_key) headers["x-api-key"] = config.api_key;
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

function isTokenStillValid(expiresAt) {
  const parsed = new Date(String(expiresAt || ""));
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() - Date.now() > 60000;
}

async function refreshAccessToken(force = false) {
  const config = readConfig();
  if (!force && config.access_token && isTokenStillValid(config.access_token_expires_at)) {
    return {
      access_token: config.access_token,
      expires_at: config.access_token_expires_at,
      reused: true
    };
  }

  if (!config.client_id || !config.client_secret) {
    throw new Error("Configure client_id e client_secret do iFood para renovar token automaticamente.");
  }

  const tokenUrl = resolveUrl(config.base_url, config.token_url || DEFAULTS.tokenUrl);
  const grantType = String(config.grant_type || "client_credentials").trim() || "client_credentials";
  const body = new URLSearchParams();
  body.set("grantType", grantType);
  body.set("grant_type", grantType);
  body.set("clientId", config.client_id);
  body.set("client_id", config.client_id);
  body.set("clientSecret", config.client_secret);
  body.set("client_secret", config.client_secret);

  if (config.scope) {
    body.set("scope", config.scope);
  }

  if (grantType === "authorization_code" && config.authorization_code) {
    body.set("authorizationCode", config.authorization_code);
    body.set("authorization_code", config.authorization_code);
  }

  if (grantType === "refresh_token" && config.refresh_token) {
    body.set("refreshToken", config.refresh_token);
    body.set("refresh_token", config.refresh_token);
  }

  const headers = {
    "content-type": "application/x-www-form-urlencoded",
    ...buildAuthHeaders(config)
  };
  delete headers.authorization;

  const basicHeaders = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
    ...(config.api_key ? { "x-api-key": config.api_key } : {}),
    authorization: `Basic ${Buffer.from(`${config.client_id}:${config.client_secret}`).toString("base64")}`
  };

  const basicBody = new URLSearchParams();
  basicBody.set("grant_type", grantType);
  if (config.scope) basicBody.set("scope", config.scope);
  if (grantType === "authorization_code" && config.authorization_code) {
    basicBody.set("code", config.authorization_code);
    basicBody.set("authorization_code", config.authorization_code);
  }
  if (grantType === "refresh_token" && config.refresh_token) {
    basicBody.set("refresh_token", config.refresh_token);
  }

  let response;
  let firstError = null;
  try {
    response = await httpRequestJson(tokenUrl, {
      method: "POST",
      headers,
      body: body.toString(),
      timeoutMs: 20000
    });
  } catch (error) {
    firstError = error;
    response = await httpRequestJson(tokenUrl, {
      method: "POST",
      headers: basicHeaders,
      body: basicBody.toString(),
      timeoutMs: 20000
    });
  }
  const data = response.data && typeof response.data === "object" ? response.data : {};
  const accessToken = pick(data.accessToken, data.access_token, data.token);
  if (!accessToken) {
    if (firstError) {
      throw firstError;
    }
    throw new Error("Resposta de token iFood sem access_token.");
  }
  const expiresIn = toInt(pick(data.expiresIn, data.expires_in, data.expires), 3600, 60, 86400);
  const expiresAt = new Date(Date.now() + Math.max(60, expiresIn - 30) * 1000).toISOString();
  const refreshToken = pick(data.refreshToken, data.refresh_token, config.refresh_token);

  SistemaConfig.setMany({
    [CONFIG_KEYS.accessToken]: accessToken,
    [CONFIG_KEYS.accessTokenExpiresAt]: expiresAt,
    [CONFIG_KEYS.refreshToken]: refreshToken || "",
    [CONFIG_KEYS.lastTokenRefreshAt]: new Date().toISOString()
  });

  return {
    access_token: accessToken,
    expires_at: expiresAt,
    reused: false
  };
}

async function resolveAccessToken() {
  const config = readConfig();
  if (config.bearer_token) {
    return config.bearer_token;
  }
  if (config.access_token && isTokenStillValid(config.access_token_expires_at)) {
    return config.access_token;
  }
  const renewed = await refreshAccessToken(false);
  return renewed.access_token;
}

function extractPaymentsFromOrder(order = {}) {
  const out = [];
  const possible = [
    order?.payments,
    order?.payment_methods,
    order?.paymentMethods,
    order?.payment?.methods,
    order?.payment?.items
  ];
  for (const list of possible) {
    let rows = [];
    if (Array.isArray(list)) {
      rows = list;
    } else if (list && typeof list === "object") {
      if (Array.isArray(list.methods)) {
        rows = list.methods;
      } else if (Array.isArray(list.items)) {
        rows = list.items;
      }
    }
    if (rows.length < 1) continue;
    for (const item of rows) {
      const method = pick(item?.method, item?.type, item?.name, item?.description);
      const amount = Number(
        item?.amount ??
          item?.value ??
          item?.valor ??
          item?.pending ??
          item?.paidValue ??
          item?.price ??
          0
      );
      out.push({
        method: normalizePayment(method),
        amount: Number.isFinite(amount) ? amount : 0
      });
    }
  }

  if (out.length < 1) {
    const fallback = normalizePayment(
      pick(order?.payment?.type, order?.payment?.method, order?.paymentType, "ONLINE")
    );
    out.push({
      method: fallback,
      amount: Number(order?.total?.orderAmount || order?.orderAmount || order?.total || 0) || 0
    });
  }
  return out;
}

function singlePaymentFromOrder(order = {}) {
  const payments = extractPaymentsFromOrder(order);
  const unique = Array.from(
    new Set(
      payments
        .filter((item) => Number(item.amount || 0) > 0)
        .map((item) => String(item.method || "").trim())
        .filter(Boolean)
    )
  );

  if (unique.length > 1) {
    throw new Error("Pedido iFood com mais de uma forma de pagamento (nao homologado para modulo entregas).");
  }
  if (unique.length === 1) return unique[0];
  return normalizePayment(payments[0]?.method || "ONLINE");
}

function toMoney(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeOrderStatus(value) {
  const txt = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (!txt) return "RECEIVED";
  return txt.slice(0, 48);
}

function inferOrderType(order = {}) {
  const raw = pick(
    order?.orderType,
    order?.type,
    order?.fulfillment?.type,
    order?.delivery?.mode,
    order?.deliveryMode
  );
  const key = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (!key) return "ENTREGA";
  if (key.includes("PICKUP") || key.includes("TAKEOUT") || key.includes("RETIR")) {
    return "RETIRADA_LOCAL";
  }
  if (key.includes("DELIVERY") || key.includes("ENTREGA")) {
    return "ENTREGA";
  }
  return key.slice(0, 40);
}

function extractScheduling(order = {}) {
  const timingRaw = pick(order?.orderTiming, order?.timing, order?.schedule?.mode, order?.mode);
  const modeText =
    timingRaw && typeof timingRaw === "object"
      ? pick(timingRaw?.mode, timingRaw?.type, timingRaw?.kind, timingRaw?.value)
      : timingRaw;
  const mode = String(modeText || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  const isImmediateMode = mode.includes("IMMEDIATE") || mode.includes("ASAP");
  const isScheduledMode = mode.includes("SCHEDULE");

  const scheduleStartRaw = pick(
    order?.schedule?.deliveryDateTimeStart,
    order?.schedule?.dateTimeStart,
    order?.schedule?.scheduledDateTime,
    order?.schedule?.dateTime,
    order?.orderTiming?.scheduledDateTime,
    order?.orderTiming?.scheduleDateTime,
    order?.scheduledAt,
    order?.scheduled_for
  );
  const scheduleEndRaw = pick(
    order?.schedule?.deliveryDateTimeEnd,
    order?.schedule?.dateTimeEnd,
    order?.orderTiming?.scheduledDateTimeEnd,
    order?.orderTiming?.scheduleDateTimeEnd
  );
  const deliveryEtaRaw = pick(
    order?.delivery?.deliveryDateTime,
    order?.takeout?.takeoutDateTime,
    order?.dineIn?.deliveryDateTime,
    order?.indoor?.deliveryDateTime
  );

  const hasScheduleWindow = Boolean(scheduleStartRaw || scheduleEndRaw);
  const isScheduled = !isImmediateMode && (isScheduledMode || hasScheduleWindow);
  const scheduleStartIso = isScheduled && scheduleStartRaw ? safeIso(scheduleStartRaw) : null;
  const scheduleEndIso = isScheduled && scheduleEndRaw ? safeIso(scheduleEndRaw) : null;
  const scheduledAtIso =
    scheduleStartIso || (isScheduled && deliveryEtaRaw ? safeIso(deliveryEtaRaw) : null);
  const deliveryEtaIso = !isScheduled && deliveryEtaRaw ? safeIso(deliveryEtaRaw) : null;

  return {
    mode: mode || (isScheduled ? "SCHEDULED" : "IMMEDIATE"),
    is_scheduled: Boolean(isScheduled),
    scheduled_at: scheduledAtIso,
    scheduled_window_start: scheduleStartIso,
    scheduled_window_end: scheduleEndIso,
    delivery_eta_at: deliveryEtaIso
  };
}

function extractVoucher(order = {}) {
  const groups = [
    order?.benefits,
    order?.discounts,
    order?.promotions,
    order?.payments?.benefits,
    order?.total?.benefits
  ];

  const rows = [];
  for (const list of groups) {
    if (Array.isArray(list)) {
      for (const item of list) rows.push(item);
    } else if (list && typeof list === "object") {
      rows.push(list);
    }
  }

  let code = "";
  let value = 0;
  for (const item of rows) {
    const itemCode = pick(
      item?.voucherCode,
      item?.couponCode,
      item?.code,
      item?.promotionCode,
      item?.id
    );
    const itemValue = toMoney(
      pick(item?.discountAmount, item?.amount, item?.value, item?.discount, item?.total),
      0
    );
    if (!code && itemCode) code = String(itemCode).trim().slice(0, 80);
    if (itemValue > 0) value += itemValue;
  }

  if (value <= 0) {
    value = toMoney(
      pick(order?.total?.discount, order?.total?.discountAmount, order?.total?.benefitsAmount),
      0
    );
  }

  return {
    has_voucher: Boolean(code || value > 0),
    code: code || "",
    value: Number(value || 0)
  };
}

function extractCustomer(order = {}) {
  const customer = order?.customer || {};
  const name = pick(customer?.name, customer?.fullName, customer?.firstName);
  const document = pick(
    customer?.documentNumber,
    customer?.document,
    customer?.document_number,
    customer?.documento,
    customer?.cpf,
    customer?.cnpj,
    customer?.taxPayerIdentificationNumber,
    customer?.taxpayerIdentificationNumber,
    customer?.cpfCnpj,
    order?.customer?.documentNumber,
    order?.customer?.document,
    order?.customer?.document_number,
    order?.customer?.documento,
    order?.customer?.cpf,
    order?.customer?.cnpj,
    order?.invoice?.documentNumber,
    order?.invoice?.document,
    order?.invoice?.document_number,
    order?.invoice?.cpf,
    order?.invoice?.cnpj,
    order?.invoice?.cpfCnpj
  );
  return {
    nome: String(name || "").trim().slice(0, 120),
    documento: String(document || "").trim().slice(0, 32)
  };
}

function extractOrderItems(order = {}) {
  const groups = [order?.items, order?.orderItems, order?.cart?.items, order?.basket?.items];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    return group
      .map((item) => {
        const quantity = Number(item?.quantity ?? item?.qty ?? item?.amount ?? 1);
        const unit = toMoney(pick(item?.unitPrice, item?.price, item?.value), 0);
        const total = toMoney(pick(item?.total, item?.totalPrice, item?.priceTotal), unit * (quantity || 1));
        const observation = pick(
          item?.observation,
          item?.observations,
          item?.notes,
          item?.comment,
          item?.note,
          item?.instructions,
          item?.specialInstructions,
          item?.customerNotes,
          item?.customerNote,
          item?.additionalInfo
        );
        return {
          sku: String(pick(item?.sku, item?.id, item?.code) || "").trim().slice(0, 60),
          nome: String(pick(item?.name, item?.description, item?.title) || "").trim().slice(0, 120),
          quantidade: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
          preco_unitario: Number(unit || 0),
          total: Number(total || 0),
          observacao: String(observation || "").trim().slice(0, 240),
          options: toArray(item?.options).slice(0, 24),
          modifiers: toArray(item?.modifiers).slice(0, 24),
          addons: toArray(item?.addons).slice(0, 24),
          extras: toArray(item?.extras).slice(0, 24),
          complements: toArray(item?.complements).slice(0, 24),
          customizations: toArray(item?.customizations).slice(0, 24)
        };
      })
      .filter((item) => item.nome);
  }
  return [];
}

function extractCashChange(order = {}, payments = []) {
  const paymentRows = Array.isArray(payments) ? payments : extractPaymentsFromOrder(order);
  const hasCash = paymentRows.some((item) => normalizePayment(item?.method) === "DINHEIRO");

  const cashCandidates = [];
  for (const row of paymentRows) {
    cashCandidates.push(
      row?.changeFor,
      row?.change_for,
      row?.change,
      row?.cashChangeFor,
      row?.cash?.changeFor,
      row?.cash?.change_for,
      row?.cash?.change,
      row?.cash?.cashChangeFor
    );
  }
  const methodRows = Array.isArray(order?.payments?.methods) ? order.payments.methods : [];
  for (const row of methodRows) {
    cashCandidates.push(
      row?.cash?.changeFor,
      row?.cash?.change_for,
      row?.cash?.change,
      row?.cash?.cashChangeFor,
      row?.changeFor,
      row?.change_for,
      row?.change,
      row?.cashChangeFor
    );
  }
  cashCandidates.push(
    order?.payment?.changeFor,
    order?.payment?.change_for,
    order?.payments?.changeFor,
    order?.payments?.cash?.changeFor,
    order?.payments?.cash?.change_for,
    order?.payments?.cash?.change,
    order?.payments?.cashChangeFor,
    order?.changeFor,
    order?.cashChangeFor
  );

  for (const candidate of cashCandidates) {
    const amount = toMoney(candidate, 0);
    if (amount > 0) return amount;
  }
  if (hasCash) {
    const rawCashMethods = Array.isArray(order?.payments?.methods)
      ? order.payments.methods.filter((item) => normalizePayment(item?.method || item?.type) === "DINHEIRO")
      : [];
    if (rawCashMethods.length > 0) {
      const firstAmount = toMoney(rawCashMethods[0]?.value ?? rawCashMethods[0]?.amount, 0);
      if (firstAmount > 0) return firstAmount;
    }
  }
  return 0;
}

function extractCancellation(order = {}) {
  const status = normalizeOrderStatus(pick(order?.orderStatus, order?.status, order?.state));
  const list = Array.isArray(order?.cancellations) ? order.cancellations : [];
  const lastCancellation = list.length > 0 ? list[list.length - 1] : null;
  const cancel = order?.cancellation || order?.cancellationInfo || order?.cancelInfo || lastCancellation || {};
  const reason = pick(
    cancel?.reason,
    cancel?.description,
    cancel?.message,
    cancel?.cancellationReason,
    order?.cancellationReason
  );
  const source = pick(cancel?.cancelledBy, cancel?.actor, cancel?.origin, order?.cancelledBy);
  const canceledAt = pick(cancel?.cancelledAt, cancel?.createdAt, order?.cancelledAt);
  const isCancelled =
    status.includes("CANCEL") ||
    Boolean(reason) ||
    Boolean(canceledAt) ||
    String(source || "")
      .toUpperCase()
      .includes("PLATFORM");

  return {
    is_cancelled: Boolean(isCancelled),
    reason: String(reason || "").trim().slice(0, 240),
    source: String(source || "").trim().slice(0, 80),
    canceled_at: isCancelled ? safeIso(canceledAt || new Date().toISOString()) : null
  };
}

function buildOrderResumo(order = {}, fallbackOrderId = "", payment = "ONLINE") {
  const externalId = pick(order?.id, order?.orderId, fallbackOrderId);
  const displayId = pick(
    order?.displayId,
    order?.display_id,
    order?.orderNumber,
    order?.order_number,
    order?.shortReference,
    order?.referenceCode,
    externalId
  );
  const createdAt = pick(order?.createdAt, order?.created_at, order?.preparationStartDateTime, new Date().toISOString());
  const scheduling = extractScheduling(order);
  const voucher = extractVoucher(order);
  const customer = extractCustomer(order);
  const items = extractOrderItems(order);
  const payments = extractPaymentsFromOrder(order);
  const cancellation = extractCancellation(order);
  const cashChangeFor = extractCashChange(order, payments);
  const notes = pick(
    order?.observation,
    order?.observations,
    order?.notes,
    order?.comment,
    order?.comments,
    order?.instructions,
    order?.specialInstructions,
    order?.additionalInfo,
    order?.delivery?.observation,
    order?.delivery?.observations,
    order?.delivery?.instructions,
    order?.delivery?.notes,
    order?.customer?.observation,
    order?.customer?.observations,
    order?.customer?.notes
  );
  const status = normalizeOrderStatus(pick(order?.orderStatus, order?.status, order?.state, "RECEIVED"));
  const orderType = inferOrderType(order);

  return {
    source: "IFOOD",
    order_id: String(externalId || "").trim().slice(0, 120),
    display_id: String(displayId || "").trim().slice(0, 80),
    status,
    created_at: safeIso(createdAt),
    order_type: orderType,
    scheduling,
    voucher,
    customer,
    notes: String(notes || "").trim().slice(0, 320),
    cancellation,
    cash_change_for: Number(cashChangeFor || 0),
    totals: {
      subtotal: toMoney(pick(order?.total?.subTotal, order?.total?.subtotal, order?.subtotal), 0),
      discount: Number(voucher.value || 0),
      total: toMoney(pick(order?.total?.orderAmount, order?.total?.total, order?.orderAmount, order?.total), 0)
    },
    payments: payments.map((p) => ({
      method: normalizePayment(p?.method),
      amount: Number(p?.amount || 0)
    })),
    items: items.slice(0, 80),
    scenario_flags: {
      agendado_com_voucher: Boolean(scheduling.is_scheduled && voucher.has_voucher),
      pedido_manual_cancelamento: Boolean(cancellation.is_cancelled),
      retirada_local: orderType === "RETIRADA_LOCAL",
      cancelamento_plataforma: Boolean(
        cancellation.is_cancelled &&
          String(cancellation.source || "")
            .toUpperCase()
            .includes("PLATFORM")
      ),
      dinheiro_com_troco: Boolean(normalizePayment(payment) === "DINHEIRO" && cashChangeFor > 0),
      cliente_documentado: Boolean(customer.documento)
    },
    raw_order: order
  };
}

function normalizeOrderToEntrega(order = {}, fallbackOrderId = "", config = null) {
  const cfg = config || readConfig();
  const numero = pick(
    order?.displayId,
    order?.display_id,
    order?.orderNumber,
    order?.order_number,
    order?.shortReference,
    order?.referenceCode,
    order?.id,
    fallbackOrderId
  );
  const createdAt = pick(order?.createdAt, order?.created_at, order?.preparationStartDateTime, new Date().toISOString());
  const payment = singlePaymentFromOrder(order);
  const motoboy = pick(cfg.motoboy_fallback, "iFood");
  const resumo = buildOrderResumo(order, fallbackOrderId, payment);
  const scheduling = resumo?.scheduling && typeof resumo.scheduling === "object" ? resumo.scheduling : {};
  const whenISOBase = scheduling?.is_scheduled
    ? pick(scheduling?.scheduled_window_start, scheduling?.scheduled_at, createdAt)
    : pick(createdAt, scheduling?.delivery_eta_at, scheduling?.scheduled_at);

  if (!numero) {
    throw new Error("Nao foi possivel identificar numero do pedido iFood.");
  }

  return {
    motoboy,
    pedido: {
      numero: String(numero).slice(0, 80),
      source: "IFOOD",
      payment,
      whenISO: safeIso(whenISOBase),
      external_id: String(resumo.order_id || "").slice(0, 120),
      status: String(resumo.status || "RECEIVED").slice(0, 48),
      detalhes: resumo
    }
  };
}

async function fetchOrderDetails(orderId, token, config = null, options = {}) {
  const cfg = config || readConfig();
  const orderIdText = String(orderId || "").trim();
  if (!orderIdText) {
    throw new Error("Evento iFood sem orderId.");
  }

  const bypassCache = Boolean(options?.bypassCache);
  const cached = bypassCache ? null : loadCachedOrder(orderIdText);
  if (cached && typeof cached === "object") {
    return cached;
  }

  const headers = buildAuthHeaders(cfg, token);
  const paths = [cfg.order_details_path, cfg.order_details_path_fallback].filter(Boolean);
  let lastError = null;

  for (const candidate of paths) {
    const url = resolveUrl(cfg.base_url, candidate, { orderId: orderIdText });
    try {
      const response = await httpRequestJson(url, {
        method: "GET",
        headers,
        timeoutMs: 15000
      });
      const payload = response.data;
      if (payload && typeof payload === "object") {
        saveCachedOrder(orderIdText, payload);
        return payload;
      }
      const fallbackPayload = { id: orderIdText };
      saveCachedOrder(orderIdText, fallbackPayload);
      return fallbackPayload;
    } catch (error) {
      lastError = error;
      if (Number(error?.statusCode || 0) === 404) {
        continue;
      }
      throw error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  const fallbackPayload = { id: orderIdText };
  saveCachedOrder(orderIdText, fallbackPayload);
  return fallbackPayload;
}

function isLikelyAlreadyLifecycleActionError(error) {
  const code = Number(error?.statusCode || 0);
  const msg = String(error?.message || "").toLowerCase();
  if (code === 409 || code === 422) return true;
  return (
    msg.includes("already") ||
    msg.includes("already dispatched") ||
    msg.includes("already confirmed") ||
    msg.includes("already ready") ||
    msg.includes("already in") ||
    msg.includes("invalid transition") ||
    msg.includes("cannot transition")
  );
}

function isLikelyAlreadyCancelledError(error) {
  const code = Number(error?.statusCode || 0);
  const msg = String(error?.message || "").toLowerCase();
  if (code === 409 || code === 410 || code === 422) return true;
  return (
    msg.includes("already") ||
    msg.includes("already canceled") ||
    msg.includes("already cancelled") ||
    msg.includes("already canceled order") ||
    msg.includes("invalid transition") ||
    msg.includes("cannot transition")
  );
}

function normalizeLifecycleAction(action = "") {
  const raw = String(action || "")
    .trim()
    .toLowerCase();
  if (raw === "ready" || raw === "readytopickup" || raw === "ready_to_pickup") return "readyToPickup";
  if (raw === "confirm") return "confirm";
  if (raw === "dispatch") return "dispatch";
  if (raw === "startpreparation" || raw === "start_preparation") return "startPreparation";
  return "dispatch";
}

function resolveLifecycleActionFromContext(context = {}) {
  const explicitAction = normalizeLifecycleAction(context?.action || "");
  if (explicitAction && context?.action) return explicitAction;
  const orderType = String(context?.order_type || context?.orderType || "")
    .trim()
    .toUpperCase();
  if (orderType.includes("RETIR") || orderType.includes("TAKEOUT") || orderType.includes("PICKUP")) {
    return "readyToPickup";
  }
  return "dispatch";
}

function lifecycleActionPaths(action = "dispatch") {
  const safeAction = normalizeLifecycleAction(action);
  return [
    `/order/v1.0/orders/{orderId}/${safeAction}`,
    `/orders/{orderId}/${safeAction}`
  ];
}

function lifecycleActionPayload(action = "dispatch", context = {}) {
  const safeAction = normalizeLifecycleAction(action);
  if (safeAction === "dispatch") {
    return compactObject({
      source: "PDV_GASTROCODE",
      reason: "AUTO_ASSIGN_MOTOBOY",
      motoboy: String(context?.motoboy || "").trim()
    });
  }
  return {};
}

async function requestOrderLifecycleAction(orderId, action = "dispatch", context = {}) {
  const cfg = readConfig();
  const safeAction = normalizeLifecycleAction(action);
  if (!cfg.enabled) {
    return {
      attempted: false,
      ok: false,
      provider: "ifood",
      order_id: String(orderId || "").trim(),
      action: safeAction,
      message: "Integracao iFood desativada."
    };
  }

  const orderIdText = String(orderId || "").trim();
  if (!orderIdText) {
    return {
      attempted: false,
      ok: false,
      provider: "ifood",
      order_id: "",
      action: safeAction,
      message: "Pedido sem ID externo para acao no iFood."
    };
  }

  const token = await resolveAccessToken();
  const headers = {
    ...buildAuthHeaders(cfg, token),
    "content-type": "application/json"
  };
  const bodyPayload = lifecycleActionPayload(safeAction, context);
  const bodyJson = JSON.stringify(bodyPayload || {});

  let lastError = null;
  for (const path of lifecycleActionPaths(safeAction)) {
    const url = resolveUrl(cfg.base_url, path, { orderId: orderIdText });
    try {
      await httpRequestJson(url, {
        method: "POST",
        headers,
        body: bodyJson,
        timeoutMs: 20000
      });
      return {
        attempted: true,
        ok: true,
        provider: "ifood",
        order_id: orderIdText,
        action: safeAction,
        endpoint: path,
        message: `Acao ${safeAction} enviada ao iFood.`
      };
    } catch (error) {
      lastError = error;
      const statusCode = Number(error?.statusCode || 0);
      if (isLikelyAlreadyLifecycleActionError(error)) {
        return {
          attempted: true,
          ok: true,
          already_applied: true,
          provider: "ifood",
          order_id: orderIdText,
          action: safeAction,
          endpoint: path,
          message: `Pedido ja estava com a acao ${safeAction} aplicada no iFood.`
        };
      }
      if (statusCode === 404 || statusCode === 405) continue;
      break;
    }
  }

  return {
    attempted: true,
    ok: false,
    provider: "ifood",
    order_id: orderIdText,
    action: safeAction,
    message: `Falha na acao ${safeAction} do iFood: ${String(lastError?.message || "endpoint indisponivel")}`
  };
}

async function autoDispatchOrder(orderId, context = {}) {
  const action = resolveLifecycleActionFromContext(context || {});
  const result = await requestOrderLifecycleAction(orderId, action, context || {});
  if (result?.ok) {
    if (action === "readyToPickup") {
      return {
        ...result,
        message: result?.already_applied
          ? "Pedido ja estava pronto para retirada no iFood."
          : "Pedido marcado como pronto para retirada no iFood."
      };
    }
    return {
      ...result,
      message: result?.already_applied
        ? "Pedido ja estava despachado no iFood."
        : "Pedido despachado automaticamente no iFood."
    };
  }
  return result;
}

async function confirmOrder(orderId, context = {}) {
  const result = await requestOrderLifecycleAction(orderId, "confirm", context || {});
  if (result?.ok) {
    return {
      ...result,
      message: result?.already_applied
        ? "Pedido ja estava confirmado no iFood."
        : "Pedido confirmado no iFood."
    };
  }
  return result;
}

async function listManualCancellationOptions(orderId = "") {
  const cfg = readConfig();
  const fallbackItems = defaultCancellationOptions();
  const orderIdText = String(orderId || "").trim();

  if (!cfg.enabled) {
    return {
      provider: "ifood",
      source: "fallback",
      items: fallbackItems,
      warning: "Integracao iFood desativada.",
      codes_safe_for_ifood: false
    };
  }

  let token = "";
  try {
    token = await resolveAccessToken();
  } catch (error) {
    return {
      provider: "ifood",
      source: "fallback",
      items: fallbackItems,
      warning: `Falha ao autenticar no iFood: ${String(error?.message || "token indisponivel")}`,
      codes_safe_for_ifood: false
    };
  }

  if (!orderIdText) {
    return {
      provider: "ifood",
      source: "fallback",
      items: fallbackItems,
      warning: "Pedido sem ID externo para consultar codigos de cancelamento no iFood.",
      codes_safe_for_ifood: false
    };
  }

  const headers = buildAuthHeaders(cfg, token);
  const pathCandidates = [
    "/order/v1.0/orders/{orderId}/cancellationReasons",
    "/order/v1.0/orders/{orderId}/cancellation-reasons",
    "/orders/{orderId}/cancellationReasons",
    "/orders/{orderId}/cancellation-reasons"
  ];

  let lastError = null;
  for (const path of pathCandidates) {
    const url = resolveUrl(cfg.base_url, path, { orderId: orderIdText });
    try {
      const response = await httpRequestJson(url, {
        method: "GET",
        headers,
        timeoutMs: 20000
      });
      if (Number(response?.status || 0) === 204) {
        return {
          provider: "ifood",
          source: "ifood_api",
          endpoint: path,
          items: [],
          warning: "Pedido sem motivos disponiveis para cancelamento neste momento.",
          codes_safe_for_ifood: true
        };
      }
      const items = normalizeCancellationOptionsPayload(response?.data).filter(
        (item) => !isGeneratedCancellationCode(item?.code)
      );
      if (items.length > 0) {
        return {
          provider: "ifood",
          source: "ifood_api",
          endpoint: path,
          items,
          codes_safe_for_ifood: true
        };
      }
    } catch (error) {
      lastError = error;
      const code = Number(error?.statusCode || 0);
      if (code === 404 || code === 405) continue;
      break;
    }
  }

  return {
    provider: "ifood",
    source: "fallback",
    items: fallbackItems,
    warning: lastError ? String(lastError.message || "Nao foi possivel listar motivos no iFood.") : "",
    codes_safe_for_ifood: false
  };
}

function dedupeCancelPayloadVariants(variants = []) {
  const seen = new Set();
  const output = [];
  for (const item of Array.isArray(variants) ? variants : []) {
    if (!item || typeof item !== "object") continue;
    const mode = String(item.mode || "default").trim() || "default";
    const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
    const signature = `${mode}:${JSON.stringify(payload)}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    output.push({ mode, payload });
  }
  return output;
}

function buildCancelPayloadVariants(context = {}) {
  const reasonCode = String(context?.reasonCode || "").trim().slice(0, 180);
  const reasonLabel = String(context?.reasonLabel || reasonCode || "").trim().slice(0, 180);
  const subreasonCode = String(context?.subreasonCode || "").trim().slice(0, 120);
  const description = String(
    context?.description || reasonLabel || reasonCode || "Cancelamento solicitado no sistema"
  )
    .trim()
    .slice(0, 240);

  const cancellationCodeNumberRaw = Number(context?.cancellationCodeValue);
  const cancellationCodeNumber =
    Number.isFinite(cancellationCodeNumberRaw) && cancellationCodeNumberRaw > 0
      ? Math.round(cancellationCodeNumberRaw)
      : null;

  const variants = [
    {
      mode: "request_cancellation_code_string",
      payload: compactObject({
        cancellationCode: reasonCode || undefined,
        subCancellationCode: subreasonCode || undefined,
        description
      })
    }
  ];

  if (cancellationCodeNumber) {
    variants.push({
      mode: "request_cancellation_code_number",
      payload: compactObject({
        cancellationCode: cancellationCodeNumber,
        subCancellationCode: subreasonCode || undefined,
        description
      })
    });
  }

  variants.push(
    {
      mode: "request_reason_code_contract",
      payload: compactObject({
        reasonCode: reasonCode || undefined,
        subReasonCode: subreasonCode || undefined,
        description
      })
    },
    {
      mode: "request_reason_only_contract",
      payload: compactObject({
        reason: reasonLabel || reasonCode || undefined,
        description
      })
    }
  );

  return dedupeCancelPayloadVariants(variants);
}

function shouldRetryCancelOnAnotherContract(error) {
  const statusCode = Number(error?.statusCode || 0);
  if (statusCode === 401 || statusCode === 403) return false;
  if (statusCode === 404 || statusCode === 405) return true;
  if (statusCode === 400 || statusCode === 406 || statusCode === 409 || statusCode === 412 || statusCode === 415 || statusCode === 422) {
    return true;
  }
  if (statusCode >= 500 && statusCode <= 599) return true;
  const message = String(error?.message || "").toLowerCase();
  if (
    message.includes("invalid model") ||
    message.includes("unsupported cancellationcode") ||
    message.includes("no route matched") ||
    message.includes("validation") ||
    message.includes("invalidparameter")
  ) {
    return true;
  }
  return false;
}

async function manualCancelOrder(orderId, context = {}) {
  const cfg = readConfig();
  if (!cfg.enabled) {
    return {
      attempted: false,
      ok: false,
      provider: "ifood",
      order_id: String(orderId || "").trim(),
      message: "Integracao iFood desativada."
    };
  }

  const orderIdText = String(orderId || "").trim();
  if (!orderIdText) {
    return {
      attempted: false,
      ok: false,
      provider: "ifood",
      order_id: "",
      message: "Pedido sem ID externo para cancelamento."
    };
  }

  const token = await resolveAccessToken();
  const headers = {
    ...buildAuthHeaders(cfg, token),
    "content-type": "application/json"
  };

  const pathCandidates = [
    "/order/v1.0/orders/{orderId}/requestCancellation",
    "/order/v1.0/orders/{orderId}/request-cancellation",
    "/orders/{orderId}/requestCancellation",
    "/orders/{orderId}/request-cancellation"
  ];

  let reasonCode = String(
    context?.reason_code ||
      context?.reasonCode ||
      context?.reason ||
      "CANCELADO_PELO_ESTABELECIMENTO"
  )
    .trim()
    .slice(0, 180);
  const reasonLabel = String(context?.reason_label || context?.reasonLabel || reasonCode)
    .trim()
    .slice(0, 180);
  const subreasonCode = String(
    context?.subreason_code || context?.subreasonCode || context?.subReasonCode || ""
  )
    .trim()
    .slice(0, 120);
  const description = String(
    context?.description ||
      context?.observacao ||
      context?.observation ||
      context?.note ||
      reasonLabel
  )
    .trim()
    .slice(0, 240);

  if (isGeneratedCancellationCode(reasonCode)) {
    try {
      const options = await listManualCancellationOptions(orderIdText);
      const items = Array.isArray(options?.items) ? options.items : [];
      const wantedLabel = normalizeTextKey(reasonLabel || context?.reason || "");
      const match = items.find((item) => normalizeTextKey(item?.label || "") === wantedLabel);
      if (match && !isGeneratedCancellationCode(match.code)) {
        reasonCode = String(match.code || "").trim().slice(0, 180);
      }
    } catch {
      // segue com validacao logo abaixo
    }
  }

  if (isGeneratedCancellationCode(reasonCode)) {
    throw new Error(
      "Motivo de cancelamento sem codigo valido no iFood. Reabra o cancelamento e selecione um motivo oficial da API."
    );
  }
  const reasonCodeNumber = Number(reasonCode);
  const cancellationCodeValue =
    Number.isFinite(reasonCodeNumber) && reasonCodeNumber > 0 ? Math.round(reasonCodeNumber) : null;

  let lastError = null;
  let lastAttempt = null;
  let stopByAuthError = false;
  const methodCandidates = ["POST"];
  for (const path of pathCandidates) {
    const url = resolveUrl(cfg.base_url, path, { orderId: orderIdText });
    const payloadVariants = buildCancelPayloadVariants({
      reasonCode,
      reasonLabel,
      subreasonCode,
      description,
      cancellationCodeValue
    });

    let skipCurrentPath = false;
    for (const method of methodCandidates) {
      if (skipCurrentPath || stopByAuthError) break;
      for (const payloadVariant of payloadVariants) {
        if (skipCurrentPath || stopByAuthError) break;
        try {
          await httpRequestJson(url, {
            method,
            headers,
            body: JSON.stringify(payloadVariant.payload),
            timeoutMs: 20000
          });
          return {
            attempted: true,
            ok: true,
            provider: "ifood",
            order_id: orderIdText,
            endpoint: path,
            method,
            payload_mode: payloadVariant.mode,
            message: "Pedido cancelado manualmente no iFood."
          };
        } catch (error) {
          lastError = error;
          lastAttempt = {
            path,
            method,
            mode: payloadVariant.mode
          };

          const statusCode = Number(error?.statusCode || 0);
          if (isLikelyAlreadyCancelledError(error)) {
            return {
              attempted: true,
              ok: true,
              already_cancelled: true,
              provider: "ifood",
              order_id: orderIdText,
              endpoint: path,
              method,
              payload_mode: payloadVariant.mode,
              message: "Pedido ja estava cancelado no iFood."
            };
          }
          if (statusCode === 401 || statusCode === 403) {
            stopByAuthError = true;
            break;
          }
          if (statusCode === 404 || statusCode === 405) {
            skipCurrentPath = true;
            break;
          }
          if (!shouldRetryCancelOnAnotherContract(error)) {
            break;
          }
        }
      }
    }
    if (stopByAuthError) break;
  }

  const failedAttemptInfo = lastAttempt
    ? ` (endpoint: ${lastAttempt.path}, metodo: ${lastAttempt.method}, payload: ${lastAttempt.mode})`
    : "";

  return {
    attempted: true,
    ok: false,
    provider: "ifood",
    order_id: orderIdText,
    endpoint: lastAttempt?.path || "",
    method: lastAttempt?.method || "",
    payload_mode: lastAttempt?.mode || "",
    message: `Falha no cancelamento iFood: ${String(lastError?.message || "endpoint indisponivel")}${failedAttemptInfo}`
  };
}

async function acknowledgeEvents(eventIds = [], token, config = null) {
  const ids = Array.from(
    new Set(
      (Array.isArray(eventIds) ? eventIds : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
  if (ids.length < 1) {
    return { acknowledged: 0, payloadMode: "none" };
  }

  const cfg = config || readConfig();
  const headers = {
    ...buildAuthHeaders(cfg, token),
    "content-type": "application/json"
  };

  const url = resolveUrl(cfg.base_url, cfg.ack_path || DEFAULTS.ackPath);
  const maxPerRequest = 2000;
  const chunks = [];
  for (let i = 0; i < ids.length; i += maxPerRequest) {
    chunks.push(ids.slice(i, i + maxPerRequest));
  }

  let acknowledged = 0;
  let payloadModeUsed = "array_objects";
  for (const chunkIds of chunks) {
    const candidates = [
      { payload: chunkIds.map((id) => ({ id })), mode: "array_objects" },
      { payload: chunkIds, mode: "array_ids" },
      { payload: { events: chunkIds }, mode: "object_events_ids" }
    ];

    let lastError = null;
    let ok = false;
    for (const candidate of candidates) {
      try {
        await httpRequestJson(url, {
          method: "POST",
          headers,
          body: JSON.stringify(candidate.payload),
          timeoutMs: 15000
        });
        payloadModeUsed = candidate.mode;
        ok = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!ok) {
      for (const eventId of chunkIds) {
        updateEventStatus(eventId, "ACK_FAILED", String(lastError?.message || "ack falhou"), false);
      }
      throw new Error(`Falha no acknowledgment iFood: ${String(lastError?.message || "erro desconhecido")}`);
    }

    for (const eventId of chunkIds) {
      updateEventStatus(eventId, "ACKED", "", true);
    }
    acknowledged += chunkIds.length;
  }

  return {
    acknowledged,
    payloadMode: payloadModeUsed
  };
}

function applyEventHintsToPedido(payloadEntrega, event = {}) {
  if (!payloadEntrega || typeof payloadEntrega !== "object") return payloadEntrega;
  if (!payloadEntrega.pedido || typeof payloadEntrega.pedido !== "object") return payloadEntrega;
  if (!eventSuggestsCancellation(event)) return payloadEntrega;

  const next = {
    ...payloadEntrega,
    pedido: {
      ...payloadEntrega.pedido
    }
  };

  const detalhesRaw = next.pedido.detalhes && typeof next.pedido.detalhes === "object" ? next.pedido.detalhes : {};
  const cancellationPrev =
    detalhesRaw.cancellation && typeof detalhesRaw.cancellation === "object" ? detalhesRaw.cancellation : {};
  const flagsPrev = detalhesRaw.scenario_flags && typeof detalhesRaw.scenario_flags === "object"
    ? detalhesRaw.scenario_flags
    : {};

  const reason = pick(
    event?.payload?.metadata?.reason,
    event?.payload?.reason,
    event?.payload?.description,
    event?.fullCode,
    event?.code
  );
  const source = pick(
    event?.payload?.metadata?.source,
    event?.payload?.metadata?.actor,
    event?.payload?.source,
    event?.payload?.cancelledBy,
    event?.code
  );
  const canceledAt = pick(event?.createdAt, event?.payload?.createdAt, event?.payload?.timestamp, new Date().toISOString());
  const isPlatform = String(source || event?.fullCode || "")
    .toUpperCase()
    .includes("PLATFORM");

  const cancellation = {
    ...cancellationPrev,
    is_cancelled: true,
    reason: String(reason || cancellationPrev.reason || "").trim().slice(0, 240),
    source: String(source || cancellationPrev.source || "").trim().slice(0, 80),
    canceled_at: safeIso(canceledAt || cancellationPrev.canceled_at || new Date().toISOString())
  };

  next.pedido.status = "CANCELLED";
  next.pedido.detalhes = {
    ...detalhesRaw,
    status: "CANCELLED",
    cancellation,
    scenario_flags: {
      ...flagsPrev,
      pedido_manual_cancelamento: true,
      cancelamento_plataforma: Boolean(flagsPrev.cancelamento_plataforma || isPlatform)
    }
  };

  return next;
}

function isCancelledStatusValue(statusRaw = "") {
  const status = String(statusRaw || "")
    .trim()
    .toUpperCase();
  if (!status) return false;
  return status.includes("CANCEL") || status.includes("REJECT") || status.includes("DENIED") || status.includes("DECLINED");
}

function isStatusConfirmedOrBeyond(statusRaw = "") {
  const status = String(statusRaw || "")
    .trim()
    .toUpperCase();
  if (!status) return false;
  if (status.includes("CONFIRM") || status === "ACCEPTED" || status === "APPROVED") return true;
  if (
    status.includes("PREPAR") ||
    status.includes("DISPATCH") ||
    status.includes("ROUTE") ||
    status.includes("ON_THE_WAY") ||
    status.includes("READY") ||
    status.includes("CONCLUDED") ||
    status.includes("COMPLETED") ||
    status.includes("FINISHED") ||
    status.includes("DELIVER")
  ) {
    return true;
  }
  return false;
}

function shouldAutoConfirmFromEvent(order = {}, event = {}) {
  const status = normalizeOrderStatus(pick(order?.orderStatus, order?.status, order?.state, "RECEIVED"));
  if (isCancelledStatusValue(status) || isStatusConfirmedOrBeyond(status)) return false;
  const eventKey = String(event?.fullCode || event?.code || "")
    .trim()
    .toUpperCase();
  if (!eventKey) return true;
  if (
    eventKey.includes("CANCEL") ||
    eventKey.includes("REJECT") ||
    eventKey.includes("DENIED") ||
    eventKey.includes("DECLINED")
  ) {
    return false;
  }
  if (eventKey.includes("CONFIRM")) return false;
  if (
    eventKey === "PLC" ||
    eventKey.includes("PLACED") ||
    eventKey.includes("CREATED") ||
    eventKey.includes("RECEIVED")
  ) {
    return true;
  }
  return false;
}

function applyConfirmationHintsToPedido(payloadEntrega, confirmationResult = {}, context = {}) {
  if (!payloadEntrega || typeof payloadEntrega !== "object") return payloadEntrega;
  if (!payloadEntrega.pedido || typeof payloadEntrega.pedido !== "object") return payloadEntrega;
  if (!confirmationResult?.ok) return payloadEntrega;

  const next = {
    ...payloadEntrega,
    pedido: {
      ...payloadEntrega.pedido
    }
  };

  const detalhesRaw = next.pedido.detalhes && typeof next.pedido.detalhes === "object" ? next.pedido.detalhes : {};
  const confirmationPrev =
    detalhesRaw.confirmation && typeof detalhesRaw.confirmation === "object" ? detalhesRaw.confirmation : {};
  const flagsPrev =
    detalhesRaw.scenario_flags && typeof detalhesRaw.scenario_flags === "object" ? detalhesRaw.scenario_flags : {};
  const nowIso = safeIso(context?.at || new Date().toISOString());
  const currentStatus = normalizeOrderStatus(
    pick(next.pedido.status, detalhesRaw.orderStatus, detalhesRaw.status, "RECEIVED")
  );
  const promotedStatus = isStatusConfirmedOrBeyond(currentStatus) ? currentStatus : "CONFIRMED";

  next.pedido.status = promotedStatus;
  next.pedido.detalhes = {
    ...detalhesRaw,
    status: promotedStatus,
    orderStatus: promotedStatus,
    confirmation: {
      ...confirmationPrev,
      confirmed: true,
      confirmed_at: nowIso,
      source: String(context?.source || "PDV_GASTROCODE").trim().slice(0, 80),
      mode: String(context?.mode || "AUTO").trim().slice(0, 80),
      endpoint: String(confirmationResult?.endpoint || "").trim().slice(0, 120),
      already_confirmed: Boolean(confirmationResult?.already_applied)
    },
    scenario_flags: {
      ...flagsPrev,
      pedido_confirmado: true
    }
  };

  return next;
}

async function processNormalizedEvent(event, token, config = null) {
  const cfg = config || readConfig();
  if (!event.orderId) {
    updateEventStatus(event.eventId, "IGNORED", "Evento sem orderId.", false);
    return {
      imported: false,
      reason: "no_order_id"
    };
  }

  let orderDetails = null;
  const cancellationHint = eventSuggestsCancellation(event);
  try {
    orderDetails = await fetchOrderDetails(event.orderId, token, cfg, {
      bypassCache: cancellationHint
    });
  } catch (error) {
    if (cancellationHint) {
      orderDetails = {
        id: event.orderId,
        orderId: event.orderId,
        status: "CANCELLED",
        orderStatus: "CANCELLED",
        cancellation: {
          reason: pick(event?.payload?.metadata?.reason, event?.payload?.reason, event?.fullCode, event?.code),
          cancelledAt: pick(event?.createdAt, new Date().toISOString())
        }
      };
    } else {
      updateEventStatus(event.eventId, "ERROR", String(error?.message || "falha ao consultar pedido"), false);
      throw error;
    }
  }

  try {
    let confirmationResult = null;
    if (shouldAutoConfirmFromEvent(orderDetails, event)) {
      confirmationResult = await confirmOrder(event.orderId, {
        mode: "AUTO_EVENT",
        source: "PDV_GASTROCODE"
      });
      if (confirmationResult?.attempted && !confirmationResult?.ok) {
        console.warn(
          `[ifood-hmg] confirmacao automatica falhou para pedido ${String(event.orderId || "")}: ${String(
            confirmationResult?.message || "erro desconhecido"
          )}`
        );
      }
    }

    let payloadEntrega = applyEventHintsToPedido(
      normalizeOrderToEntrega(orderDetails, event.orderId, cfg),
      event
    );
    if (confirmationResult?.ok) {
      payloadEntrega = applyConfirmationHintsToPedido(payloadEntrega, confirmationResult, {
        mode: "AUTO_EVENT",
        source: "PDV_GASTROCODE"
      });
    }
    const upsertResult = EntregaModel.upsertPedidosIntegracao({
      pedidos: [payloadEntrega.pedido]
    });
    updateEventStatus(event.eventId, "PROCESSED", "", false);
    return {
      imported: true,
      added: Number(upsertResult?.addedCount || 0),
      updated: Number(upsertResult?.updatedCount || 0),
      total: Number(upsertResult?.totalProcessado || 0)
    };
  } catch (error) {
    updateEventStatus(event.eventId, "ERROR", String(error?.message || "falha ao mapear pedido"), false);
    throw error;
  }
}

function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  const bodyText = String(rawBody || "");
  const signatureRaw = String(signatureHeader || "").trim();
  const sharedSecret = String(secret || "").trim();
  if (!sharedSecret) return true;
  if (!signatureRaw) return false;

  const normalized = signatureRaw.toLowerCase().startsWith("sha256=")
    ? signatureRaw.slice(7).trim()
    : signatureRaw.trim();

  const digestHex = crypto.createHmac("sha256", sharedSecret).update(bodyText).digest("hex");
  const digestB64 = crypto.createHmac("sha256", sharedSecret).update(bodyText).digest("base64");

  const matchesHex = safeEqual(digestHex.toLowerCase(), normalized.toLowerCase());
  const matchesB64 = safeEqual(digestB64, normalized);
  return matchesHex || matchesB64;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function asyncMapLimit(items = [], limit = 1, mapper = async () => null) {
  const list = Array.isArray(items) ? items : [];
  if (list.length < 1) return [];

  const maxWorkers = toInt(limit, 1, 1, 8);
  const workersCount = Math.min(maxWorkers, list.length);
  const results = new Array(list.length);
  let cursor = 0;

  const runWorker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) break;
      results[index] = await mapper(list[index], index);
    }
  };

  await Promise.all(Array.from({ length: workersCount }, () => runWorker()));
  return results;
}

async function syncNowCore(options = {}) {
  const config = readConfig();
  if (!config.enabled) {
    throw new Error("Modo homologacao iFood desativado.");
  }
  const token = await resolveAccessToken();
  let merchants = normalizeMerchantIdList(config.polling_merchants);
  if (merchants.length < 1) {
    const discovered = await discoverMerchantsFromIfood(token, config);
    if (discovered.length < 1) {
      throw new Error(
        "Nao foi possivel descobrir merchant IDs automaticamente. Gere um pedido de teste no portal iFood e tente sincronizar novamente."
      );
    }
    merchants = discovered;
    SistemaConfig.set(CONFIG_KEYS.pollingMerchants, merchants.join(","));
  }

  const limit = toInt(options.limit, 120, 1, 500);
  const pollingUrl = new URL(resolveUrl(config.base_url, config.polling_path || DEFAULTS.pollingPath));
  pollingUrl.searchParams.set("limit", String(limit));
  if (config.polling_exclude_heartbeat) {
    pollingUrl.searchParams.set("excludeHeartbeat", "true");
  }

  const buildPollingHeaders = () => {
    const headers = buildAuthHeaders(config, token);
    headers["x-polling-merchants"] = merchants.join(",");
    return headers;
  };

  let pollingResponse;
  try {
    pollingResponse = await httpRequestJson(pollingUrl.toString(), {
      method: "GET",
      headers: buildPollingHeaders(),
      timeoutMs: 20000
    });
  } catch (error) {
    if (!isLikelyInvalidPollingMerchantError(error)) {
      throw error;
    }

    const discovered = await discoverMerchantsFromIfood(token, config);
    if (discovered.length < 1) {
      throw new Error(
        "Merchant ID invalido para polling iFood. Abra Pedidos de teste no portal e use o ID tecnico da loja (ex.: UUID), nao o numero exibido no nome."
      );
    }

    merchants = discovered;
    const merchantCsv = merchants.join(",");
    SistemaConfig.set(CONFIG_KEYS.pollingMerchants, merchantCsv);

    pollingResponse = await httpRequestJson(pollingUrl.toString(), {
      method: "GET",
      headers: buildPollingHeaders(),
      timeoutMs: 20000
    });
  }
  const eventsRaw = parseEventList(pollingResponse.data);

  if (eventsRaw.length < 1) {
    const message = "iFood homologacao: nenhum evento pendente no polling.";
    saveLastSync(message);
    return {
      provider: "ifood",
      mode: "homologacao",
      imported: 0,
      received_events: 0,
      processed_events: 0,
      acked_events: 0,
      duplicated_events: 0,
      failed_events: 0,
      message
    };
  }

  const uniqueEvents = [];
  const eventIdsForAck = [];
  let duplicated = 0;
  for (const rawEvent of eventsRaw) {
    const event = normalizeIfoodEvent(rawEvent || {});
    if (event.eventId) {
      eventIdsForAck.push(event.eventId);
    }
    const inserted = insertEventLog(event);
    if (!inserted) {
      duplicated += 1;
      continue;
    }
    uniqueEvents.push(event);
  }

  const syncConcurrency = toInt(
    options?.concurrency ?? process.env.IFOOD_SYNC_CONCURRENCY ?? 4,
    4,
    1,
    8
  );
  const processResults = await asyncMapLimit(uniqueEvents, syncConcurrency, async (event) => {
    try {
      const result = await processNormalizedEvent(event, token, config);
      return {
        processed: 1,
        imported: Number(result?.imported ? 1 : 0),
        failed: 0
      };
    } catch {
      return {
        processed: 0,
        imported: 0,
        failed: 1
      };
    }
  });

  let processed = 0;
  let imported = 0;
  let failed = 0;
  for (const row of processResults) {
    processed += Number(row?.processed || 0);
    imported += Number(row?.imported || 0);
    failed += Number(row?.failed || 0);
  }

  let ackedEvents = 0;
  if (config.auto_ack && eventIdsForAck.length > 0) {
    try {
      const ackResult = await acknowledgeEvents(
        eventIdsForAck,
        token,
        config
      );
      ackedEvents = Number(ackResult?.acknowledged || 0);
    } catch (error) {
      failed += uniqueEvents.length;
      const message = `iFood homologacao: ${processed} processado(s), falha no ACK (${String(
        error?.message || "erro"
      )}).`;
      saveLastSync(message);
      return {
        provider: "ifood",
        mode: "homologacao",
        imported,
        received_events: eventsRaw.length,
        processed_events: processed,
        acked_events: ackedEvents,
        duplicated_events: duplicated,
        failed_events: failed,
        message
      };
    }
  }

  const message = `iFood homologacao: ${processed} evento(s) processado(s), ${ackedEvents} ACK, ${duplicated} duplicado(s), ${failed} falha(s).`;
  saveLastSync(message);

  return {
    provider: "ifood",
    mode: "homologacao",
    imported,
    received_events: eventsRaw.length,
    processed_events: processed,
    acked_events: ackedEvents,
    duplicated_events: duplicated,
    failed_events: failed,
    message
  };
}

function resultadoSyncIfoodEmAndamento() {
  const message = "iFood homologacao: sincronizacao ja esta em andamento.";
  return {
    provider: "ifood",
    mode: "homologacao",
    started: false,
    running: true,
    imported: 0,
    received_events: 0,
    processed_events: 0,
    acked_events: 0,
    duplicated_events: 0,
    failed_events: 0,
    message
  };
}

function resultadoSyncIfoodIniciada() {
  const message = "iFood homologacao: sincronizacao iniciada em segundo plano.";
  return {
    provider: "ifood",
    mode: "homologacao",
    started: true,
    running: true,
    imported: 0,
    received_events: 0,
    processed_events: 0,
    acked_events: 0,
    duplicated_events: 0,
    failed_events: 0,
    message
  };
}

async function syncNow(options = {}) {
  const config = readConfig();
  if (!config.enabled) {
    throw new Error("Modo homologacao iFood desativado.");
  }

  if (ifoodSyncRunning) {
    return resultadoSyncIfoodEmAndamento();
  }

  if (options.background) {
    ifoodSyncRunning = true;
    saveLastSync("iFood homologacao: sincronizacao iniciada em segundo plano.");
    setImmediate(() => {
      void (async () => {
        try {
          await syncNowCore(options);
        } catch (error) {
          const message = `iFood homologacao: falha na sincronizacao em segundo plano (${String(
            error?.message || "erro"
          )}).`;
          saveLastSync(message);
          console.error(`[ifood-hmg] ${message}`);
        } finally {
          ifoodSyncRunning = false;
        }
      })();
    });
    return resultadoSyncIfoodIniciada();
  }

  ifoodSyncRunning = true;
  try {
    return await syncNowCore(options);
  } finally {
    ifoodSyncRunning = false;
  }
}

async function processWebhook(payload = {}, options = {}) {
  const config = readConfig();
  if (!config.enabled) {
    const error = new Error("Modo homologacao iFood desativado.");
    error.statusCode = 403;
    throw error;
  }

  if (config.webhook_signature_required) {
    const signature = pick(
      options.signature,
      options.headers?.["x-ifood-signature"],
      options.headers?.["x-webhook-signature"]
    );
    const valid = verifyWebhookSignature(options.rawBody || JSON.stringify(payload || {}), signature, config.webhook_secret);
    if (!valid) {
      const error = new Error("Assinatura webhook iFood invalida.");
      error.statusCode = 401;
      throw error;
    }
  }

  const token = await resolveAccessToken();
  const eventsRaw = parseEventList(payload);
  if (eventsRaw.length < 1) {
    return {
      provider: "ifood",
      mode: "homologacao",
      received_events: 0,
      processed_events: 0,
      message: "Webhook iFood recebido sem eventos validos."
    };
  }

  let processed = 0;
  let duplicated = 0;
  let failed = 0;

  for (const rawEvent of eventsRaw) {
    const event = normalizeIfoodEvent(rawEvent || {});
    const inserted = insertEventLog(event);
    if (!inserted) {
      duplicated += 1;
      continue;
    }

    try {
      await processNormalizedEvent(event, token, config);
      processed += 1;
    } catch {
      failed += 1;
    }
  }

  const message = `Webhook iFood: ${processed} processado(s), ${duplicated} duplicado(s), ${failed} falha(s).`;
  saveLastSync(message);

  return {
    provider: "ifood",
    mode: "homologacao",
    received_events: eventsRaw.length,
    processed_events: processed,
    duplicated_events: duplicated,
    failed_events: failed,
    message
  };
}

function listRecentEvents(limit = 60) {
  const safeLimit = toInt(limit, 60, 1, 500);
  return listEventsStmt.all(safeLimit).map((row) => ({
    id: row.id,
    event_id: row.event_id,
    merchant_id: row.merchant_id,
    order_id: row.order_id,
    code: row.code,
    full_code: row.full_code,
    created_at_event: row.created_at_event,
    received_at: row.received_at,
    acked_at: row.acked_at,
    status: row.status,
    error: row.error || "",
    payload: parseJsonSafe(row.payload_json, null)
  }));
}

function buildChecklist(config, metrics = null) {
  const hasAuth = Boolean(config.bearer_token || config.access_token || (config.client_id && config.client_secret));
  const hasMerchant = csvList(config.polling_merchants).length > 0;
  const intervalOk = Number(config.polling_interval_seconds || 0) === 30;
  const hasEndpoints = Boolean(config.polling_path && config.ack_path && config.order_details_path);
  const signatureOk = config.webhook_signature_required ? Boolean(config.webhook_secret) : true;
  const ackRate = Number(metrics?.ackRate24h || 0);
  const hasEventsBase = Number(metrics?.events24h || 0) > 0;
  const ackRateOk = !hasEventsBase || ackRate >= 95;

  const items = [
    {
      key: "enabled",
      label: "Modo homologacao ativado",
      ok: Boolean(config.enabled)
    },
    {
      key: "base_url",
      label: "Base URL iFood configurada",
      ok: Boolean(String(config.base_url || "").trim())
    },
    {
      key: "auth",
      label: "Autenticacao pronta (Bearer ou client credentials)",
      ok: hasAuth
    },
    {
      key: "merchants",
      label: "Merchant IDs de polling configurados",
      ok: hasMerchant
    },
    {
      key: "interval",
      label: "Polling configurado exatamente em 30s",
      ok: intervalOk
    },
    {
      key: "exclude_heartbeat",
      label: "excludeHeartbeat=true habilitado (integradora logistica)",
      ok: Boolean(config.polling_exclude_heartbeat)
    },
    {
      key: "ack_rate",
      label: "Taxa de ACK >= 95% (ultimas 24h)",
      ok: ackRateOk
    },
    {
      key: "ack",
      label: "ACK automatico ligado",
      ok: Boolean(config.auto_ack)
    },
    {
      key: "endpoints",
      label: "Endpoints de polling/ack/order configurados",
      ok: hasEndpoints
    },
    {
      key: "webhook_signature",
      label: "Assinatura webhook valida (quando exigida)",
      ok: signatureOk
    }
  ];

  return {
    ready: items.every((item) => item.ok),
    items
  };
}

function buildScenarioMetrics() {
  const base = {
    total_orders: 0,
    agendado_com_voucher: 0,
    pedido_manual_cancelamento: 0,
    retirada_local: 0,
    cancelamento_plataforma: 0,
    dinheiro_com_troco: 0,
    cliente_documentado: 0
  };

  let rows = [];
  try {
    rows = scenarioOrdersStmt.all();
  } catch {
    return base;
  }

  for (const row of rows) {
    const detalhes = parseJsonSafe(row?.detalhes_json, null);
    if (!detalhes || typeof detalhes !== "object") continue;
    base.total_orders += 1;

    const flags = detalhes?.scenario_flags && typeof detalhes.scenario_flags === "object" ? detalhes.scenario_flags : {};
    const customerDoc =
      String(detalhes?.customer?.documento || detalhes?.customer?.document || detalhes?.customer_document || "").trim();

    if (flags.agendado_com_voucher) base.agendado_com_voucher += 1;
    if (flags.pedido_manual_cancelamento) base.pedido_manual_cancelamento += 1;
    if (flags.retirada_local) base.retirada_local += 1;
    if (flags.cancelamento_plataforma) base.cancelamento_plataforma += 1;
    if (flags.dinheiro_com_troco) base.dinheiro_com_troco += 1;
    if (flags.cliente_documentado || customerDoc) base.cliente_documentado += 1;
  }

  return base;
}

function withScenarioChecklist(checklist, scenarioMetrics = null) {
  const metrics = scenarioMetrics || buildScenarioMetrics();
  const hasOrders = Number(metrics.total_orders || 0) > 0;
  const scenarioItems = [
    {
      key: "scenario_agendado_voucher",
      label: "Cenario 1: pedido agendado com voucher",
      ok: hasOrders && Number(metrics.agendado_com_voucher || 0) > 0
    },
    {
      key: "scenario_manual_cancelamento",
      label: "Cenario 2: pedido com cancelamento",
      ok: hasOrders && Number(metrics.pedido_manual_cancelamento || 0) > 0
    },
    {
      key: "scenario_retirada_local",
      label: "Cenario 3: pedido para retirada no local",
      ok: hasOrders && Number(metrics.retirada_local || 0) > 0
    },
    {
      key: "scenario_cancelamento_plataforma",
      label: "Cenario 4: cancelamento iniciado pela plataforma",
      ok: hasOrders && Number(metrics.cancelamento_plataforma || 0) > 0
    },
    {
      key: "scenario_dinheiro_troco",
      label: "Cenario 5: pagamento em dinheiro com troco",
      ok: hasOrders && Number(metrics.dinheiro_com_troco || 0) > 0
    },
    {
      key: "scenario_cliente_documentado",
      label: "Pedido com documento do cliente (CPF/CNPJ)",
      ok: hasOrders && Number(metrics.cliente_documentado || 0) > 0
    }
  ];

  return {
    ready: Boolean(checklist?.ready) && scenarioItems.every((item) => item.ok),
    items: [...(Array.isArray(checklist?.items) ? checklist.items : []), ...scenarioItems]
  };
}

function getStatus() {
  const config = readConfig();
  const total = metricsStmt.get() || {};
  const daily = metrics24hStmt.get() || {};
  const totalReceived = Number(total.total || 0);
  const totalAcked = Number(total.acked || 0);
  const totalAckRate = totalReceived > 0 ? Number(((totalAcked / totalReceived) * 100).toFixed(2)) : 100;
  const dailyReceived = Number(daily.total || 0);
  const dailyAcked = Number(daily.acked || 0);
  const dailyAckRate = dailyReceived > 0 ? Number(((dailyAcked / dailyReceived) * 100).toFixed(2)) : 100;
  const scenarioMetrics = buildScenarioMetrics();
  const checklistBase = buildChecklist(config, {
    ackRate24h: dailyAckRate,
    events24h: dailyReceived
  });
  const checklist = withScenarioChecklist(checklistBase, scenarioMetrics);

  return {
    provider: "ifood",
    mode: "homologacao",
    config: {
      ...config,
      client_secret: config.client_secret ? "********" : "",
      access_token: config.access_token ? "********" : "",
      bearer_token: config.bearer_token ? "********" : "",
      webhook_secret: config.webhook_secret ? "********" : ""
    },
    checklist,
    scenarios: scenarioMetrics,
    metrics: {
      total: {
        received: totalReceived,
        acked: totalAcked,
        failed: Number(total.failed || 0),
        pending_ack: Number(total.pending_ack || 0),
        ack_rate_percent: totalAckRate
      },
      last_24h: {
        received: dailyReceived,
        acked: dailyAcked,
        failed: Number(daily.failed || 0),
        pending_ack: Number(daily.pending_ack || 0),
        ack_rate_percent: dailyAckRate
      }
    },
    last_sync_at: config.last_sync_at || null,
    last_sync_result: config.last_sync_result || ""
  };
}

function integrationExtrasForResponse(config = null) {
  const cfg = config || readConfig();
  return {
    homologacao_enabled: Boolean(cfg.enabled),
    homologacao_base_url: cfg.base_url,
    homologacao_token_url: cfg.token_url,
    homologacao_polling_path: cfg.polling_path,
    homologacao_ack_path: cfg.ack_path,
    homologacao_order_details_path: cfg.order_details_path,
    homologacao_order_details_path_fallback: cfg.order_details_path_fallback,
    homologacao_client_id: cfg.client_id,
    homologacao_grant_type: cfg.grant_type,
    homologacao_scope: cfg.scope,
    homologacao_authorization_code: cfg.authorization_code,
    homologacao_refresh_token: cfg.refresh_token,
    homologacao_polling_merchants: cfg.polling_merchants,
    homologacao_polling_interval_seconds: cfg.polling_interval_seconds,
    homologacao_polling_exclude_heartbeat: Boolean(cfg.polling_exclude_heartbeat),
    homologacao_auto_ack: Boolean(cfg.auto_ack),
    homologacao_webhook_signature_required: Boolean(cfg.webhook_signature_required),
    homologacao_last_token_refresh_at: cfg.last_token_refresh_at || null,
    homologacao_last_sync_at: cfg.last_sync_at || null,
    homologacao_last_sync_result: cfg.last_sync_result || ""
  };
}

function applyIntegrationSavePayload(body = {}) {
  const payload = {
    enabled: body.homologacao_enabled,
    base_url: body.homologacao_base_url ?? body.base_url,
    token_url: body.homologacao_token_url,
    polling_path: body.homologacao_polling_path,
    ack_path: body.homologacao_ack_path,
    order_details_path: body.homologacao_order_details_path,
    order_details_path_fallback: body.homologacao_order_details_path_fallback,
    api_key: body.api_key,
    bearer_token: body.bearer_token,
    client_id: body.homologacao_client_id,
    client_secret: body.homologacao_client_secret,
    grant_type: body.homologacao_grant_type,
    authorization_code: body.homologacao_authorization_code,
    refresh_token: body.homologacao_refresh_token,
    scope: body.homologacao_scope,
    polling_merchants: body.homologacao_polling_merchants,
    polling_interval_seconds: body.homologacao_polling_interval_seconds,
    polling_exclude_heartbeat: body.homologacao_polling_exclude_heartbeat,
    auto_ack: body.homologacao_auto_ack,
    motoboy_fallback: body.motoboy_fallback,
    webhook_secret: body.webhook_secret,
    webhook_signature_required: body.homologacao_webhook_signature_required
  };

  const filtered = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) {
      filtered[key] = value;
    }
  }
  return saveConfig(filtered);
}

module.exports = {
  readConfig,
  saveConfig,
  getStatus,
  listRecentEvents,
  refreshAccessToken,
  confirmOrder,
  autoDispatchOrder,
  listManualCancellationOptions,
  manualCancelOrder,
  syncNow,
  processWebhook,
  integrationExtrasForResponse,
  applyIntegrationSavePayload
};
