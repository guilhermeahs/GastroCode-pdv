const { randomBytes } = require("crypto");
const SistemaConfig = require("../models/SistemaConfig");
const EntregaModel = require("../models/Entrega");
const IfoodHomologacaoService = require("./ifoodHomologacaoService");

const PROVIDERS = {
  hub: {
    key: "hub",
    label: "Hub GastroCode",
    source: "HUB"
  },
  ifood: {
    key: "ifood",
    label: "iFood",
    source: "IFOOD"
  },
  ninenine: {
    key: "ninenine",
    label: "99",
    source: "NINENINE"
  }
};

const PAYMENT_MAP = {
  PIX: "PIX",
  DINHEIRO: "DINHEIRO",
  CASH: "DINHEIRO",
  DEBITO: "DEBITO",
  DEBIT: "DEBITO",
  CREDITO: "CREDITO",
  CREDIT: "CREDITO",
  ONLINE: "ONLINE",
  APP: "ONLINE"
};

const SOURCE_MAP = {
  HUB: "HUB",
  IFOOD: "IFOOD",
  IF: "IFOOD",
  NINENINE: "NINENINE",
  NINE: "NINENINE",
  "99": "NINENINE",
  ANOTA_AI: "ANOTA_AI",
  ANOTAAI: "ANOTA_AI",
  MANUAL: "MANUAL"
};

let autoSyncInterval = null;
let autoSyncBootTimer = null;
let autoSyncRunning = false;

function toProviderKey(input) {
  const raw = String(input || "")
    .trim()
    .toLowerCase();
  if (raw === "99") return "ninenine";
  if (raw === "hub" || raw === "gastrohub") return "hub";
  return raw;
}

function getProvider(input) {
  const key = toProviderKey(input);
  return PROVIDERS[key] || null;
}

function cfgKey(provider, field) {
  return `entregas_${provider.key}_${field}`;
}

function gerarHubToken() {
  return `gch_${randomBytes(18).toString("hex")}`;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  const txt = String(value).trim().toLowerCase();
  if (["1", "true", "sim", "on", "yes"].includes(txt)) return true;
  if (["0", "false", "nao", "não", "off", "no"].includes(txt)) return false;
  return Boolean(fallback);
}

function parseAmount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSourceRaw(value, fallback = "MANUAL") {
  const key = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (!key) return fallback;
  return SOURCE_MAP[key] || key.slice(0, 24);
}

function normalizePaymentRaw(value) {
  const key = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (!key) return "";
  return PAYMENT_MAP[key] || key;
}

function pick(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const txt = String(value).trim();
    if (txt) return txt;
  }
  return "";
}

function safeIso(value) {
  if (!value) return new Date().toISOString();
  const dt = new Date(String(value));
  if (Number.isNaN(dt.getTime())) return new Date().toISOString();
  return dt.toISOString();
}

function inferSandboxApiKey(config = {}) {
  const candidates = [config.import_url, config.base_url];
  for (const candidate of candidates) {
    const txt = String(candidate || "").trim();
    if (!txt) continue;
    try {
      const u = new URL(txt);
      const host = String(u.hostname || "").trim().toLowerCase();
      if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".trycloudflare.com")) {
        return "gastrocode-teste-123";
      }
    } catch {
      continue;
    }
  }
  return "";
}

function compactSnippet(text = "", maxLen = 160) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 3)}...`;
}

function formatNetworkError(url, error) {
  const code = String(error?.cause?.code || error?.code || "").trim().toUpperCase();
  const rawMessage = String(error?.message || "erro externo");

  if (String(error?.name || "").toLowerCase() === "aborterror") {
    return `Timeout ao acessar ${url}. Verifique internet, VPN/proxy e firewall.`;
  }

  if (/fetch failed/i.test(rawMessage)) {
    if (code === "ENOTFOUND") {
      return `Dominio nao encontrado ao acessar ${url} (ENOTFOUND).`;
    }
    if (code === "ECONNREFUSED") {
      return `Conexao recusada ao acessar ${url} (ECONNREFUSED).`;
    }
    if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
      return `Tempo esgotado ao conectar em ${url} (${code}).`;
    }
    return `Falha de rede ao acessar ${url}. Confira URL, internet e se o tunnel esta online.`;
  }

  return code ? `${rawMessage} (${code})` : rawMessage;
}

function readConfig(provider) {
  if (provider.key === "hub") {
    const enabled = toBool(SistemaConfig.get(cfgKey(provider, "enabled"), "0"), false);
    const hubToken = String(SistemaConfig.get(cfgKey(provider, "hub_token"), "") || "").trim();
    const publicBaseUrl = String(SistemaConfig.get(cfgKey(provider, "public_base_url"), "") || "")
      .trim()
      .replace(/\/+$/, "");
    const motoboyFallback = String(
      SistemaConfig.get(cfgKey(provider, "motoboy_fallback"), "Entregas Hub") || "Entregas Hub"
    ).trim();
    const lastSyncAt = String(SistemaConfig.get(cfgKey(provider, "last_sync_at"), "") || "").trim();
    const lastSyncResult = String(SistemaConfig.get(cfgKey(provider, "last_sync_result"), "") || "").trim();
    const webhookPath = hubToken ? `/api/entregas/hub/webhook/${hubToken}` : "";
    const webhookUrl = publicBaseUrl && webhookPath ? `${publicBaseUrl}${webhookPath}` : "";
    const webhookIfoodUrl = webhookUrl ? `${webhookUrl}?source=IFOOD` : "";
    const webhookNinenineUrl = webhookUrl ? `${webhookUrl}?source=NINENINE` : "";

    return {
      provider: provider.key,
      label: provider.label,
      source: provider.source,
      enabled,
      hub_token: hubToken,
      public_base_url: publicBaseUrl,
      webhook_path: webhookPath,
      webhook_url: webhookUrl,
      webhook_ifood_url: webhookIfoodUrl,
      webhook_ninenine_url: webhookNinenineUrl,
      motoboy_fallback: motoboyFallback || "Entregas Hub",
      last_sync_at: lastSyncAt || null,
      last_sync_result: lastSyncResult || ""
    };
  }

  const enabled = toBool(SistemaConfig.get(cfgKey(provider, "enabled"), "0"), false);
  const importUrl = String(SistemaConfig.get(cfgKey(provider, "import_url"), "") || "").trim();
  const baseUrl = String(SistemaConfig.get(cfgKey(provider, "base_url"), "") || "").trim();
  const importPath = String(SistemaConfig.get(cfgKey(provider, "import_path"), "/orders") || "/orders").trim();
  const importQuery = String(
    SistemaConfig.get(cfgKey(provider, "import_query"), `source=${provider.source}`) || `source=${provider.source}`
  ).trim();
  const apiKey = String(SistemaConfig.get(cfgKey(provider, "api_key"), "") || "").trim();
  const bearerToken = String(SistemaConfig.get(cfgKey(provider, "bearer_token"), "") || "").trim();
  const motoboyFallback = String(
    SistemaConfig.get(cfgKey(provider, "motoboy_fallback"), provider.label) || provider.label
  ).trim();
  const merchantId = String(SistemaConfig.get(cfgKey(provider, "merchant_id"), "") || "").trim();
  const webhookSecret = String(SistemaConfig.get(cfgKey(provider, "webhook_secret"), "") || "").trim();
  const lastSyncAt = String(SistemaConfig.get(cfgKey(provider, "last_sync_at"), "") || "").trim();
  const lastSyncResult = String(SistemaConfig.get(cfgKey(provider, "last_sync_result"), "") || "").trim();

  const baseConfig = {
    provider: provider.key,
    label: provider.label,
    source: provider.source,
    enabled,
    import_url: importUrl,
    base_url: baseUrl,
    import_path: importPath || "/orders",
    import_query: importQuery,
    api_key: apiKey,
    bearer_token: bearerToken,
    motoboy_fallback: motoboyFallback || provider.label,
    merchant_id: merchantId,
    webhook_secret: webhookSecret,
    last_sync_at: lastSyncAt || null,
    last_sync_result: lastSyncResult || ""
  };

  if (provider.key === "ifood") {
    return {
      ...baseConfig,
      ...IfoodHomologacaoService.integrationExtrasForResponse()
    };
  }

  return baseConfig;
}

function serializeForResponse(config) {
  const base = {
    provider: config.provider,
    label: config.label,
    source: config.source,
    enabled: config.enabled,
    motoboy_fallback: config.motoboy_fallback,
    last_sync_at: config.last_sync_at,
    last_sync_result: config.last_sync_result
  };

  if (config.provider === "hub") {
    return {
      ...base,
      hub_token: config.hub_token || "",
      public_base_url: config.public_base_url || "",
      webhook_path: config.webhook_path || "",
      webhook_url: config.webhook_url || "",
      webhook_ifood_url: config.webhook_ifood_url || "",
      webhook_ninenine_url: config.webhook_ninenine_url || ""
    };
  }

  const shared = {
    ...base,
    import_url: config.import_url,
    base_url: config.base_url,
    import_path: config.import_path,
    import_query: config.import_query,
    api_key: config.api_key,
    bearer_token: config.bearer_token,
    merchant_id: config.merchant_id,
    webhook_secret: config.webhook_secret
  };

  if (config.provider === "ifood") {
    return {
      ...shared,
      homologacao_enabled: Boolean(config.homologacao_enabled),
      homologacao_base_url: config.homologacao_base_url || config.base_url || "",
      homologacao_token_url: config.homologacao_token_url || "",
      homologacao_polling_path: config.homologacao_polling_path || "",
      homologacao_ack_path: config.homologacao_ack_path || "",
      homologacao_order_details_path: config.homologacao_order_details_path || "",
      homologacao_order_details_path_fallback: config.homologacao_order_details_path_fallback || "",
      homologacao_client_id: config.homologacao_client_id || "",
      homologacao_grant_type: config.homologacao_grant_type || "client_credentials",
      homologacao_scope: config.homologacao_scope || "",
      homologacao_authorization_code: config.homologacao_authorization_code || "",
      homologacao_refresh_token: config.homologacao_refresh_token || "",
      homologacao_polling_merchants: config.homologacao_polling_merchants || "",
      homologacao_polling_interval_seconds: Number(config.homologacao_polling_interval_seconds || 30),
      homologacao_polling_exclude_heartbeat:
        config.homologacao_polling_exclude_heartbeat === undefined
          ? true
          : Boolean(config.homologacao_polling_exclude_heartbeat),
      homologacao_auto_ack: Boolean(config.homologacao_auto_ack),
      homologacao_webhook_signature_required: Boolean(config.homologacao_webhook_signature_required),
      homologacao_last_token_refresh_at: config.homologacao_last_token_refresh_at || null,
      homologacao_last_sync_at: config.homologacao_last_sync_at || null,
      homologacao_last_sync_result: config.homologacao_last_sync_result || ""
    };
  }

  return shared;
}

function saveConfig(provider, body = {}) {
  if (provider.key === "hub") {
    const current = readConfig(provider);
    const rotateToken = toBool(body.rotate_token, false);
    const incomingToken = String(body.hub_token || "").trim();
    const nextToken = rotateToken ? gerarHubToken() : incomingToken || current.hub_token || "";

    const next = {
      ...current,
      enabled: body.enabled === undefined ? current.enabled : toBool(body.enabled, current.enabled),
      public_base_url:
        body.public_base_url === undefined
          ? current.public_base_url
          : String(body.public_base_url || "").trim().replace(/\/+$/, ""),
      motoboy_fallback:
        body.motoboy_fallback === undefined
          ? current.motoboy_fallback
          : String(body.motoboy_fallback || "").trim().slice(0, 80),
      hub_token: nextToken
    };

    SistemaConfig.setMany({
      [cfgKey(provider, "enabled")]: next.enabled ? "1" : "0",
      [cfgKey(provider, "public_base_url")]: next.public_base_url || "",
      [cfgKey(provider, "hub_token")]: next.hub_token || "",
      [cfgKey(provider, "motoboy_fallback")]: next.motoboy_fallback || "Entregas Hub"
    });

    if (next.enabled && !next.hub_token) {
      SistemaConfig.set(cfgKey(provider, "hub_token"), gerarHubToken());
    }
    return readConfig(provider);
  }

  const current = readConfig(provider);
  const next = {
    ...current,
    enabled: body.enabled === undefined ? current.enabled : toBool(body.enabled, current.enabled),
    import_url: body.import_url === undefined ? current.import_url : String(body.import_url || "").trim(),
    base_url: body.base_url === undefined ? current.base_url : String(body.base_url || "").trim().replace(/\/+$/, ""),
    import_path: body.import_path === undefined ? current.import_path : String(body.import_path || "/orders").trim(),
    import_query: body.import_query === undefined ? current.import_query : String(body.import_query || "").trim(),
    api_key: body.api_key === undefined ? current.api_key : String(body.api_key || "").trim(),
    bearer_token: body.bearer_token === undefined ? current.bearer_token : String(body.bearer_token || "").trim(),
    motoboy_fallback:
      body.motoboy_fallback === undefined
        ? current.motoboy_fallback
        : String(body.motoboy_fallback || "").trim().slice(0, 80),
    merchant_id: body.merchant_id === undefined ? current.merchant_id : String(body.merchant_id || "").trim(),
    webhook_secret:
      body.webhook_secret === undefined ? current.webhook_secret : String(body.webhook_secret || "").trim()
  };

  SistemaConfig.setMany({
    [cfgKey(provider, "enabled")]: next.enabled ? "1" : "0",
    [cfgKey(provider, "import_url")]: next.import_url,
    [cfgKey(provider, "base_url")]: next.base_url,
    [cfgKey(provider, "import_path")]: next.import_path || "/orders",
    [cfgKey(provider, "import_query")]: next.import_query,
    [cfgKey(provider, "api_key")]: next.api_key,
    [cfgKey(provider, "bearer_token")]: next.bearer_token,
    [cfgKey(provider, "motoboy_fallback")]: next.motoboy_fallback || provider.label,
    [cfgKey(provider, "merchant_id")]: next.merchant_id,
    [cfgKey(provider, "webhook_secret")]: next.webhook_secret
  });

  if (provider.key === "ifood") {
    IfoodHomologacaoService.applyIntegrationSavePayload(body || {});
  }

  return readConfig(provider);
}

function buildImportUrl(config, query) {
  const importUrlRaw = String(config.import_url || "").trim();
  if (importUrlRaw) {
    const url = new URL(importUrlRaw);
    if (query?.from) url.searchParams.set("from", String(query.from));
    if (query?.to) url.searchParams.set("to", String(query.to));
    if (query?.limit) url.searchParams.set("limit", String(query.limit));
    if (!url.searchParams.get("source")) {
      url.searchParams.set("source", config.source);
    }
    return url.toString();
  }

  const base = String(config.base_url || "").trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error(`Configure o link de conexao ou a URL base da integracao ${config.label}.`);
  }

  const path = String(config.import_path || "/orders").trim() || "/orders";
  const url = new URL(path.startsWith("/") ? `${base}${path}` : `${base}/${path}`);

  const baseQuery = String(config.import_query || "")
    .split("&")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const part of baseQuery) {
    const [rawKey, rawValue] = part.split("=");
    const key = String(rawKey || "").trim();
    if (!key) continue;
    url.searchParams.set(key, String(rawValue || "").trim());
  }

  if (!url.searchParams.get("source")) {
    url.searchParams.set("source", config.source);
  }

  if (query?.from) url.searchParams.set("from", String(query.from));
  if (query?.to) url.searchParams.set("to", String(query.to));
  if (query?.limit) url.searchParams.set("limit", String(query.limit));
  if (config.merchant_id) {
    url.searchParams.set("merchant_id", config.merchant_id);
  }

  return url.toString();
}

function extractPayments(order) {
  if (Array.isArray(order?.payments)) return order.payments;
  if (Array.isArray(order?.payment_methods)) return order.payment_methods;
  if (Array.isArray(order?.paymentMethods)) return order.paymentMethods;
  if (Array.isArray(order?.pagamentos)) return order.pagamentos;

  const single = order?.payment || order?.forma_pagamento || order?.payment_method || order?.paymentMethod;
  if (single) {
    return [{ method: single, amount: order?.total || order?.amount || order?.valor || 0 }];
  }
  return [];
}

function resolveSinglePayment(provider, order, fallback = "ONLINE") {
  const list = extractPayments(order);
  if (!Array.isArray(list) || list.length < 1) {
    return { payment: normalizePaymentRaw(fallback) || "ONLINE", mixed: false };
  }

  const uniqueMethods = new Set();
  for (const item of list) {
    const method = normalizePaymentRaw(item?.method || item?.forma_pagamento || item?.type || "");
    if (!method) continue;
    const amount = parseAmount(item?.amount ?? item?.valor ?? item?.value);
    if (amount <= 0) continue;
    uniqueMethods.add(method);
  }

  if (uniqueMethods.size > 1 && (provider.key === "ifood" || provider.key === "ninenine")) {
    return { payment: "", mixed: true };
  }

  if (uniqueMethods.size >= 1) {
    return { payment: Array.from(uniqueMethods)[0], mixed: false };
  }

  const first = list[0];
  return {
    payment: normalizePaymentRaw(first?.method || first?.forma_pagamento || first?.type || fallback) || "ONLINE",
    mixed: false
  };
}

function extractOrders(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.orders)) return payload.orders;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.order || payload.pedido) return [payload.order || payload.pedido];
  if (payload.id || payload.external_id || payload.order_id || payload.orderId) return [payload];
  return [];
}

function mapExternalOrder(provider, config, order) {
  const numero = pick(
    order?.external_id,
    order?.externalId,
    order?.id,
    order?.code,
    order?.numero,
    order?.order_id,
    order?.orderId,
    order?.display_id
  );
  const motoboy = pick(
    order?.motoboy,
    order?.courier_name,
    order?.courierName,
    order?.deliveryman,
    order?.courier?.name,
    config.motoboy_fallback,
    provider.label
  );

  const paymentResult = resolveSinglePayment(provider, order, "ONLINE");
  const externalId = pick(order?.id, order?.order_id, order?.orderId, order?.external_id, order?.externalId, numero);
  const status = String(order?.status || order?.order_status || order?.orderStatus || "RECEBIDO")
    .trim()
    .toUpperCase()
    .slice(0, 40);

  return {
    numero,
    source: provider.source,
    payment: paymentResult.payment || "ONLINE",
    mixed: paymentResult.mixed,
    whenISO: safeIso(order?.created_at || order?.createdAt || order?.date || order?.data || new Date().toISOString()),
    motoboy,
    external_id: String(externalId || "").trim().slice(0, 120),
    status: status || "RECEBIDO",
    detalhes: order && typeof order === "object" ? order : null
  };
}

function providerFromHint(value) {
  const provider = getProvider(value);
  if (provider) return provider;
  const source = normalizeSourceRaw(value, "");
  if (source === "IFOOD") return PROVIDERS.ifood;
  if (source === "NINENINE") return PROVIDERS.ninenine;
  return PROVIDERS.hub;
}

function extractHubOrders(payload = {}) {
  if (Array.isArray(payload?.pedidos)) return payload.pedidos;
  if (Array.isArray(payload?.codes)) return payload.codes.map((numero) => ({ numero }));
  const extracted = extractOrders(payload);
  if (Array.isArray(extracted) && extracted.length > 0) return extracted;
  if (payload?.numero || payload?.external_id || payload?.id || payload?.order_id || payload?.orderId) {
    return [payload];
  }
  return [];
}

function mapHubOrder(config, orderInput = {}, defaults = {}) {
  const order =
    orderInput && typeof orderInput === "object"
      ? orderInput
      : {
          numero: String(orderInput || "")
        };

  const providerHint = providerFromHint(defaults.provider || order?.provider || order?.source || "");
  const numero = pick(
    order?.numero,
    order?.external_id,
    order?.externalId,
    order?.id,
    order?.code,
    order?.order_id,
    order?.orderId,
    order?.display_id
  );
  const motoboy = pick(
    order?.motoboy,
    order?.courier_name,
    order?.courierName,
    order?.deliveryman,
    order?.courier?.name,
    defaults?.motoboy,
    config?.motoboy_fallback,
    "Entregas Hub"
  );
  const source = normalizeSourceRaw(order?.source || providerHint?.source || defaults?.source || "HUB", "HUB");
  const paymentResult = resolveSinglePayment(providerHint, order, defaults?.payment || "ONLINE");
  const externalId = pick(order?.id, order?.order_id, order?.orderId, order?.external_id, order?.externalId, numero);
  const status = String(order?.status || order?.order_status || order?.orderStatus || "RECEBIDO")
    .trim()
    .toUpperCase()
    .slice(0, 40);

  return {
    numero,
    source,
    payment: paymentResult.payment || "ONLINE",
    mixed: paymentResult.mixed,
    whenISO: safeIso(
      order?.whenISO ||
        order?.data_iso ||
        order?.created_at ||
        order?.createdAt ||
        order?.date ||
        order?.data ||
        defaults?.whenISO ||
        new Date().toISOString()
    ),
    motoboy,
    external_id: String(externalId || "").trim().slice(0, 120),
    status: status || "RECEBIDO",
    detalhes: order && typeof order === "object" ? order : null
  };
}

function marcarResultadoSync(provider, message) {
  SistemaConfig.setMany({
    [cfgKey(provider, "last_sync_at")]: new Date().toISOString(),
    [cfgKey(provider, "last_sync_result")]: String(message || "")
  });
}

function validarHubToken(incomingToken, config) {
  const tokenRecebido = String(incomingToken || "").trim();
  const tokenEsperado = String(config?.hub_token || "").trim();
  if (!tokenEsperado) {
    const error = new Error("Hub sem token configurado.");
    error.statusCode = 503;
    throw error;
  }
  if (!tokenRecebido || tokenRecebido !== tokenEsperado) {
    const error = new Error("Webhook Hub nao autorizado (token invalido).");
    error.statusCode = 401;
    throw error;
  }
}

function receberHubWebhook(payload = {}, options = {}) {
  const provider = PROVIDERS.hub;
  const config = readConfig(provider);
  if (!config.enabled) {
    const error = new Error("Hub desativado.");
    error.statusCode = 403;
    throw error;
  }

  validarHubToken(options?.token, config);

  const root = payload && typeof payload === "object" ? payload : {};
  const defaults = {
    provider: options?.provider || root?.provider || root?.canal || "",
    source: options?.source || root?.source || "",
    payment: options?.payment || root?.payment || root?.forma_pagamento || "",
    motoboy: options?.motoboy || root?.motoboy || "",
    whenISO: options?.whenISO || root?.whenISO || root?.data_iso || ""
  };

  const rawOrders = extractHubOrders(root);
  if (rawOrders.length < 1) {
    const message = "Hub: nenhum pedido valido no payload.";
    marcarResultadoSync(provider, message);
    return {
      provider: provider.key,
      imported: 0,
      created: 0,
      updated: 0,
      mixedSkipped: 0,
      invalidSkipped: 0,
      message
    };
  }

  const pedidosParaFila = [];
  let mixedSkipped = 0;
  let invalidSkipped = 0;

  for (const rawOrder of rawOrders) {
    const mapped = mapHubOrder(config, rawOrder || {}, defaults);
    if (!mapped.numero) {
      invalidSkipped += 1;
      continue;
    }
    if (mapped.mixed) {
      mixedSkipped += 1;
      continue;
    }
    pedidosParaFila.push({
      numero: mapped.numero,
      source: mapped.source,
      payment: mapped.payment,
      whenISO: mapped.whenISO,
      external_id: mapped.external_id || "",
      status: mapped.status || "RECEBIDO",
      detalhes: mapped.detalhes || null
    });
  }

  const result = EntregaModel.upsertPedidosIntegracao({
    pedidos: pedidosParaFila
  });
  const created = Number(result?.addedCount || 0);
  const updated = Number(result?.updatedCount || 0);
  const imported = Number(result?.totalProcessado || 0);

  const message = `Hub: ${created} novo(s), ${updated} atualizado(s), ${mixedSkipped} misto bloqueado(s), ${invalidSkipped} invalido(s).`;
  marcarResultadoSync(provider, message);

  return {
    provider: provider.key,
    imported,
    created,
    updated,
    mixedSkipped,
    invalidSkipped,
    message
  };
}

async function importFromProvider(provider, query = {}) {
  if (provider.key === "hub") {
    return {
      provider: provider.key,
      imported: 0,
      created: 0,
      updated: 0,
      mixedSkipped: 0,
      invalidSkipped: 0,
      message: "Hub recebe pedidos por webhook. Use o endpoint de entrada para importar em tempo real."
    };
  }

  const config = readConfig(provider);
  if (!config.enabled) {
    throw new Error(`Integracao ${config.label} desativada.`);
  }

  if (provider.key === "ifood" && config.homologacao_enabled) {
    return IfoodHomologacaoService.syncNow(query || {});
  }

  const url = buildImportUrl(config, {
    from: query?.from || "",
    to: query?.to || "",
    limit: Math.max(1, Math.min(500, Number(query?.limit || 250)))
  });

  const headers = {
    accept: "application/json"
  };

  const sandboxApiKey = inferSandboxApiKey(config);
  if (config.api_key) {
    headers["x-api-key"] = config.api_key;
  } else if (sandboxApiKey) {
    headers["x-api-key"] = sandboxApiKey;
  }
  if (config.bearer_token) headers.authorization = `Bearer ${config.bearer_token}`;

  let payload;
  try {
    const response = await fetch(url, { method: "GET", headers });
    const raw = await response.text();

    if (!response.ok) {
      const preview = compactSnippet(raw);
      throw new Error(`HTTP ${response.status}${preview ? ` - ${preview}` : ""}`);
    }

    if (!raw || !String(raw).trim()) {
      payload = {};
    } else {
      try {
        payload = JSON.parse(raw);
      } catch {
        const preview = compactSnippet(raw);
        throw new Error(
          `Resposta invalida da integracao (nao-JSON). Verifique a URL/endpoint configurado. Retorno: ${preview || "vazio"}`
        );
      }
    }
  } catch (error) {
    const message = `Falha no sync ${config.label}: ${formatNetworkError(url, error)}`;
    SistemaConfig.setMany({
      [cfgKey(provider, "last_sync_at")]: new Date().toISOString(),
      [cfgKey(provider, "last_sync_result")]: message
    });
    throw new Error(message);
  }

  const rawOrders = extractOrders(payload);
  if (rawOrders.length < 1) {
    const message = `Sync ${config.label}: nenhum pedido encontrado.`;
    SistemaConfig.setMany({
      [cfgKey(provider, "last_sync_at")]: new Date().toISOString(),
      [cfgKey(provider, "last_sync_result")]: message
    });
    return {
      provider: provider.key,
      url,
      imported: 0,
      created: 0,
      updated: 0,
      mixedSkipped: 0,
      invalidSkipped: 0,
      message
    };
  }

  const pedidosParaFila = [];
  let mixedSkipped = 0;
  let invalidSkipped = 0;

  for (const order of rawOrders) {
    const mapped = mapExternalOrder(provider, config, order || {});
    if (!mapped.numero) {
      invalidSkipped += 1;
      continue;
    }
    if (mapped.mixed) {
      mixedSkipped += 1;
      continue;
    }
    pedidosParaFila.push({
      numero: mapped.numero,
      source: mapped.source,
      payment: mapped.payment,
      whenISO: mapped.whenISO,
      external_id: mapped.external_id || "",
      status: mapped.status || "RECEBIDO",
      detalhes: mapped.detalhes || null
    });
  }

  const result = EntregaModel.upsertPedidosIntegracao({
    pedidos: pedidosParaFila
  });
  const created = Number(result?.addedCount || 0);
  const updated = Number(result?.updatedCount || 0);
  const imported = Number(result?.totalProcessado || 0);

  const message = `Sync ${config.label}: ${created} novo(s), ${updated} atualizado(s), ${mixedSkipped} misto bloqueado(s), ${invalidSkipped} invalido(s).`;
  const nowIso = new Date().toISOString();
  SistemaConfig.setMany({
    [cfgKey(provider, "last_sync_at")]: nowIso,
    [cfgKey(provider, "last_sync_result")]: message
  });

  return {
    provider: provider.key,
    url,
    imported,
    created,
    updated,
    mixedSkipped,
    invalidSkipped,
    message
  };
}

async function sincronizarTodosIntegrados(query = {}) {
  const providers = Object.values(PROVIDERS);
  const results = [];

  for (const provider of providers) {
    if (provider.key === "hub") continue;
    const cfg = readConfig(provider);
    if (!cfg.enabled) continue;
    try {
      const result = await importFromProvider(provider, query);
      results.push({
        provider: provider.key,
        ok: true,
        ...(result || {})
      });
    } catch (error) {
      results.push({
        provider: provider.key,
        ok: false,
        message: String(error?.message || "falha no sync")
      });
    }
  }

  return results;
}

async function executarAutoSyncComLog() {
  if (autoSyncRunning) return;
  autoSyncRunning = true;
  try {
    const results = await sincronizarTodosIntegrados({ limit: 250 });
    if (results.length > 0) {
      const resumo = results
        .map((item) => {
          if (!item.ok) return `${item.provider}: erro`;
          const created = Number(item.created || 0);
          const updated = Number(item.updated || 0);
          return `${item.provider}: +${created} novo(s), ${updated} atualizado(s)`;
        })
        .join(" | ");
      console.log(`[entregas] auto-sync ${new Date().toISOString()} -> ${resumo}`);
    }
  } catch (error) {
    console.error(`[entregas] falha no auto-sync: ${String(error?.message || error)}`);
  } finally {
    autoSyncRunning = false;
  }
}

function intervaloAutoSyncMs() {
  const rawSec = Number(process.env.ENTREGAS_AUTO_SYNC_SECONDS || 30);
  const safeSec = Number.isFinite(rawSec) ? rawSec : 30;
  return Math.max(30, Math.min(180, Math.round(safeSec))) * 1000;
}

function iniciarAgendadorAutoSync() {
  if (autoSyncInterval || autoSyncBootTimer) return;

  const intervalMs = intervaloAutoSyncMs();
  autoSyncBootTimer = setTimeout(() => {
    void executarAutoSyncComLog();
  }, 8000);
  if (typeof autoSyncBootTimer.unref === "function") {
    autoSyncBootTimer.unref();
  }

  autoSyncInterval = setInterval(() => {
    void executarAutoSyncComLog();
  }, intervalMs);
  if (typeof autoSyncInterval.unref === "function") {
    autoSyncInterval.unref();
  }

  console.log(`[entregas] auto-sync ligado (${Math.round(intervalMs / 1000)}s).`);
}

const EntregasIntegracaoService = {
  listarIntegracoes() {
    return [readConfig(PROVIDERS.hub), readConfig(PROVIDERS.ifood), readConfig(PROVIDERS.ninenine)].map(
      serializeForResponse
    );
  },

  salvarIntegracao(providerInput, body = {}) {
    const provider = getProvider(providerInput);
    if (!provider) {
      throw new Error("Integracao invalida. Use hub, ifood ou 99.");
    }
    return serializeForResponse(saveConfig(provider, body || {}));
  },

  async sincronizar(providerInput, query = {}) {
    const provider = getProvider(providerInput);
    if (!provider) {
      throw new Error("Integracao invalida. Use hub, ifood ou 99.");
    }
    return importFromProvider(provider, query || {});
  },

  async sincronizarTodas(query = {}) {
    return sincronizarTodosIntegrados(query || {});
  },

  receberWebhookHub(payload = {}, options = {}) {
    return receberHubWebhook(payload || {}, options || {});
  },

  webhookIfood(payload = {}, options = {}) {
    return IfoodHomologacaoService.processWebhook(payload || {}, options || {});
  },

  getIfoodHomologacaoStatus() {
    return IfoodHomologacaoService.getStatus();
  },

  salvarIfoodHomologacao(config = {}) {
    return IfoodHomologacaoService.saveConfig(config || {});
  },

  sincronizarIfoodHomologacao(query = {}) {
    return IfoodHomologacaoService.syncNow(query || {});
  },

  listarIfoodEventos(limit = 60) {
    return IfoodHomologacaoService.listRecentEvents(limit);
  },

  renovarIfoodToken(force = true) {
    return IfoodHomologacaoService.refreshAccessToken(Boolean(force));
  },

  iniciarAgendadorAutoSync
};

module.exports = EntregasIntegracaoService;
