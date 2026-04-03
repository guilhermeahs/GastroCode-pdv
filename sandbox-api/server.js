const express = require("express");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const PORT = Number(process.env.SANDBOX_API_PORT || 3210);
const DEFAULT_API_KEY = String(process.env.SANDBOX_API_KEY || "gastrocode-teste-123");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "sandbox-store.json");
const STATUS_VALIDOS = ["RECEBIDO", "EM_PREPARO", "SAIU_PARA_ENTREGA", "ENTREGUE", "CANCELADO"];
const INTEGRATION_PROVIDERS = {
  ifood: { key: "ifood", source: "IFOOD", label: "iFood" },
  ninenine: { key: "ninenine", source: "NINENINE", label: "99" }
};

function agoraIso() {
  return new Date().toISOString();
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function defaultState() {
  return {
    meta: {
      created_at: agoraIso(),
      merchant: "GastroCode Sandbox"
    },
    integrations: defaultIntegrations(),
    tokens: [],
    webhooks: [],
    events: [],
    orders: []
  };
}

function defaultIntegrations() {
  return {
    ifood: {
      enabled: false,
      base_url: "",
      import_path: "/orders",
      import_query: "source=IFOOD",
      api_key: "",
      bearer_token: "",
      merchant_id: "",
      webhook_secret: "",
      default_payment: "ONLINE",
      motoboy_fallback: "",
      last_import_at: null,
      last_import_result: ""
    },
    ninenine: {
      enabled: false,
      base_url: "",
      import_path: "/orders",
      import_query: "source=NINENINE",
      api_key: "",
      bearer_token: "",
      merchant_id: "",
      webhook_secret: "",
      default_payment: "ONLINE",
      motoboy_fallback: "",
      last_import_at: null,
      last_import_result: ""
    }
  };
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    const initial = defaultState();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const defaults = defaultState();
    const rawIntegrations = parsed && typeof parsed.integrations === "object" ? parsed.integrations : {};
    return {
      ...defaults,
      ...parsed,
      integrations: {
        ifood: {
          ...defaults.integrations.ifood,
          ...(rawIntegrations.ifood || {})
        },
        ninenine: {
          ...defaults.integrations.ninenine,
          ...(rawIntegrations.ninenine || {})
        }
      },
      tokens: Array.isArray(parsed.tokens) ? parsed.tokens : [],
      webhooks: Array.isArray(parsed.webhooks) ? parsed.webhooks : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : []
    };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf8");
}

function normalizeProviderKey(providerInput) {
  const raw = String(providerInput || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (raw === "99" || raw === "nine" || raw === "ninenine" || raw === "99food") {
    return "ninenine";
  }
  if (raw === "ifood" || raw === "i-food" || raw === "i_food") {
    return "ifood";
  }
  return raw;
}

function getProvider(providerInput) {
  const key = normalizeProviderKey(providerInput);
  return INTEGRATION_PROVIDERS[key] || null;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  const txt = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "sim", "on"].includes(txt)) return true;
  if (["0", "false", "no", "nao", "off"].includes(txt)) return false;
  return Boolean(fallback);
}

function parseCodes(codigosInput) {
  if (Array.isArray(codigosInput)) {
    return codigosInput
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  return String(codigosInput || "")
    .replace(/[;,\t]+/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePayment(value) {
  const txt = String(value || "ONLINE")
    .trim()
    .toUpperCase();
  if (!txt) return "ONLINE";
  return txt.slice(0, 20);
}

function normalizeSource(value) {
  const txt = String(value || "MANUAL")
    .trim()
    .toUpperCase();
  if (!txt) return "MANUAL";
  return txt.slice(0, 24);
}

function summarizePayments(payments) {
  const map = new Map();
  for (const item of payments) {
    const method = normalizePayment(item.method || item.forma_pagamento || "ONLINE");
    const amount = toMoney(item.amount || item.valor || 0);
    map.set(method, toMoney((map.get(method) || 0) + amount));
  }
  return Array.from(map.entries()).map(([method, amount]) => ({ method, amount }));
}

function normalizeStatus(value, fallback = "RECEBIDO") {
  const txt = String(value || "")
    .trim()
    .toUpperCase();

  if (!txt) return fallback;
  if (txt.includes("CANCEL")) return "CANCELADO";
  if (txt.includes("ENTREG") || txt.includes("DELIVER")) return "ENTREGUE";
  if (txt.includes("SAIU") || txt.includes("OUT_FOR_DELIVERY") || txt.includes("ROTA")) {
    return "SAIU_PARA_ENTREGA";
  }
  if (txt.includes("PREPAR") || txt.includes("COOK") || txt.includes("ACEITO")) return "EM_PREPARO";
  if (txt.includes("RECEB") || txt.includes("PENDING") || txt.includes("NOVO")) return "RECEBIDO";
  return STATUS_VALIDOS.includes(txt) ? txt : fallback;
}

function normalizeItems(itemsInput = []) {
  const items = Array.isArray(itemsInput) ? itemsInput : [];
  const normalized = items
    .map((item) => ({
      sku: String(item?.sku || item?.id || item?.codigo || "").trim().slice(0, 120),
      name: String(item?.name || item?.nome || item?.description || item?.descricao || "Item")
        .trim()
        .slice(0, 120),
      qty: Math.max(1, Number(item?.qty || item?.quantidade || item?.quantity || 1)),
      price: toMoney(item?.price || item?.preco || item?.unit_price || item?.unitPrice || 0)
    }))
    .filter((item) => item.name);

  return normalized.length > 0 ? normalized : [{ sku: "", name: "Pedido externo", qty: 1, price: 0 }];
}

function normalizePayments(paymentsInput = [], fallbackMethod = "ONLINE", fallbackAmount = 0) {
  const payments = Array.isArray(paymentsInput) ? paymentsInput : [];
  const normalized = payments.map((item) => ({
    method: normalizePayment(item?.method || item?.forma_pagamento || item?.type || fallbackMethod),
    amount: toMoney(item?.amount || item?.valor || item?.value || 0)
  }));

  if (normalized.length > 0) return normalized;
  return [{ method: normalizePayment(fallbackMethod), amount: toMoney(fallbackAmount) }];
}

function pick(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const txt = String(value).trim();
    if (txt) return txt;
  }
  return "";
}

function computeTotals(items = [], payments = []) {
  const subtotal = toMoney(
    items.reduce((acc, item) => {
      const qty = Number(item.qty || item.quantidade || 0);
      const price = Number(item.price || item.preco || 0);
      if (!Number.isFinite(qty) || !Number.isFinite(price)) return acc;
      return acc + qty * price;
    }, 0)
  );

  const totalPagamentos = toMoney(
    payments.reduce((acc, item) => acc + Number(item.amount || item.valor || 0), 0)
  );

  return {
    subtotal,
    total: totalPagamentos > 0 ? totalPagamentos : subtotal
  };
}

function isValidToken(state, token) {
  const now = Date.now();
  return state.tokens.some((item) => {
    if (String(item.token) !== String(token)) return false;
    const exp = new Date(item.expires_at).getTime();
    return Number.isFinite(exp) && exp > now;
  });
}

function createAuthMiddleware(state) {
  return function authMiddleware(req, res, next) {
    const publicPaths = new Set(["/", "/docs", "/health"]);
    if (publicPaths.has(req.path)) return next();
    if (req.method === "POST" && /^\/integrations\/(?:ifood|ninenine|99)\/webhook$/i.test(req.path)) {
      return next();
    }

    const apiKey = String(req.headers["x-api-key"] || "").trim();
    if (apiKey && apiKey === DEFAULT_API_KEY) {
      req.auth = { type: "api_key" };
      return next();
    }

    const auth = String(req.headers.authorization || "").trim();
    if (auth.toLowerCase().startsWith("bearer ")) {
      const token = auth.slice(7).trim();
      if (isValidToken(state, token)) {
        req.auth = { type: "bearer" };
        return next();
      }
    }

    return res.status(401).json({
      error: "Nao autorizado. Use header x-api-key valido ou Bearer token."
    });
  };
}

function createApp() {
  const app = express();
  const state = loadState();

  app.use(express.json({ limit: "1mb" }));
  app.use(createAuthMiddleware(state));

  function getIntegrationConfig(providerInput) {
    const provider = getProvider(providerInput);
    if (!provider) return null;
    const raw = state.integrations?.[provider.key] || {};
    return {
      provider,
      config: {
        ...defaultIntegrations()[provider.key],
        ...raw
      }
    };
  }

  function saveIntegrationConfig(providerKey, config) {
    if (!state.integrations || typeof state.integrations !== "object") {
      state.integrations = defaultIntegrations();
    }
    state.integrations[providerKey] = config;
    saveState(state);
  }

  function sanitizeIntegrationOutput(providerKey, config) {
    return {
      provider: providerKey,
      enabled: toBool(config.enabled),
      base_url: String(config.base_url || ""),
      import_path: String(config.import_path || "/orders"),
      import_query: String(config.import_query || ""),
      merchant_id: String(config.merchant_id || ""),
      webhook_secret_configured: Boolean(String(config.webhook_secret || "").trim()),
      api_key_configured: Boolean(String(config.api_key || "").trim()),
      bearer_token_configured: Boolean(String(config.bearer_token || "").trim()),
      default_payment: normalizePayment(config.default_payment || "ONLINE"),
      motoboy_fallback: String(config.motoboy_fallback || "").trim(),
      last_import_at: config.last_import_at || null,
      last_import_result: config.last_import_result || ""
    };
  }

  function buildImportUrl(provider, config, from, to, limit) {
    const base = String(config.base_url || "").trim().replace(/\/+$/, "");
    if (!base) {
      throw new Error(`Base URL do ${provider.label} nao configurada.`);
    }

    const importPath = String(config.import_path || "/orders").trim() || "/orders";
    const pathWithSlash = importPath.startsWith("/") ? importPath : `/${importPath}`;
    const url = new URL(`${base}${pathWithSlash}`);

    const queryParts = String(config.import_query || "")
      .split("&")
      .map((item) => item.trim())
      .filter(Boolean);
    for (const part of queryParts) {
      const [rawKey, rawValue] = part.split("=");
      const key = String(rawKey || "").trim();
      if (!key) continue;
      url.searchParams.set(key, String(rawValue || "").trim());
    }

    if (!url.searchParams.get("source")) {
      url.searchParams.set("source", provider.source);
    }
    if (from) url.searchParams.set("from", from);
    if (to) url.searchParams.set("to", to);
    if (Number.isFinite(limit) && limit > 0) {
      url.searchParams.set("limit", String(Math.trunc(limit)));
    }

    return url.toString();
  }

  function extractOrderPayloads(provider, payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.orders)) return payload.orders;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.events)) {
      return payload.events
        .map((event) => event?.order || event?.pedido || event?.payload || null)
        .filter(Boolean);
    }
    if (payload.order || payload.pedido) {
      return [payload.order || payload.pedido];
    }

    if (provider.key === "ifood" && (payload.id || payload.code || payload.orderId)) return [payload];
    if (provider.key === "ninenine" && (payload.id || payload.code || payload.deliveryId)) return [payload];
    return [payload];
  }

  function buildOrderFromExternal(provider, payload, config = {}) {
    const extId = pick(
      payload?.external_id,
      payload?.externalId,
      payload?.id,
      payload?.order_id,
      payload?.orderId,
      payload?.code,
      payload?.numero
    );
    const externalId = extId || `${provider.source}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const items = normalizeItems(
      payload?.items || payload?.order_items || payload?.orderItems || payload?.products || []
    );

    const subtotalFallback = toMoney(payload?.subtotal || payload?.subtotal_amount || 0);
    const totalFallback = toMoney(payload?.total || payload?.total_amount || payload?.orderTotal || subtotalFallback);
    const payments = normalizePayments(
      payload?.payments || payload?.payment_methods || payload?.paymentMethods || payload?.payment || [],
      config.default_payment || "ONLINE",
      totalFallback || subtotalFallback
    );

    const totals = computeTotals(items, payments);
    const source = provider.source;
    const createdAt = pick(payload?.created_at, payload?.createdAt, payload?.created, payload?.date, payload?.data);
    let safeCreatedAt = agoraIso();
    if (createdAt) {
      const parsed = new Date(createdAt);
      if (!Number.isNaN(parsed.getTime())) {
        safeCreatedAt = parsed.toISOString();
      }
    }

    return {
      external_id: String(externalId).slice(0, 80),
      source,
      status: normalizeStatus(payload?.status || payload?.state || payload?.order_status || payload?.event),
      customer_name: pick(
        payload?.customer_name,
        payload?.customerName,
        payload?.cliente,
        payload?.customer?.name,
        payload?.consumer?.name
      ).slice(0, 120),
      motoboy: pick(
        payload?.motoboy,
        payload?.courier_name,
        payload?.courierName,
        payload?.deliveryman,
        payload?.delivery_person,
        payload?.courier?.name,
        config.motoboy_fallback
      ).slice(0, 80),
      notes: pick(payload?.notes, payload?.observacao, payload?.observation, payload?.comment).slice(0, 500),
      items,
      payments,
      payments_summary: summarizePayments(payments),
      subtotal: totals.subtotal || subtotalFallback,
      total: totals.total || totalFallback,
      created_at: safeCreatedAt,
      updated_at: agoraIso()
    };
  }

  function upsertOrder(orderInput) {
    const external = String(orderInput.external_id || "").trim().toLowerCase();
    const source = normalizeSource(orderInput.source || "MANUAL");
    const idx = state.orders.findIndex(
      (item) =>
        String(item.source || "").trim().toUpperCase() === source &&
        String(item.external_id || "").trim().toLowerCase() === external
    );

    if (idx >= 0) {
      const existing = state.orders[idx];
      const next = {
        ...existing,
        ...orderInput,
        id: existing.id,
        created_at: existing.created_at,
        updated_at: agoraIso()
      };
      state.orders[idx] = next;
      return { created: false, order: next };
    }

    const created = {
      id: randomUUID(),
      ...orderInput,
      source,
      status: normalizeStatus(orderInput.status, "RECEBIDO"),
      created_at: orderInput.created_at || agoraIso(),
      updated_at: agoraIso()
    };
    state.orders.unshift(created);
    return { created: true, order: created };
  }

  app.get("/", (_req, res) => {
    res.type("html").send(`
      <html>
        <head>
          <meta charset="utf-8" />
          <title>GastroCode Sandbox API</title>
          <style>
            body { font-family: Arial, sans-serif; background:#0b1228; color:#e7eeff; margin:0; padding:24px; }
            .card { max-width:780px; border:1px solid #2b3b6f; border-radius:14px; padding:18px; background:#121b38; }
            h1 { margin:0 0 10px; font-size:26px; }
            p, li { color:#c9d7ff; line-height:1.5; }
            code { background:#0f152d; padding:2px 6px; border-radius:6px; border:1px solid #2a3766; color:#fff; }
            a { color:#87b0ff; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>GastroCode Sandbox API</h1>
            <p>API de teste online.</p>
            <p>Health: <a href="/health">/health</a></p>
            <p>Para endpoints protegidos, envie header:</p>
            <p><code>x-api-key: ${DEFAULT_API_KEY}</code></p>
            <p>Exemplos protegidos: <code>/orders</code>, <code>/motoboy/pedidos/lote</code>, <code>/integrations</code></p>
            <p>Webhook publico: <code>POST /integrations/ifood/webhook</code> e <code>POST /integrations/99/webhook</code></p>
          </div>
        </body>
      </html>
    `);
  });

  app.get("/docs", (_req, res) => {
    return res.redirect("/");
  });

  async function dispatchWebhookEvent(event) {
    const ativos = state.webhooks.filter((item) => item.active !== false);
    if (ativos.length < 1) return;

    for (const hook of ativos) {
      const events = Array.isArray(hook.events) ? hook.events : ["*"];
      const recebe = events.includes("*") || events.includes(event.type);
      if (!recebe) continue;

      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 3000);
      try {
        const resp = await fetch(hook.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-sandbox-event": event.type
          },
          body: JSON.stringify(event),
          signal: ctrl.signal
        });
        hook.last_delivery_at = agoraIso();
        hook.last_status = resp.status;
        hook.last_error = null;
      } catch (error) {
        hook.last_delivery_at = agoraIso();
        hook.last_status = 0;
        hook.last_error = String(error?.message || "Falha no envio do webhook");
      } finally {
        clearTimeout(timeout);
      }
    }
    saveState(state);
  }

  function emitEvent(type, payload) {
    const event = {
      id: randomUUID(),
      type,
      created_at: agoraIso(),
      payload
    };

    state.events.unshift(event);
    if (state.events.length > 500) {
      state.events = state.events.slice(0, 500);
    }
    saveState(state);
    void dispatchWebhookEvent(event);
  }

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "gastrocode-sandbox-api",
      now: agoraIso()
    });
  });

  app.get("/meta", (_req, res) => {
    res.json({
      version: "1.0.0",
      merchant: state.meta.merchant,
      orders: state.orders.length,
      webhooks: state.webhooks.length,
      integrations: Object.keys(state.integrations || {}).length
    });
  });

  app.get("/integrations", (_req, res) => {
    const integrations = state.integrations || defaultIntegrations();
    res.json({
      total: 2,
      items: [sanitizeIntegrationOutput("ifood", integrations.ifood), sanitizeIntegrationOutput("ninenine", integrations.ninenine)]
    });
  });

  app.patch("/integrations/:provider/config", (req, res) => {
    const found = getIntegrationConfig(req.params.provider);
    if (!found) {
      return res.status(404).json({ error: "Integracao nao encontrada. Use ifood ou ninenine." });
    }

    const { provider, config } = found;
    const body = req.body || {};
    const next = {
      ...config,
      enabled: body.enabled === undefined ? config.enabled : toBool(body.enabled, config.enabled),
      base_url:
        body.base_url === undefined
          ? String(config.base_url || "")
          : String(body.base_url || "").trim().replace(/\/+$/, ""),
      import_path: body.import_path === undefined ? String(config.import_path || "/orders") : String(body.import_path || "/orders").trim(),
      import_query: body.import_query === undefined ? String(config.import_query || "") : String(body.import_query || "").trim(),
      api_key: body.api_key === undefined ? String(config.api_key || "") : String(body.api_key || "").trim(),
      bearer_token: body.bearer_token === undefined ? String(config.bearer_token || "") : String(body.bearer_token || "").trim(),
      merchant_id: body.merchant_id === undefined ? String(config.merchant_id || "") : String(body.merchant_id || "").trim(),
      webhook_secret:
        body.webhook_secret === undefined ? String(config.webhook_secret || "") : String(body.webhook_secret || "").trim(),
      default_payment:
        body.default_payment === undefined
          ? normalizePayment(config.default_payment || "ONLINE")
          : normalizePayment(body.default_payment || "ONLINE"),
      motoboy_fallback:
        body.motoboy_fallback === undefined
          ? String(config.motoboy_fallback || "")
          : String(body.motoboy_fallback || "").trim().slice(0, 80),
      last_import_at: config.last_import_at || null,
      last_import_result: config.last_import_result || ""
    };

    saveIntegrationConfig(provider.key, next);
    emitEvent("INTEGRATION_CONFIG_UPDATED", {
      provider: provider.key,
      enabled: toBool(next.enabled),
      updated_at: agoraIso()
    });

    return res.json(sanitizeIntegrationOutput(provider.key, next));
  });

  app.post("/integrations/:provider/import", async (req, res) => {
    const found = getIntegrationConfig(req.params.provider);
    if (!found) {
      return res.status(404).json({ error: "Integracao nao encontrada. Use ifood ou ninenine." });
    }
    const { provider, config } = found;
    if (!toBool(config.enabled)) {
      return res.status(400).json({ error: `Integracao ${provider.label} esta desativada.` });
    }

    const body = req.body || {};
    const fromDate = body.from ? new Date(String(body.from)) : null;
    const toDate = body.to ? new Date(String(body.to)) : null;
    const from = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate.toISOString() : "";
    const to = toDate && !Number.isNaN(toDate.getTime()) ? toDate.toISOString() : "";
    const limit = Math.max(1, Math.min(500, Number(body.limit || 200)));

    const importUrl = buildImportUrl(provider, config, from, to, limit);
    const headers = { accept: "application/json" };
    if (String(config.api_key || "").trim()) {
      headers["x-api-key"] = String(config.api_key || "").trim();
    }
    if (String(config.bearer_token || "").trim()) {
      headers.authorization = `Bearer ${String(config.bearer_token || "").trim()}`;
    }

    let payload = null;
    try {
      const response = await fetch(importUrl, { method: "GET", headers });
      const raw = await response.text();
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }
      if (!response.ok) {
        throw new Error(`Falha HTTP ${response.status}`);
      }
    } catch (error) {
      const failed = {
        ...config,
        last_import_at: agoraIso(),
        last_import_result: `Erro: ${String(error?.message || "falha de conexao")}`
      };
      saveIntegrationConfig(provider.key, failed);
      return res.status(502).json({
        error: `Falha ao importar ${provider.label}.`,
        detail: String(error?.message || "erro de conexao")
      });
    }

    const ordersPayload = extractOrderPayloads(provider, payload);
    let created = 0;
    let updated = 0;
    const imported = [];

    for (const item of ordersPayload.slice(0, limit)) {
      const order = buildOrderFromExternal(provider, item || {}, config);
      const result = upsertOrder(order);
      if (result.created) {
        created += 1;
        emitEvent("ORDER_IMPORTED", { provider: provider.key, action: "created", order: result.order });
      } else {
        updated += 1;
        emitEvent("ORDER_IMPORTED", { provider: provider.key, action: "updated", order: result.order });
      }
      imported.push(result.order);
    }

    saveState(state);
    const successConfig = {
      ...config,
      last_import_at: agoraIso(),
      last_import_result: `OK: ${created} criado(s), ${updated} atualizado(s)`
    };
    saveIntegrationConfig(provider.key, successConfig);

    return res.json({
      provider: provider.key,
      imported_total: imported.length,
      created,
      updated,
      import_url: importUrl,
      items: imported
    });
  });

  app.post("/integrations/:provider/webhook", (req, res) => {
    const found = getIntegrationConfig(req.params.provider);
    if (!found) {
      return res.status(404).json({ error: "Integracao nao encontrada. Use ifood ou ninenine." });
    }
    const { provider, config } = found;

    const secretConfigured = String(config.webhook_secret || "").trim();
    if (secretConfigured) {
      const secretHeader = String(req.headers["x-webhook-secret"] || "").trim();
      if (!secretHeader || secretHeader !== secretConfigured) {
        return res.status(401).json({ error: "Webhook nao autorizado. x-webhook-secret invalido." });
      }
    }

    const body = req.body || {};
    const ordersPayload = extractOrderPayloads(provider, body);
    if (ordersPayload.length < 1) {
      return res.status(400).json({ error: "Nenhum pedido encontrado no payload do webhook." });
    }

    let created = 0;
    let updated = 0;
    const items = [];
    for (const payload of ordersPayload) {
      const order = buildOrderFromExternal(provider, payload || {}, config);
      const result = upsertOrder(order);
      if (result.created) {
        created += 1;
        emitEvent("ORDER_IMPORTED", { provider: provider.key, action: "created", order: result.order });
      } else {
        updated += 1;
        emitEvent("ORDER_IMPORTED", { provider: provider.key, action: "updated", order: result.order });
      }
      items.push(result.order);
    }

    saveState(state);
    return res.status(202).json({
      ok: true,
      provider: provider.key,
      created,
      updated,
      items
    });
  });

  app.post("/auth/token", (req, res) => {
    if (req.auth?.type !== "api_key") {
      return res.status(403).json({ error: "Use x-api-key para emitir token." });
    }

    const ttlHours = Math.max(1, Math.min(48, Number(req.body?.ttl_hours || 8)));
    const token = `sbx_${randomUUID().replace(/-/g, "")}`;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

    state.tokens.unshift({
      id: randomUUID(),
      token,
      expires_at: expiresAt,
      created_at: agoraIso()
    });
    state.tokens = state.tokens.slice(0, 100);
    saveState(state);

    return res.status(201).json({
      access_token: token,
      token_type: "Bearer",
      expires_at: expiresAt
    });
  });

  app.get("/orders", (req, res) => {
    const status = String(req.query.status || "")
      .trim()
      .toUpperCase();
    const source = String(req.query.source || "")
      .trim()
      .toUpperCase();
    const motoboy = String(req.query.motoboy || "")
      .trim()
      .toLowerCase();

    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;

    let items = [...state.orders];
    if (status) items = items.filter((item) => item.status === status);
    if (source) items = items.filter((item) => item.source === source);
    if (motoboy) items = items.filter((item) => String(item.motoboy || "").toLowerCase().includes(motoboy));
    if (from && !Number.isNaN(from.getTime())) {
      items = items.filter((item) => new Date(item.created_at).getTime() >= from.getTime());
    }
    if (to && !Number.isNaN(to.getTime())) {
      items = items.filter((item) => new Date(item.created_at).getTime() <= to.getTime());
    }

    return res.json({
      total: items.length,
      items
    });
  });

  app.post("/orders", (req, res) => {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const payments = Array.isArray(body.payments)
      ? body.payments
      : body.payment
        ? [{ method: body.payment, amount: body.total || 0 }]
        : [];

    const normalizedItems = items.map((item) => ({
      sku: String(item.sku || "").trim(),
      name: String(item.name || item.nome || "Item").trim().slice(0, 120),
      qty: Math.max(1, Number(item.qty || item.quantidade || 1)),
      price: toMoney(item.price || item.preco || 0)
    }));

    const normalizedPayments = payments.map((item) => ({
      method: normalizePayment(item.method || item.forma_pagamento || "ONLINE"),
      amount: toMoney(item.amount || item.valor || 0)
    }));

    const totals = computeTotals(normalizedItems, normalizedPayments);
    const order = {
      id: randomUUID(),
      external_id: String(body.external_id || body.codigo || `PED-${Date.now()}`),
      source: normalizeSource(body.source || "MANUAL"),
      status: "RECEBIDO",
      customer_name: String(body.customer_name || body.cliente || "").trim(),
      motoboy: String(body.motoboy || "").trim(),
      notes: String(body.notes || body.observacao || "").trim(),
      items: normalizedItems,
      payments: normalizedPayments,
      payments_summary: summarizePayments(normalizedPayments),
      subtotal: totals.subtotal,
      total: totals.total,
      created_at: agoraIso(),
      updated_at: agoraIso()
    };

    state.orders.unshift(order);
    saveState(state);
    emitEvent("ORDER_CREATED", order);
    return res.status(201).json(order);
  });

  app.post("/motoboy/pedidos/lote", (req, res) => {
    const body = req.body || {};
    const motoboy = String(body.motoboy || "").trim();
    if (!motoboy) {
      return res.status(400).json({ error: "Informe o motoboy." });
    }

    const codes = parseCodes(body.codigos);
    if (codes.length < 1) {
      return res.status(400).json({ error: "Informe ao menos um codigo de pedido." });
    }

    const source = normalizeSource(body.source || "MANUAL");
    const payment = normalizePayment(body.payment || "ONLINE");
    const whenISO = body.whenISO ? new Date(String(body.whenISO)).toISOString() : agoraIso();

    const added = [];
    const duplicates = [];
    for (const code of codes) {
      const exists = state.orders.some(
        (order) =>
          String(order.external_id || "").toLowerCase() === String(code).toLowerCase() &&
          String(order.motoboy || "").toLowerCase() === motoboy.toLowerCase()
      );
      if (exists) {
        duplicates.push(code);
        continue;
      }

      const order = {
        id: randomUUID(),
        external_id: String(code),
        source,
        status: "RECEBIDO",
        customer_name: "",
        motoboy,
        notes: "",
        items: [
          {
            sku: "",
            name: `Pedido ${code}`,
            qty: 1,
            price: 0
          }
        ],
        payments: [{ method: payment, amount: 0 }],
        payments_summary: [{ method: payment, amount: 0 }],
        subtotal: 0,
        total: 0,
        created_at: whenISO,
        updated_at: whenISO
      };
      state.orders.unshift(order);
      added.push(order);
      emitEvent("ORDER_CREATED", order);
    }

    saveState(state);
    return res.status(201).json({
      added_count: added.length,
      duplicates,
      orders: added
    });
  });

  app.get("/orders/:id", (req, res) => {
    const order = state.orders.find((item) => item.id === req.params.id);
    if (!order) return res.status(404).json({ error: "Pedido nao encontrado." });
    return res.json(order);
  });

  app.patch("/orders/:id/status", (req, res) => {
    const order = state.orders.find((item) => item.id === req.params.id);
    if (!order) return res.status(404).json({ error: "Pedido nao encontrado." });

    const status = String(req.body?.status || "")
      .trim()
      .toUpperCase();
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({
        error: "Status invalido.",
        allowed: STATUS_VALIDOS
      });
    }

    const oldStatus = order.status;
    order.status = status;
    order.updated_at = agoraIso();
    if (req.body?.notes !== undefined) {
      order.notes = String(req.body.notes || "").trim();
    }
    saveState(state);

    emitEvent("ORDER_STATUS_CHANGED", {
      order_id: order.id,
      external_id: order.external_id,
      old_status: oldStatus,
      new_status: status,
      changed_at: order.updated_at
    });

    return res.json(order);
  });

  app.get("/webhooks/subscriptions", (_req, res) => {
    res.json({
      total: state.webhooks.length,
      items: state.webhooks
    });
  });

  app.post("/webhooks/subscriptions", (req, res) => {
    const url = String(req.body?.url || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: "Informe uma URL de webhook valida (http/https)." });
    }

    const events = Array.isArray(req.body?.events) && req.body.events.length > 0
      ? req.body.events.map((item) => String(item || "").trim()).filter(Boolean)
      : ["*"];

    const hook = {
      id: randomUUID(),
      url,
      events,
      active: true,
      created_at: agoraIso(),
      last_delivery_at: null,
      last_status: null,
      last_error: null
    };
    state.webhooks.unshift(hook);
    saveState(state);
    res.status(201).json(hook);
  });

  app.delete("/webhooks/subscriptions/:id", (req, res) => {
    const hook = state.webhooks.find((item) => item.id === req.params.id);
    if (!hook) return res.status(404).json({ error: "Webhook nao encontrado." });
    hook.active = false;
    hook.updated_at = agoraIso();
    saveState(state);
    res.json({ ok: true, id: hook.id, active: false });
  });

  app.get("/events", (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    res.json({
      total: state.events.length,
      items: state.events.slice(0, limit)
    });
  });

  app.post("/sandbox/reset", (req, res) => {
    if (req.auth?.type !== "api_key") {
      return res.status(403).json({ error: "Use x-api-key para reset." });
    }
    const fresh = defaultState();
    state.meta = fresh.meta;
    state.integrations = fresh.integrations;
    state.tokens = [];
    state.webhooks = [];
    state.events = [];
    state.orders = [];
    saveState(state);
    return res.json({ ok: true });
  });

  app.use((error, _req, res, _next) => {
    const status = Number(error?.status || 500);
    const message = String(error?.message || "Erro interno");
    res.status(status).json({ error: message });
  });

  return app;
}

function startServer(port = PORT) {
  const app = createApp();
  return app.listen(port, () => {
    console.log(`[sandbox-api] online em http://localhost:${port}`);
    console.log(`[sandbox-api] x-api-key padrao: ${DEFAULT_API_KEY}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer
};
