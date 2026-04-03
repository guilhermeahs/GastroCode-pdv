import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import { formatDateTimePtBr } from "../utils/datetime";
import ConfirmDialog from "../components/ConfirmDialog";
import SelectField from "../components/SelectField";

function agoraDataIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function agoraHora() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function inteiro(valor) {
  return Number(valor || 0).toLocaleString("pt-BR");
}

function classificarOrigem(numero) {
  const n = String(numero || "").trim();
  if (/^\d{3}$/.test(n)) return "ANOTA_AI";
  if (/^\d{4}$/.test(n)) return "IFOOD";
  if (/^\d{6}$/.test(n)) return "NINENINE";
  return "DESCONHECIDO";
}

function nomeOrigem(origem) {
  const key = String(origem || "").toUpperCase();
  if (key === "ANOTA_AI") return "Anota Ai";
  if (key === "IFOOD") return "iFood";
  if (key === "NINENINE") return "99";
  return "Manual";
}

function nomePagamentoEntrega(payment) {
  const key = String(payment || "").toUpperCase();
  if (key === "PIX") return "Pix";
  if (key === "DINHEIRO") return "Dinheiro";
  if (key === "DEBITO") return "Debito";
  if (key === "CREDITO") return "Credito";
  if (key === "ONLINE") return "Online";
  return key || "Nao informado";
}

function pagamentoAceitaTroco(payment) {
  return normalizePaymentRaw(payment) === "DINHEIRO";
}

function normalizePaymentRaw(value) {
  const key = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (!key) return "ONLINE";
  if (key.includes("PIX")) return "PIX";
  if (key.includes("CASH") || key.includes("DINHEIRO")) return "DINHEIRO";
  if (key.includes("DEBIT")) return "DEBITO";
  if (key.includes("CREDIT") || key.includes("CREDITO")) return "CREDITO";
  if (key.includes("ONLINE")) return "ONLINE";
  return key;
}

function parseJsonSafe(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function toMoney(value) {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const normalized = String(value).replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyBr(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function nomeTipoPedido(tipo) {
  const key = String(tipo || "")
    .trim()
    .toUpperCase();
  if (!key) return "Entrega";
  if (key.includes("RETIR") || key.includes("PICKUP") || key.includes("TAKEOUT")) return "Retirada no local";
  if (key.includes("ENTREGA") || key.includes("DELIVERY")) return "Entrega";
  return key;
}

function isStatusCancelado(status = "") {
  const txt = String(status || "")
    .trim()
    .toUpperCase();
  if (!txt) return false;
  return /(CANCEL|CANCELED|CANCELLED|REJECT|DENIED|DECLINED)/.test(txt);
}

function nomeStatusEntrega(status = "", cancelado = false) {
  const raw = String(status || "")
    .trim()
    .toUpperCase();

  if (cancelado || isStatusCancelado(raw)) return "Cancelado";
  if (!raw || raw === "RECEIVED" || raw === "PLACED" || raw === "CREATED") return "Recebido";
  if (raw === "PENDING") return "Aguardando aceite";
  if (raw.includes("CONFIRM") || raw === "ACCEPTED" || raw === "APPROVED") return "Confirmado";
  if (
    raw.includes("PREPAR") ||
    raw.includes("IN_PRODUCTION") ||
    raw.includes("READY_FOR_PICKUP") ||
    raw.includes("READY_TO_PICKUP") ||
    raw.includes("READY")
  ) {
    return "Em preparo";
  }
  if (raw.includes("DISPATCH") || raw.includes("ROUTE") || raw.includes("ON_THE_WAY") || raw.includes("DELIVERING")) {
    return "Saiu para entrega";
  }
  if (raw.includes("DELIVER") || raw === "CONCLUDED" || raw === "FINISHED" || raw === "COMPLETED") {
    return "Entregue";
  }
  return raw.replace(/_/g, " ");
}

function normalizeNotesText(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const message = String(
      value?.message || value?.text || value?.description || value?.note || ""
    ).trim();
    if (message) return message;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "";
    }
  }
  return "";
}

function normalizePedidoEntrega(pedido = {}) {
  const detalhes = parseJsonSafe(pedido.detalhes_json || pedido.detalhes || null) || {};
  const resumo = detalhes && typeof detalhes === "object" ? detalhes : {};
  const rawOrder = resumo.raw_order && typeof resumo.raw_order === "object" ? resumo.raw_order : {};
  const scheduling = resumo.scheduling && typeof resumo.scheduling === "object" ? resumo.scheduling : {};
  const voucher = resumo.voucher && typeof resumo.voucher === "object" ? resumo.voucher : {};
  const customer = resumo.customer && typeof resumo.customer === "object" ? resumo.customer : {};
  const cancellation = resumo.cancellation && typeof resumo.cancellation === "object" ? resumo.cancellation : {};
  const rawMethods = Array.isArray(rawOrder?.payments?.methods) ? rawOrder.payments.methods : [];
  const rawFirstMethod = rawMethods[0] || {};
  const paymentFromResumo = Array.isArray(resumo?.payments)
    ? normalizePaymentRaw(resumo.payments.find((row) => String(row?.method || "").trim())?.method || "")
    : "";
  const paymentFromRaw = normalizePaymentRaw(rawFirstMethod?.method || rawFirstMethod?.type || "");
  let paymentFinal = normalizePaymentRaw(pedido.payment || "");
  if (!paymentFinal || paymentFinal === "ONLINE") {
    if (paymentFromResumo && paymentFromResumo !== "ONLINE") paymentFinal = paymentFromResumo;
    else if (paymentFromRaw && paymentFromRaw !== "ONLINE") paymentFinal = paymentFromRaw;
    else if (!paymentFinal) paymentFinal = "ONLINE";
  }

  const statusRaw = String(
    pedido.status || resumo.status || rawOrder?.orderStatus || rawOrder?.status || rawOrder?.state || "RECEBIDO"
  )
    .trim()
    .toUpperCase();
  const rawCancellations = Array.isArray(rawOrder?.cancellations) ? rawOrder.cancellations : [];
  const rawCancelLast = rawCancellations.length > 0 ? rawCancellations[rawCancellations.length - 1] : null;
  const rawCancel = rawOrder?.cancellation || rawOrder?.cancellationInfo || rawOrder?.cancelInfo || rawCancelLast || {};
  const schedulingMode = String(scheduling.mode || "")
    .trim()
    .toUpperCase();
  const hasScheduledMode = schedulingMode.includes("SCHEDULE");
  const isImmediateMode = schedulingMode.includes("IMMEDIATE") || schedulingMode.includes("ASAP");
  const scheduledAt = scheduling.scheduled_at ? String(scheduling.scheduled_at) : "";
  const isScheduled = (Boolean(scheduling.is_scheduled) || hasScheduledMode) && !isImmediateMode;
  const previsaoEm = !isScheduled && scheduledAt ? scheduledAt : "";
  const voucherCode = String(voucher.code || "").trim();
  const voucherValue = toMoney(voucher.value);
  const trocoPara = toMoney(
    resumo.cash_change_for ??
      rawFirstMethod?.cash?.changeFor ??
      rawFirstMethod?.cash?.change_for ??
      rawFirstMethod?.changeFor ??
      rawFirstMethod?.change_for ??
      rawOrder?.payments?.cash?.changeFor ??
      rawOrder?.payments?.changeFor ??
      rawOrder?.cashChangeFor
  );
  const clienteNome = String(customer.nome || customer.name || resumo.customer_name || "").trim();
  const clienteDocumento = String(customer.documento || resumo.customer_document || "").trim();
  const cancelReason = String(
    cancellation.reason || rawCancel?.reason || rawCancel?.description || rawCancel?.message || rawOrder?.cancellationReason || ""
  ).trim();
  const cancelSource = String(cancellation.source || rawCancel?.cancelledBy || rawCancel?.actor || rawCancel?.origin || "").trim();
  const cancelAt = String(cancellation.canceled_at || rawCancel?.cancelledAt || rawCancel?.createdAt || rawOrder?.cancelledAt || "").trim();
  const cancelBlob = (() => {
    try {
      return JSON.stringify(rawCancel || {}).toUpperCase();
    } catch {
      return "";
    }
  })();
  const cancelado =
    Boolean(cancellation.is_cancelled) ||
    Boolean(cancelReason) ||
    Boolean(cancelAt) ||
    isStatusCancelado(statusRaw) ||
    isStatusCancelado(String(rawOrder?.orderStatus || rawOrder?.status || rawOrder?.state || "")) ||
    /(CANCEL|REJECT|DENIED|DECLINED)/.test(cancelBlob);
  const statusVisual = nomeStatusEntrega(statusRaw, cancelado);

  return {
    ...pedido,
    dataISO: String(pedido.data_iso || pedido.dataISO || ""),
    payment: paymentFinal,
    source: String(pedido.source || "DESCONHECIDO").toUpperCase(),
    externalId: String(pedido.external_id || resumo.order_id || "").trim(),
    status: statusVisual,
    statusRaw,
    detalhes_json: pedido.detalhes_json || "",
    detalhes: resumo,
    resumoVisual: {
      tipoPedido: nomeTipoPedido(resumo.order_type || resumo.orderType || ""),
      agendado: isScheduled,
      agendadoEm: scheduledAt,
      previsaoEm,
      voucherCode,
      voucherValue,
      trocoPara,
      clienteNome,
      clienteDocumento,
      cancelado,
      cancelReason: cancelReason || cancelSource
    }
  };
}

const PAGAMENTO_ENTREGA_OPTIONS = [
  { value: "ONLINE", label: "Online" },
  { value: "PIX", label: "Pix" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "DEBITO", label: "Debito" },
  { value: "CREDITO", label: "Credito" }
];

const INTEGRACAO_ORDER = ["hub", "ifood", "ninenine"];
const INTEGRACAO_LABEL = {
  hub: "Hub GastroCode",
  ifood: "iFood",
  ninenine: "99"
};

const CODIGO_CONEXAO_PREFIX = "GCB1:";

function sourcePadraoIntegracao(providerKey) {
  if (providerKey === "hub") return "source=HUB";
  return providerKey === "ifood" ? "source=IFOOD" : "source=NINENINE";
}

function inferSandboxApiKeyFromUrl(rawUrl = "") {
  const txt = String(rawUrl || "").trim();
  if (!txt) return "";
  try {
    const u = new URL(txt);
    const host = String(u.hostname || "").trim().toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".trycloudflare.com")) {
      return "gastrocode-teste-123";
    }
  } catch {
    return "";
  }
  return "";
}

function resumirUrl(rawUrl, maxLen = 70) {
  const txt = String(rawUrl || "").trim();
  if (!txt) return "";
  if (txt.length <= maxLen) return txt;
  return `${txt.slice(0, Math.max(24, maxLen - 12))}...${txt.slice(-8)}`;
}

function decodeBase64Utf8(raw) {
  try {
    const txt = atob(String(raw || ""));
    try {
      return decodeURIComponent(
        Array.from(txt)
          .map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, "0")}`)
          .join("")
      );
    } catch {
      return txt;
    }
  } catch {
    return "";
  }
}

function parseCodigoConexao(rawCode, providerKey) {
  const value = String(rawCode || "").trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    if (providerKey === "hub") {
      try {
        const u = new URL(value);
        const marker = "/api/entregas/hub/webhook/";
        const idx = u.pathname.toLowerCase().indexOf(marker);
        const token = idx >= 0 ? u.pathname.slice(idx + marker.length).split("/")[0].trim() : "";
        const basePath = idx >= 0 ? u.pathname.slice(0, idx) : u.pathname;
        const publicBaseUrl = `${u.origin}${basePath}`.replace(/\/+$/, "");
        return {
          public_base_url: publicBaseUrl,
          hub_token: token,
          webhook_url: value
        };
      } catch {
        return {
          public_base_url: value.replace(/\/+$/, "")
        };
      }
    }
    return {
      import_url: value,
      api_key: inferSandboxApiKeyFromUrl(value)
    };
  }

  let payload = null;

  if (value.startsWith("{")) {
    payload = JSON.parse(value);
  } else if (value.toUpperCase().startsWith(CODIGO_CONEXAO_PREFIX)) {
    const encoded = value.slice(CODIGO_CONEXAO_PREFIX.length).trim();
    const decoded = decodeBase64Utf8(encoded);
    if (!decoded) throw new Error("Codigo de conexao invalido (base64).");
    payload = JSON.parse(decoded);
  } else if (/^gcb:\/\//i.test(value)) {
    const u = new URL(value);
    payload = {
      import_url: u.searchParams.get("u") || u.searchParams.get("url") || u.searchParams.get("import_url") || "",
      base_url: u.searchParams.get("b") || u.searchParams.get("base_url") || "",
      import_path: u.searchParams.get("p") || u.searchParams.get("path") || "",
      import_query: u.searchParams.get("q") || u.searchParams.get("query") || "",
      api_key: u.searchParams.get("k") || u.searchParams.get("key") || u.searchParams.get("api_key") || "",
      bearer_token: u.searchParams.get("t") || u.searchParams.get("token") || u.searchParams.get("bearer") || "",
      motoboy_fallback: u.searchParams.get("m") || u.searchParams.get("motoboy") || "",
      merchant_id: u.searchParams.get("merchant") || u.searchParams.get("merchant_id") || "",
      webhook_secret: u.searchParams.get("webhook_secret") || "",
      public_base_url: u.searchParams.get("public_base_url") || u.searchParams.get("public_url") || "",
      hub_token: u.searchParams.get("hub_token") || u.searchParams.get("token_hub") || "",
      webhook_url: u.searchParams.get("webhook_url") || ""
    };
  } else {
    const decoded = decodeBase64Utf8(value);
    if (!decoded) {
      throw new Error("Formato do codigo de conexao nao reconhecido.");
    }
    payload = JSON.parse(decoded);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Codigo de conexao invalido.");
  }

  const parsed = {
    import_url: String(payload.import_url || payload.url || payload.link || "").trim(),
    base_url: String(payload.base_url || payload.base || "").trim(),
    import_path: String(payload.import_path || payload.path || "").trim(),
    import_query: String(payload.import_query || payload.query || "").trim(),
    api_key: String(payload.api_key || payload.key || "").trim(),
    bearer_token: String(payload.bearer_token || payload.token || "").trim(),
    motoboy_fallback: String(payload.motoboy_fallback || payload.motoboy || "").trim(),
    merchant_id: String(payload.merchant_id || payload.merchant || "").trim(),
    webhook_secret: String(payload.webhook_secret || "").trim(),
    public_base_url: String(payload.public_base_url || payload.public_url || "").trim().replace(/\/+$/, ""),
    hub_token: String(payload.hub_token || payload.token_hub || payload.token || "").trim(),
    webhook_url: String(payload.webhook_url || "").trim()
  };

  if (providerKey === "hub") {
    if (parsed.webhook_url && !parsed.public_base_url) {
      try {
        const u = new URL(parsed.webhook_url);
        const marker = "/api/entregas/hub/webhook/";
        const idx = u.pathname.toLowerCase().indexOf(marker);
        if (idx >= 0) {
          parsed.hub_token = parsed.hub_token || u.pathname.slice(idx + marker.length).split("/")[0].trim();
          parsed.public_base_url = `${u.origin}${u.pathname.slice(0, idx)}`.replace(/\/+$/, "");
        } else {
          parsed.public_base_url = u.origin.replace(/\/+$/, "");
        }
      } catch {
        /* no-op */
      }
    }
    if (!parsed.public_base_url && parsed.base_url) {
      parsed.public_base_url = parsed.base_url.replace(/\/+$/, "");
    }
    if (!parsed.public_base_url && parsed.import_url) {
      parsed.public_base_url = parsed.import_url.replace(/\/+$/, "");
    }
    return parsed;
  }

  if (!parsed.api_key) {
    parsed.api_key = inferSandboxApiKeyFromUrl(parsed.import_url || parsed.base_url || "");
  }

  if (!parsed.import_query) {
    parsed.import_query = sourcePadraoIntegracao(providerKey);
  }

  if (!parsed.import_url && !parsed.base_url) {
    throw new Error("Codigo de conexao sem link valido.");
  }

  return parsed;
}

function normalizeIntegracoes(input) {
  const list = Array.isArray(input) ? input : [];
  const map = {};
  for (const item of list) {
    const key = String(item?.provider || "").trim().toLowerCase();
    if (!key) continue;
    const baseItem = {
      provider: key,
      label: INTEGRACAO_LABEL[key] || String(item?.label || key),
      enabled: Boolean(item?.enabled),
      import_url: String(item?.import_url || ""),
      base_url: String(item?.base_url || ""),
      import_path: String(item?.import_path || "/orders"),
      import_query: String(item?.import_query || ""),
      api_key: String(item?.api_key || ""),
      bearer_token: String(item?.bearer_token || ""),
      motoboy_fallback: String(item?.motoboy_fallback || INTEGRACAO_LABEL[key] || ""),
      merchant_id: String(item?.merchant_id || ""),
      webhook_secret: String(item?.webhook_secret || ""),
      last_sync_at: item?.last_sync_at || null,
      last_sync_result: String(item?.last_sync_result || ""),
      homologacao_enabled: Boolean(item?.homologacao_enabled),
      homologacao_base_url: String(item?.homologacao_base_url || item?.base_url || ""),
      homologacao_token_url: String(item?.homologacao_token_url || ""),
      homologacao_polling_path: String(item?.homologacao_polling_path || ""),
      homologacao_ack_path: String(item?.homologacao_ack_path || ""),
      homologacao_order_details_path: String(item?.homologacao_order_details_path || ""),
      homologacao_order_details_path_fallback: String(item?.homologacao_order_details_path_fallback || ""),
      homologacao_client_id: String(item?.homologacao_client_id || ""),
      homologacao_client_secret: "",
      homologacao_grant_type: String(item?.homologacao_grant_type || "client_credentials"),
      homologacao_scope: String(item?.homologacao_scope || ""),
      homologacao_authorization_code: String(item?.homologacao_authorization_code || ""),
      homologacao_refresh_token: String(item?.homologacao_refresh_token || ""),
      homologacao_polling_merchants: String(item?.homologacao_polling_merchants || ""),
      homologacao_polling_interval_seconds: Number(item?.homologacao_polling_interval_seconds || 30),
      homologacao_polling_exclude_heartbeat:
        item?.homologacao_polling_exclude_heartbeat === undefined
          ? true
          : Boolean(item?.homologacao_polling_exclude_heartbeat),
      homologacao_auto_ack: item?.homologacao_auto_ack === undefined ? true : Boolean(item?.homologacao_auto_ack),
      homologacao_webhook_signature_required:
        item?.homologacao_webhook_signature_required === undefined
          ? true
          : Boolean(item?.homologacao_webhook_signature_required),
      homologacao_last_token_refresh_at: item?.homologacao_last_token_refresh_at || null,
      homologacao_last_sync_at: item?.homologacao_last_sync_at || null,
      homologacao_last_sync_result: String(item?.homologacao_last_sync_result || "")
    };
    if (key === "hub") {
      map[key] = {
        ...baseItem,
        hub_token: String(item?.hub_token || ""),
        public_base_url: String(item?.public_base_url || ""),
        webhook_url: String(item?.webhook_url || ""),
        webhook_ifood_url: String(item?.webhook_ifood_url || ""),
        webhook_ninenine_url: String(item?.webhook_ninenine_url || "")
      };
      continue;
    }
    map[key] = baseItem;
  }

  for (const key of INTEGRACAO_ORDER) {
    if (!map[key]) {
      map[key] = {
        provider: key,
        label: INTEGRACAO_LABEL[key],
        enabled: false,
        import_url: "",
        base_url: "",
        import_path: "/orders",
        import_query: sourcePadraoIntegracao(key),
        api_key: "",
        bearer_token: "",
        motoboy_fallback: INTEGRACAO_LABEL[key],
        merchant_id: "",
        webhook_secret: "",
        hub_token: "",
        public_base_url: "",
        webhook_url: "",
        webhook_ifood_url: "",
        webhook_ninenine_url: "",
        last_sync_at: null,
        last_sync_result: "",
        homologacao_enabled: false,
        homologacao_base_url: "",
        homologacao_token_url: "",
        homologacao_polling_path: "",
        homologacao_ack_path: "",
        homologacao_order_details_path: "",
        homologacao_order_details_path_fallback: "",
        homologacao_client_id: "",
        homologacao_client_secret: "",
        homologacao_grant_type: "client_credentials",
        homologacao_scope: "",
        homologacao_authorization_code: "",
        homologacao_refresh_token: "",
        homologacao_polling_merchants: "",
        homologacao_polling_interval_seconds: 30,
        homologacao_polling_exclude_heartbeat: true,
        homologacao_auto_ack: true,
        homologacao_webhook_signature_required: true,
        homologacao_last_token_refresh_at: null,
        homologacao_last_sync_at: null,
        homologacao_last_sync_result: ""
      };
    }
  }

  return map;
}

function toDateLocal(dateStr, timeStr = "00:00") {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split("-").map((item) => Number(item));
  const [hh, mm] = String(timeStr || "00:00").split(":").map((item) => Number(item));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, Number(hh || 0), Number(mm || 0), 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function buildLocalIso(dateStr, timeStr = "00:00") {
  const d = toDateLocal(dateStr, timeStr);
  return d ? d.toISOString() : undefined;
}

function inRange(targetISO, fromDate, fromTime, toDate, toTime) {
  const target = new Date(targetISO);
  if (Number.isNaN(target.getTime())) return false;

  const from = fromDate ? toDateLocal(fromDate, fromTime || "00:00") : null;
  const to = toDate ? toDateLocal(toDate, toTime || "23:59") : null;

  if (!from && !to) return true;
  if (from && to && to >= from) {
    return target >= from && target <= to;
  }
  if (from && to && to < from) {
    const candidate = new Date(target);
    if (candidate < from) candidate.setDate(candidate.getDate() + 1);
    const toPlus = new Date(to);
    toPlus.setDate(toPlus.getDate() + 1);
    return candidate >= from && candidate <= toPlus;
  }
  if (from && !to) return target >= from;
  if (!from && to) return target <= to;
  return true;
}

function parsePedidos(rawText) {
  const tokens = String(rawText || "")
    .replace(/[;,\t]+/g, " ")
    .replace(/\r/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const unicos = [];
  const vistos = new Set();
  for (const item of tokens) {
    const key = item.toLowerCase();
    if (vistos.has(key)) continue;
    vistos.add(key);
    unicos.push(item);
  }
  return unicos;
}

function filtrarMotoboys(lista, q, fromDate, fromTime, toDate, toTime) {
  const query = String(q || "")
    .trim()
    .toLowerCase();

  return (Array.isArray(lista) ? lista : [])
    .map((motoboy) => {
      const pedidos = Array.isArray(motoboy.pedidos) ? motoboy.pedidos : [];
      const pedidosFiltrados = pedidos.filter((pedido) =>
        inRange(pedido.dataISO, fromDate, fromTime, toDate, toTime)
      );
      return {
        ...motoboy,
        pedidosFiltrados
      };
    })
    .filter((motoboy) => {
      if (!query) return true;
      const byNome = String(motoboy.nome || "")
        .toLowerCase()
        .includes(query);
      if (byNome) return true;
      return motoboy.pedidosFiltrados.some((pedido) =>
        String(pedido.numero || "")
          .toLowerCase()
          .includes(query)
      );
    });
}

function PedidoResumoBadges({ pedido }) {
  const resumo = pedido?.resumoVisual || {};
  const trocoAplicavel = pagamentoAceitaTroco(pedido?.payment);
  const statusAtual = String(pedido?.status || "").trim();
  const statusJaEhCancelado = statusAtual ? isStatusCancelado(statusAtual) || statusAtual.toUpperCase() === "CANCELADO" : false;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {pedido?.status ? <span style={statusTagStyle}>{pedido.status}</span> : null}
      <span style={metaTagStyle}>{resumo.tipoPedido || "Entrega"}</span>
      {resumo.agendado && resumo.agendadoEm ? (
        <span style={metaTagStyle}>Agendado: {formatDateTimePtBr(resumo.agendadoEm)}</span>
      ) : null}
      {resumo.voucherCode || resumo.voucherValue > 0 ? (
        <span style={metaTagStyle}>
          Voucher {resumo.voucherCode || ""} {resumo.voucherValue > 0 ? `(${moneyBr(resumo.voucherValue)})` : ""}
        </span>
      ) : null}
      {trocoAplicavel && resumo.trocoPara > 0 ? <span style={metaTagStyle}>Troco para: {moneyBr(resumo.trocoPara)}</span> : null}
      {resumo.cancelado && !statusJaEhCancelado ? <span style={dangerTagStyle}>Cancelado</span> : null}
    </div>
  );
}

function PedidoDetalhesDialog({ pedido, open, onClose }) {
  if (!open || !pedido) return null;
  const resumo = pedido?.resumoVisual || {};
  const detalhes = pedido?.detalhes || {};
  const notesText = normalizeNotesText(detalhes?.notes);
  const trocoAplicavel = pagamentoAceitaTroco(pedido?.payment);
  return (
    <div style={pedidoDetalhesOverlayStyle} onClick={onClose}>
      <div style={pedidoDetalhesCardStyle} onClick={(event) => event.stopPropagation()}>
        <div style={titleRowStyle}>
          <strong style={{ fontSize: 20, fontFamily: "var(--font-heading)" }}>
            Pedido #{pedido.numero}
          </strong>
          <button type="button" style={neutralMiniButtonStyle(false)} onClick={onClose}>
            Fechar
          </button>
        </div>

        <div style={pedidoDetalhesGridStyle}>
          <div style={pedidoDetalhesFieldStyle}>
            <span style={pedidoDetalhesLabelStyle}>Origem</span>
            <strong>{nomeOrigem(pedido.source)}</strong>
          </div>
          <div style={pedidoDetalhesFieldStyle}>
            <span style={pedidoDetalhesLabelStyle}>Pagamento</span>
            <strong>{nomePagamentoEntrega(pedido.payment)}</strong>
          </div>
          <div style={pedidoDetalhesFieldStyle}>
            <span style={pedidoDetalhesLabelStyle}>Status</span>
            <strong>
              {pedido.status || "-"}
              {pedido.statusRaw && String(pedido.statusRaw).toUpperCase() !== String(pedido.status || "").toUpperCase()
                ? ` (${pedido.statusRaw})`
                : ""}
            </strong>
          </div>
          <div style={pedidoDetalhesFieldStyle}>
            <span style={pedidoDetalhesLabelStyle}>Data/hora</span>
            <strong>{formatDateTimePtBr(pedido.dataISO)}</strong>
          </div>
          <div style={pedidoDetalhesFieldStyle}>
            <span style={pedidoDetalhesLabelStyle}>ID externo</span>
            <strong>{pedido.externalId || "-"}</strong>
          </div>
          <div style={pedidoDetalhesFieldStyle}>
            <span style={pedidoDetalhesLabelStyle}>Tipo do pedido</span>
            <strong>{resumo.tipoPedido || "-"}</strong>
          </div>
          <div style={pedidoDetalhesFieldStyle}>
            <span style={pedidoDetalhesLabelStyle}>{resumo.agendado ? "Agendamento" : "Previsao"}</span>
            <strong>
              {resumo.agendado
                ? formatDateTimePtBr(resumo.agendadoEm)
                : resumo.previsaoEm
                  ? formatDateTimePtBr(resumo.previsaoEm)
                  : "Nao"}
            </strong>
          </div>
          <div style={pedidoDetalhesFieldStyle}>
            <span style={pedidoDetalhesLabelStyle}>Voucher</span>
            <strong>
              {resumo.voucherCode || resumo.voucherValue > 0
                ? `${resumo.voucherCode || ""} ${resumo.voucherValue > 0 ? `- ${moneyBr(resumo.voucherValue)}` : ""}`.trim()
                : "Nao"}
            </strong>
          </div>
          <div style={pedidoDetalhesFieldStyle}>
            <span style={pedidoDetalhesLabelStyle}>Troco para</span>
            <strong>
              {trocoAplicavel ? (resumo.trocoPara > 0 ? moneyBr(resumo.trocoPara) : "Nao informado") : "Nao se aplica"}
            </strong>
          </div>
          <div style={pedidoDetalhesFieldStyle}>
            <span style={pedidoDetalhesLabelStyle}>Cliente</span>
            <strong>
              {resumo.clienteNome || "-"}
              {resumo.clienteDocumento ? ` (${resumo.clienteDocumento})` : ""}
            </strong>
          </div>
          <div style={pedidoDetalhesFieldStyle}>
            <span style={pedidoDetalhesLabelStyle}>Cancelamento</span>
            <strong>{resumo.cancelado ? resumo.cancelReason || "Sim" : "Nao"}</strong>
          </div>
        </div>

        {notesText ? (
          <div style={{ ...pedidoDetalhesFieldStyle, marginTop: 8 }}>
            <span style={pedidoDetalhesLabelStyle}>Observacoes</span>
            <strong style={{ whiteSpace: "pre-wrap" }}>{notesText}</strong>
          </div>
        ) : null}

        <div style={{ ...pedidoDetalhesFieldStyle, marginTop: 10 }}>
          <span style={pedidoDetalhesLabelStyle}>JSON tecnico (para homologacao)</span>
          <textarea
            readOnly
            value={JSON.stringify(detalhes || {}, null, 2)}
            style={pedidoDetalhesTextareaStyle}
          />
        </div>
      </div>
    </div>
  );
}

function MotoboyCard({
  motoboy,
  fromDate,
  fromTime,
  toDate,
  toTime,
  podeGerir,
  onRefresh,
  onFeedback
}) {
  const [removing, setRemoving] = useState(false);
  const [pedidoParaRemover, setPedidoParaRemover] = useState(null);
  const [confirmarExcluirMotoboy, setConfirmarExcluirMotoboy] = useState(false);
  const [confirmProcessing, setConfirmProcessing] = useState(false);
  const [pedidoDetalhesAberto, setPedidoDetalhesAberto] = useState(null);

  const pedidosFiltrados = useMemo(() => {
    return (motoboy.pedidos || [])
      .filter((pedido) => inRange(pedido.dataISO, fromDate, fromTime, toDate, toTime))
      .slice()
      .sort((a, b) => {
        const t1 = new Date(a.dataISO).getTime();
        const t2 = new Date(b.dataISO).getTime();
        return t2 - t1;
      });
  }, [motoboy.pedidos, fromDate, fromTime, toDate, toTime]);

  const porDia = useMemo(() => {
    const mapa = new Map();
    for (const pedido of pedidosFiltrados) {
      const date = new Date(pedido.dataISO);
      if (Number.isNaN(date.getTime())) continue;
      const dia = date.toLocaleDateString("pt-BR");
      mapa.set(dia, Number(mapa.get(dia) || 0) + 1);
    }
    return Array.from(mapa.entries());
  }, [pedidosFiltrados]);

  async function confirmarRemocaoPedido() {
    if (!podeGerir || !pedidoParaRemover) return;
    setConfirmProcessing(true);
    try {
      await api.removerEntregasPedido(pedidoParaRemover.id, motoboy.roleRuntime);
      onFeedback("success", `Pedido #${pedidoParaRemover.numero} removido.`);
      setPedidoParaRemover(null);
      await onRefresh();
    } catch (error) {
      onFeedback("error", error?.message || "Falha ao remover pedido.");
    } finally {
      setConfirmProcessing(false);
    }
  }

  async function confirmarExclusaoMotoboy() {
    if (!podeGerir || removing) return;
    setRemoving(true);
    setConfirmProcessing(true);
    try {
      await api.excluirEntregasMotoboy(motoboy.id, motoboy.roleRuntime);
      onFeedback("success", "Motoboy excluido.");
      setConfirmarExcluirMotoboy(false);
      await onRefresh();
    } catch (error) {
      onFeedback("error", error?.message || "Falha ao excluir motoboy.");
    } finally {
      setRemoving(false);
      setConfirmProcessing(false);
    }
  }

  return (
    <section style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <h3 style={{ margin: 0, fontFamily: "var(--font-heading)" }}>{motoboy.nome}</h3>
          <div style={{ color: "#9cb0e8", fontSize: 12 }}>
            {inteiro(pedidosFiltrados.length)} pedido(s) no periodo
          </div>
        </div>

        {podeGerir ? (
          <button
            type="button"
            style={dangerMiniButtonStyle(removing)}
            onClick={() => setConfirmarExcluirMotoboy(true)}
            disabled={removing}
          >
            Excluir motoboy
          </button>
          ) : null}
      </div>

      {porDia.length > 0 ? (
        <div style={kpiWrapStyle}>
          {porDia.map(([dia, total]) => (
            <span key={`${motoboy.id}-${dia}`} style={kpiTagStyle}>
              {dia}: {inteiro(total)}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ color: "#9cb0e8", fontSize: 12 }}>Sem pedidos no periodo selecionado.</div>
      )}

      <div style={listStyle}>
        {pedidosFiltrados.length < 1 ? (
          <div style={{ color: "#a7b6e4", fontSize: 13 }}>Nenhum pedido encontrado para esse filtro.</div>
        ) : (
          pedidosFiltrados.map((pedido) => (
            <article key={pedido.id} style={pedidoItemStyle}>
              <div style={{ display: "grid", gap: 2 }}>
                <strong style={{ fontSize: 18, color: "#ffd27b" }}>#{pedido.numero}</strong>
                <span style={{ fontSize: 12, color: "#9cb0e8" }}>{formatDateTimePtBr(pedido.dataISO)}</span>
                <PedidoResumoBadges pedido={pedido} />
                {pedido?.resumoVisual?.clienteNome ? (
                  <span style={{ fontSize: 12, color: "#9cb0e8" }}>
                    Cliente: {pedido.resumoVisual.clienteNome}
                    {pedido?.resumoVisual?.clienteDocumento ? ` (${pedido.resumoVisual.clienteDocumento})` : ""}
                  </span>
                ) : null}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={sourceTagStyle}>{nomeOrigem(pedido.source)}</span>
                <span style={paymentTagStyle}>{nomePagamentoEntrega(pedido.payment)}</span>
                <button
                  type="button"
                  style={neutralMiniButtonStyle(false)}
                  onClick={() => setPedidoDetalhesAberto(pedido)}
                >
                  Detalhes
                </button>
                {podeGerir ? (
                  <button
                    type="button"
                    style={neutralMiniButtonStyle(false)}
                    onClick={() => setPedidoParaRemover({ id: pedido.id, numero: pedido.numero })}
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pedidoParaRemover)}
        title="Remover pedido"
        message={
          pedidoParaRemover
            ? `Deseja remover o pedido #${pedidoParaRemover.numero} deste motoboy?`
            : ""
        }
        details={`Motoboy: ${motoboy.nome}`}
        variant="danger"
        processing={confirmProcessing}
        confirmLabel="Remover pedido"
        cancelLabel="Cancelar"
        onCancel={() => {
          if (confirmProcessing) return;
          setPedidoParaRemover(null);
        }}
        onConfirm={confirmarRemocaoPedido}
      />

      <ConfirmDialog
        open={confirmarExcluirMotoboy}
        title="Excluir motoboy"
        message={`Excluir "${motoboy.nome}" e todos os pedidos vinculados?`}
        details="Essa acao remove o cadastro e todo o historico de pedidos desse motoboy."
        variant="danger"
        processing={confirmProcessing}
        confirmLabel="Excluir motoboy"
        cancelLabel="Cancelar"
        onCancel={() => {
          if (confirmProcessing) return;
          setConfirmarExcluirMotoboy(false);
        }}
        onConfirm={confirmarExclusaoMotoboy}
      />

      <PedidoDetalhesDialog
        pedido={pedidoDetalhesAberto}
        open={Boolean(pedidoDetalhesAberto)}
        onClose={() => setPedidoDetalhesAberto(null)}
      />
    </section>
  );
}

export default function Entregas() {
  const { role, hasPermission } = useApp();
  const podeVerEntregas = hasPermission("APP_ENTREGAS_VER");
  const podeGerirEntregas = hasPermission("APP_ENTREGAS_GERIR");

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [motoboys, setMotoboys] = useState([]);
  const [pedidosPendentes, setPedidosPendentes] = useState([]);
  const [resumo, setResumo] = useState({ motoboys: 0, pedidos: 0, pendentes: 0 });
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [fromTime, setFromTime] = useState("00:00");
  const [toTime, setToTime] = useState("23:59");
  const [novoNome, setNovoNome] = useState("");
  const [onlineTab, setOnlineTab] = useState("pedidos");
  const [savingMotoboy, setSavingMotoboy] = useState(false);
  const [pedidoGlobalText, setPedidoGlobalText] = useState("");
  const [selectedMotoboyId, setSelectedMotoboyId] = useState("");
  const [paymentModeGlobal, setPaymentModeGlobal] = useState("ONLINE");
  const [useCustomWhenGlobal, setUseCustomWhenGlobal] = useState(false);
  const [whenDateGlobal, setWhenDateGlobal] = useState(agoraDataIso());
  const [whenTimeGlobal, setWhenTimeGlobal] = useState(agoraHora());
  const [addingGlobal, setAddingGlobal] = useState(false);
  const [pedidoPendenteEmAcao, setPedidoPendenteEmAcao] = useState("");
  const [pedidoPendenteDetalhes, setPedidoPendenteDetalhes] = useState(null);
  const [pendentesSelecionados, setPendentesSelecionados] = useState([]);
  const [processandoPendentesLote, setProcessandoPendentesLote] = useState(false);
  const [integracoes, setIntegracoes] = useState(() => normalizeIntegracoes([]));
  const [codigoConexao, setCodigoConexao] = useState({
    hub: "",
    ifood: "",
    ninenine: ""
  });
  const [mostrarAvancadoIntegracao, setMostrarAvancadoIntegracao] = useState({
    hub: false,
    ifood: false,
    ninenine: false
  });
  const [salvandoIntegracao, setSalvandoIntegracao] = useState({
    hub: false,
    ifood: false,
    ninenine: false
  });
  const [sincronizandoIntegracao, setSincronizandoIntegracao] = useState({
    hub: false,
    ifood: false,
    ninenine: false
  });
  const [ifoodHomologacaoStatus, setIfoodHomologacaoStatus] = useState(null);
  const [ifoodEventos, setIfoodEventos] = useState([]);
  const [loadingIfoodStatus, setLoadingIfoodStatus] = useState(false);
  const [loadingIfoodEventos, setLoadingIfoodEventos] = useState(false);
  const [renovandoIfoodToken, setRenovandoIfoodToken] = useState(false);
  const [mostrarPainelIntegracoes, setMostrarPainelIntegracoes] = useState(false);
  const algumAvancadoIntegracaoAberto = useMemo(
    () => INTEGRACAO_ORDER.some((provider) => Boolean(mostrarAvancadoIntegracao?.[provider])),
    [mostrarAvancadoIntegracao]
  );
  const pausandoAutoRefreshIntegracao = Boolean(mostrarPainelIntegracoes && algumAvancadoIntegracaoAberto);

  function onFeedback(type, text) {
    setFeedback({ type, text, id: Date.now() });
  }

  const resumoHomologacaoIfoodTexto = useMemo(() => {
    const cfg = integracoes?.ifood || {};
    const hub = integracoes?.hub || {};
    const status = ifoodHomologacaoStatus || {};
    const checklistItems = Array.isArray(status?.checklist?.items) ? status.checklist.items : [];
    const total24h = Number(status?.metrics?.last_24h?.received || 0);
    const ack24h = Number(status?.metrics?.last_24h?.acked || 0);
    const ackRate24h = Number(status?.metrics?.last_24h?.ack_rate_percent || 0);
    const webhookIfood = String(hub?.webhook_ifood_url || hub?.webhook_url || "").trim();
    const merchantIds = String(cfg?.homologacao_polling_merchants || "").trim();
    const checklistLinhas = checklistItems.map((item) => `- ${item.ok ? "[OK]" : "[PEND]"} ${item.label}`);

    const linhas = [
      "Homologacao iFood - GastroCode Brasil PDV",
      "",
      `Status geral: ${status?.checklist?.ready ? "PRONTO" : "PENDENTE"}`,
      `Modo homologacao: ${cfg?.homologacao_enabled ? "ATIVO" : "INATIVO"}`,
      "",
      "Conectividade e endpoints",
      `- Base URL: ${cfg?.homologacao_base_url || "-"}`,
      `- Token URL: ${cfg?.homologacao_token_url || "-"}`,
      `- Polling path: ${cfg?.homologacao_polling_path || "-"}`,
      `- ACK path: ${cfg?.homologacao_ack_path || "-"}`,
      `- Order details path: ${cfg?.homologacao_order_details_path || "-"}`,
      `- Webhook iFood (hub): ${webhookIfood || "-"}`,
      "",
      "Autenticacao e processamento",
      `- Client ID configurado: ${cfg?.homologacao_client_id ? "SIM" : "NAO"}`,
      `- Grant type: ${cfg?.homologacao_grant_type || "-"}`,
      `- Merchant IDs polling: ${merchantIds || "-"}`,
      `- Intervalo polling (s): ${Number(cfg?.homologacao_polling_interval_seconds || 30)}`,
      `- excludeHeartbeat: ${cfg?.homologacao_polling_exclude_heartbeat ? "SIM" : "NAO"}`,
      `- ACK automatico: ${cfg?.homologacao_auto_ack ? "SIM" : "NAO"}`,
      `- Assinatura webhook obrigatoria: ${cfg?.homologacao_webhook_signature_required ? "SIM" : "NAO"}`,
      "",
      "Metricas (ultimas 24h)",
      `- Eventos recebidos: ${inteiro(total24h)}`,
      `- Eventos ACK: ${inteiro(ack24h)}`,
      `- Taxa ACK: ${ackRate24h.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}%`,
      "",
      "Checklist tecnico",
      ...(checklistLinhas.length > 0 ? checklistLinhas : ["- Sem checklist disponivel"]),
      "",
      `Ultimo sync: ${
        status?.last_sync_at ? formatDateTimePtBr(status.last_sync_at) : "nao registrado"
      }`,
      `Resultado ultimo sync: ${status?.last_sync_result || "nao registrado"}`
    ];

    return linhas.join("\n");
  }, [ifoodHomologacaoStatus, integracoes]);

  useEffect(() => {
    if (!feedback) return undefined;
    const id = setTimeout(() => setFeedback(null), 3600);
    return () => clearTimeout(id);
  }, [feedback]);

  function aplicarStatusIfoodNoFormulario(statusPayload) {
    const cfg = statusPayload?.config;
    if (!cfg || typeof cfg !== "object") return;
    setIntegracoes((prev) => {
      const atual = prev?.ifood || {};
      return {
        ...prev,
        ifood: {
          ...atual,
          homologacao_enabled: Boolean(cfg.enabled),
          homologacao_base_url: String(cfg.base_url || atual.homologacao_base_url || atual.base_url || ""),
          homologacao_token_url: String(cfg.token_url || atual.homologacao_token_url || ""),
          homologacao_polling_path: String(cfg.polling_path || atual.homologacao_polling_path || ""),
          homologacao_ack_path: String(cfg.ack_path || atual.homologacao_ack_path || ""),
          homologacao_order_details_path: String(
            cfg.order_details_path || atual.homologacao_order_details_path || ""
          ),
          homologacao_order_details_path_fallback: String(
            cfg.order_details_path_fallback || atual.homologacao_order_details_path_fallback || ""
          ),
          homologacao_client_id: String(cfg.client_id || atual.homologacao_client_id || ""),
          homologacao_grant_type: String(cfg.grant_type || atual.homologacao_grant_type || "client_credentials"),
          homologacao_scope: String(cfg.scope || atual.homologacao_scope || ""),
          homologacao_authorization_code: String(
            cfg.authorization_code || atual.homologacao_authorization_code || ""
          ),
          homologacao_refresh_token: String(cfg.refresh_token || atual.homologacao_refresh_token || ""),
          homologacao_polling_merchants: String(
            cfg.polling_merchants || atual.homologacao_polling_merchants || ""
          ),
          homologacao_polling_interval_seconds: Number(
            cfg.polling_interval_seconds || atual.homologacao_polling_interval_seconds || 30
          ),
          homologacao_polling_exclude_heartbeat:
            cfg.polling_exclude_heartbeat === undefined
              ? atual.homologacao_polling_exclude_heartbeat
              : Boolean(cfg.polling_exclude_heartbeat),
          homologacao_auto_ack: cfg.auto_ack === undefined ? atual.homologacao_auto_ack : Boolean(cfg.auto_ack),
          homologacao_webhook_signature_required:
            cfg.webhook_signature_required === undefined
              ? atual.homologacao_webhook_signature_required
              : Boolean(cfg.webhook_signature_required),
          homologacao_last_token_refresh_at:
            cfg.last_token_refresh_at || atual.homologacao_last_token_refresh_at || null,
          homologacao_last_sync_at: cfg.last_sync_at || atual.homologacao_last_sync_at || null,
          homologacao_last_sync_result: String(cfg.last_sync_result || atual.homologacao_last_sync_result || ""),
          api_key: String(cfg.api_key && cfg.api_key !== "********" ? cfg.api_key : atual.api_key || ""),
          bearer_token: String(
            cfg.bearer_token && cfg.bearer_token !== "********" ? cfg.bearer_token : atual.bearer_token || ""
          ),
          webhook_secret: String(
            cfg.webhook_secret && cfg.webhook_secret !== "********" ? cfg.webhook_secret : atual.webhook_secret || ""
          )
        }
      };
    });
  }

  async function carregarIfoodHomologacaoStatus(silent = true) {
    if (!podeGerirEntregas) return;
    setLoadingIfoodStatus(true);
    try {
      const status = await api.getEntregasIfoodHomologacaoStatus(role);
      setIfoodHomologacaoStatus(status || null);
      aplicarStatusIfoodNoFormulario(status || null);
    } catch (error) {
      if (!silent) {
        onFeedback("error", error?.message || "Falha ao carregar status da homologacao iFood.");
      }
    } finally {
      setLoadingIfoodStatus(false);
    }
  }

  async function carregarIfoodEventos(limit = 40, silent = true) {
    if (!podeGerirEntregas) return;
    setLoadingIfoodEventos(true);
    try {
      const response = await api.getEntregasIfoodEventos(role, limit);
      const items = Array.isArray(response?.items) ? response.items : [];
      setIfoodEventos(items);
    } catch (error) {
      if (!silent) {
        onFeedback("error", error?.message || "Falha ao carregar eventos da homologacao iFood.");
      }
    } finally {
      setLoadingIfoodEventos(false);
    }
  }

  async function carregarDados() {
    if (!podeVerEntregas) return;
    setLoading(true);
    setErro("");
    try {
      const [motoboysData, pendentesData, resumoData, integracoesData] = await Promise.all([
        api.getEntregasMotoboys(role, ""),
        api.getEntregasPendentes(role, ""),
        api.getEntregasResumo(role),
        api.getEntregasIntegracoes(role)
      ]);

      const lista = (Array.isArray(motoboysData) ? motoboysData : []).map((motoboy) => ({
        ...motoboy,
        roleRuntime: role,
        pedidos: (Array.isArray(motoboy.pedidos) ? motoboy.pedidos : []).map((pedido) => normalizePedidoEntrega(pedido))
      }));
      const pendentesLista = (Array.isArray(pendentesData) ? pendentesData : []).map((pedido) =>
        normalizePedidoEntrega(pedido)
      );

      setMotoboys(lista);
      setPedidosPendentes(pendentesLista);
      setSelectedMotoboyId((prev) => {
        const prevId = String(prev || "").trim();
        if (prevId && lista.some((motoboy) => String(motoboy.id) === prevId)) {
          return prevId;
        }
        return lista.length > 0 ? String(lista[0].id) : "";
      });
      setResumo({
        motoboys: Number(resumoData?.motoboys || lista.length || 0),
        pedidos: Number(resumoData?.pedidos || 0),
        pendentes: Number(resumoData?.pendentes ?? pendentesLista.length ?? 0)
      });
      if (!pausandoAutoRefreshIntegracao) {
        const integracoesNormalizadas = normalizeIntegracoes(integracoesData);
        setIntegracoes(integracoesNormalizadas);
        setCodigoConexao((prev) => ({
          hub: String(
            (prev?.hub && String(prev.hub).trim()) ||
              integracoesNormalizadas.hub?.public_base_url ||
              integracoesNormalizadas.hub?.webhook_url ||
              ""
          ).trim(),
          ifood: String(
            (prev?.ifood && String(prev.ifood).trim()) || integracoesNormalizadas.ifood?.import_url || ""
          ).trim(),
          ninenine: String(
            (prev?.ninenine && String(prev.ninenine).trim()) || integracoesNormalizadas.ninenine?.import_url || ""
          ).trim()
        }));

        if (podeGerirEntregas) {
          await Promise.all([carregarIfoodHomologacaoStatus(true), carregarIfoodEventos(40, true)]);
        }
      }
    } catch (error) {
      setErro(error?.message || "Falha ao carregar entregas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, [role, podeVerEntregas]);

  useEffect(() => {
    if (!podeVerEntregas) return undefined;
    const timer = setInterval(() => {
      if (document.hidden) return;
      if (pausandoAutoRefreshIntegracao) return;
      carregarDados();
    }, 8000);
    return () => clearInterval(timer);
  }, [role, podeVerEntregas, pausandoAutoRefreshIntegracao]);

  async function criarMotoboy() {
    if (!podeGerirEntregas || savingMotoboy) return;
    const nome = String(novoNome || "").trim();
    if (!nome) {
      onFeedback("warning", "Informe o nome do motoboy.");
      return;
    }

    setSavingMotoboy(true);
    try {
      await api.criarEntregasMotoboy({ nome }, role);
      onFeedback("success", "Motoboy criado com sucesso.");
      setNovoNome("");
      await carregarDados();
    } catch (error) {
      onFeedback("error", error?.message || "Falha ao criar motoboy.");
    } finally {
      setSavingMotoboy(false);
    }
  }

  function alterarIntegracaoCampo(provider, field, value) {
    setIntegracoes((prev) => ({
      ...prev,
      [provider]: {
        ...(prev[provider] || {}),
        [field]: value
      }
    }));
  }

  async function copiarTexto(texto, mensagemSucesso = "Copiado para a area de transferencia.") {
    const valor = String(texto || "").trim();
    if (!valor) {
      onFeedback("warning", "Nao ha conteudo para copiar.");
      return;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(valor);
      } else {
        const temp = document.createElement("textarea");
        temp.value = valor;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
      }
      onFeedback("success", mensagemSucesso);
    } catch {
      onFeedback("error", "Falha ao copiar.");
    }
  }

  async function salvarIntegracao(provider, overrides = null, successMessage = "") {
    if (!podeGerirEntregas) return;
    const cfg = integracoes[provider];
    if (!cfg) return;
    const payloadLocal = {
      ...cfg,
      ...(overrides || {})
    };

    setSalvandoIntegracao((prev) => ({ ...prev, [provider]: true }));
    try {
      const bodyBase = {
        enabled: payloadLocal.enabled ? 1 : 0,
        motoboy_fallback: payloadLocal.motoboy_fallback
      };
      const bodyPayload =
        provider === "hub"
          ? {
              ...bodyBase,
              public_base_url: payloadLocal.public_base_url || payloadLocal.base_url || "",
              hub_token: payloadLocal.hub_token || "",
              rotate_token: payloadLocal.rotate_token ? 1 : 0
            }
          : {
              ...bodyBase,
              import_url: payloadLocal.import_url,
              base_url: payloadLocal.base_url,
              import_path: payloadLocal.import_path,
              import_query: payloadLocal.import_query,
              api_key: payloadLocal.api_key,
              bearer_token: payloadLocal.bearer_token,
              merchant_id: payloadLocal.merchant_id,
              webhook_secret: payloadLocal.webhook_secret,
              ...(provider === "ifood"
                ? {
                    homologacao_enabled: payloadLocal.homologacao_enabled ? 1 : 0,
                    homologacao_base_url: payloadLocal.homologacao_base_url || payloadLocal.base_url || "",
                    homologacao_token_url: payloadLocal.homologacao_token_url,
                    homologacao_polling_path: payloadLocal.homologacao_polling_path,
                    homologacao_ack_path: payloadLocal.homologacao_ack_path,
                    homologacao_order_details_path: payloadLocal.homologacao_order_details_path,
                    homologacao_order_details_path_fallback: payloadLocal.homologacao_order_details_path_fallback,
                    homologacao_client_id: payloadLocal.homologacao_client_id,
                    homologacao_grant_type: payloadLocal.homologacao_grant_type,
                    homologacao_authorization_code: payloadLocal.homologacao_authorization_code,
                    homologacao_refresh_token: payloadLocal.homologacao_refresh_token,
                    homologacao_scope: payloadLocal.homologacao_scope,
                    homologacao_polling_merchants: payloadLocal.homologacao_polling_merchants,
                    homologacao_polling_interval_seconds: payloadLocal.homologacao_polling_interval_seconds,
                    homologacao_polling_exclude_heartbeat: payloadLocal.homologacao_polling_exclude_heartbeat ? 1 : 0,
                    homologacao_auto_ack: payloadLocal.homologacao_auto_ack ? 1 : 0,
                    homologacao_webhook_signature_required: payloadLocal.homologacao_webhook_signature_required ? 1 : 0,
                    ...(String(payloadLocal.homologacao_client_secret || "").trim()
                      ? { homologacao_client_secret: payloadLocal.homologacao_client_secret }
                      : {})
                  }
                : {})
            };
      const saved = await api.salvarEntregasIntegracao(
        provider,
        bodyPayload,
        role
      );
      setIntegracoes((prev) => {
        const next = {
          ...prev,
          [provider]: {
            ...(prev[provider] || {}),
            ...saved,
            ...(provider === "ifood" ? { homologacao_client_secret: "" } : {})
          }
        };
        return normalizeIntegracoes(Object.values(next));
      });
      setCodigoConexao((prev) => ({
        ...prev,
        [provider]: String(
          provider === "hub"
            ? saved?.public_base_url || saved?.webhook_url || prev?.[provider] || ""
            : saved?.import_url || prev?.[provider] || ""
        ).trim()
      }));
      onFeedback("success", successMessage || `${INTEGRACAO_LABEL[provider] || provider}: configuracao salva.`);
      if (provider === "ifood") {
        await Promise.all([carregarIfoodHomologacaoStatus(true), carregarIfoodEventos(40, true)]);
      }
    } catch (error) {
      onFeedback("error", error?.message || "Falha ao salvar integracao.");
    } finally {
      setSalvandoIntegracao((prev) => ({ ...prev, [provider]: false }));
    }
  }

  async function conectarIntegracao(provider) {
    const cfg = integracoes[provider];
    if (!cfg) return;

    const rawCodigo = String(codigoConexao?.[provider] || "").trim();
    let parsed = null;
    if (rawCodigo) {
      try {
        parsed = parseCodigoConexao(rawCodigo, provider);
      } catch (error) {
        onFeedback("error", error?.message || "Codigo de conexao invalido.");
        return;
      }
    }

    if (provider === "hub") {
      const publicBaseUrl = String(parsed?.public_base_url || cfg.public_base_url || rawCodigo || "")
        .trim()
        .replace(/\/+$/, "");
      if (!publicBaseUrl || !/^https?:\/\//i.test(publicBaseUrl)) {
        onFeedback(
          "warning",
          "No Hub, informe a URL publica (http/https) do seu servidor para receber pedidos em tempo real."
        );
        return;
      }

      await salvarIntegracao(
        provider,
        {
          ...(parsed || {}),
          public_base_url: publicBaseUrl,
          enabled: true,
          rotate_token: !String(parsed?.hub_token || cfg?.hub_token || "").trim()
        },
        "Hub conectado. Copie o webhook e configure na automacao."
      );
      return;
    }

    const hasImportUrl = String(parsed?.import_url || cfg.import_url || "").trim();
    const hasBaseUrl = String(parsed?.base_url || cfg.base_url || "").trim();
    if (!hasImportUrl && !hasBaseUrl) {
      onFeedback(
        "warning",
        `Cole o codigo de conexao da GastroCode ou um link de sync do ${INTEGRACAO_LABEL[provider]} para conectar.`
      );
      return;
    }

    await salvarIntegracao(
      provider,
      {
        ...(parsed || {}),
        enabled: true
      },
      `${INTEGRACAO_LABEL[provider]} conectado. Agora clique em "Sincronizar pedidos".`
    );

    if (parsed?.import_url) {
      setCodigoConexao((prev) => ({
        ...prev,
        [provider]: parsed.import_url
      }));
    }
  }

  async function desconectarIntegracao(provider) {
    await salvarIntegracao(provider, { enabled: false }, `${INTEGRACAO_LABEL[provider]} desconectado.`);
  }

  function alternarAvancadoIntegracao(provider) {
    setMostrarAvancadoIntegracao((prev) => ({
      ...prev,
      [provider]: !prev[provider]
    }));
  }

  async function sincronizarIntegracao(provider) {
    if (!podeGerirEntregas) return;
    setSincronizandoIntegracao((prev) => ({ ...prev, [provider]: true }));
    try {
      const result = await api.sincronizarEntregasIntegracao(provider, { limit: 250 }, role);
      onFeedback("success", result?.message || `${INTEGRACAO_LABEL[provider] || provider}: sincronizacao concluida.`);
      if (provider === "ifood") {
        await Promise.all([carregarIfoodHomologacaoStatus(true), carregarIfoodEventos(40, true)]);
      }
      await carregarDados();
    } catch (error) {
      onFeedback("error", error?.message || "Falha ao sincronizar integracao.");
    } finally {
      setSincronizandoIntegracao((prev) => ({ ...prev, [provider]: false }));
    }
  }

  async function renovarTokenIfood() {
    if (!podeGerirEntregas || renovandoIfoodToken) return;
    setRenovandoIfoodToken(true);
    try {
      await api.renovarEntregasIfoodToken({ force: true }, role);
      onFeedback("success", "Token iFood renovado com sucesso.");
      await Promise.all([carregarIfoodHomologacaoStatus(true), carregarIfoodEventos(30, true)]);
    } catch (error) {
      onFeedback("error", error?.message || "Falha ao renovar token iFood.");
    } finally {
      setRenovandoIfoodToken(false);
    }
  }

  async function gerarNovoTokenHub() {
    const cfgHub = integracoes?.hub;
    if (!cfgHub || !podeGerirEntregas) return;
    await salvarIntegracao(
      "hub",
      {
        enabled: true,
        public_base_url: cfgHub.public_base_url || "",
        motoboy_fallback: cfgHub.motoboy_fallback || "Entregas Hub",
        rotate_token: true
      },
      "Novo token do Hub gerado com sucesso."
    );
  }

  async function adicionarPedidosGlobal() {
    if (!podeGerirEntregas || addingGlobal) return;
    const motoboySelecionado = motoboys.find((motoboy) => String(motoboy.id) === String(selectedMotoboyId));
    if (!motoboySelecionado) {
      onFeedback("warning", "Selecione um motoboy para enviar os pedidos.");
      return;
    }

    const pedidos = parsePedidos(pedidoGlobalText);
    if (pedidos.length < 1) {
      onFeedback("warning", "Cole ou digite ao menos um pedido.");
      return;
    }

    const payload = {
      pedidos: pedidos.map((numero) => ({
        numero,
        source: classificarOrigem(numero),
        whenISO: useCustomWhenGlobal ? buildLocalIso(whenDateGlobal, whenTimeGlobal) : undefined,
        payment: String(paymentModeGlobal || "ONLINE").toUpperCase()
      }))
    };

    setAddingGlobal(true);
    try {
      const resultado = await api.adicionarEntregasPedidosLote(motoboySelecionado.id, payload, role);
      const addedCount = Number(resultado?.addedCount || 0);
      const duplicados = Array.isArray(resultado?.skippedDuplicates) ? resultado.skippedDuplicates.length : 0;
      const invalidos = Array.isArray(resultado?.invalid) ? resultado.invalid.length : 0;

      if (addedCount > 0) {
        onFeedback("success", `${motoboySelecionado.nome}: ${addedCount} pedido(s) adicionado(s).`);
      }
      if (duplicados > 0) {
        onFeedback("warning", `${motoboySelecionado.nome}: ${duplicados} pedido(s) ja existiam.`);
      }
      if (invalidos > 0) {
        onFeedback("error", `${motoboySelecionado.nome}: ${invalidos} pedido(s) invalidos.`);
      }

      if (addedCount > 0) {
        setPedidoGlobalText("");
      }

      await carregarDados();
    } catch (error) {
      onFeedback("error", error?.message || "Falha ao adicionar pedidos.");
    } finally {
      setAddingGlobal(false);
    }
  }

  async function enviarPendenteParaMotoboy(pedido) {
    if (!podeGerirEntregas) return;
    const pedidoId = Number(pedido?.id || 0);
    const motoboyId = Number(selectedMotoboyId || 0);
    if (!Number.isFinite(pedidoId) || pedidoId < 1) return;
    if (!Number.isFinite(motoboyId) || motoboyId < 1) {
      onFeedback("warning", "Selecione um motoboy para enviar o pedido pendente.");
      return;
    }

    setPedidoPendenteEmAcao(`atr:${pedidoId}`);
    try {
      await api.atribuirEntregasPedido(
        pedidoId,
        {
          motoboy_id: motoboyId
        },
        role
      );
      onFeedback("success", `Pedido #${pedido?.numero || pedidoId} enviado para o motoboy.`);
      await carregarDados();
    } catch (error) {
      onFeedback("error", error?.message || "Falha ao enviar pedido para o motoboy.");
    } finally {
      setPedidoPendenteEmAcao("");
    }
  }

  async function removerPedidoPendente(pedido) {
    if (!podeGerirEntregas) return;
    const pedidoId = Number(pedido?.id || 0);
    if (!Number.isFinite(pedidoId) || pedidoId < 1) return;

    setPedidoPendenteEmAcao(`del:${pedidoId}`);
    try {
      await api.removerEntregasPedido(pedidoId, role);
      onFeedback("success", `Pedido #${pedido?.numero || pedidoId} removido da fila pendente.`);
      await carregarDados();
    } catch (error) {
      onFeedback("error", error?.message || "Falha ao remover pedido pendente.");
    } finally {
      setPedidoPendenteEmAcao("");
    }
  }

  function alternarSelecionarPendente(pedidoIdRaw) {
    const pedidoId = Number(pedidoIdRaw || 0);
    if (!Number.isFinite(pedidoId) || pedidoId < 1) return;
    setPendentesSelecionados((prev) =>
      prev.includes(pedidoId) ? prev.filter((id) => id !== pedidoId) : [...prev, pedidoId]
    );
  }

  function alternarSelecionarTodosPendentes() {
    if (todosPendentesSelecionados) {
      setPendentesSelecionados([]);
      return;
    }
    setPendentesSelecionados(pendentesFiltradosIds);
  }

  async function enviarPendentesParaMotoboyPorIds(ids) {
    if (!podeGerirEntregas) return;
    const motoboyId = Number(selectedMotoboyId || 0);
    if (!Number.isFinite(motoboyId) || motoboyId < 1) {
      onFeedback("warning", "Selecione um motoboy para envio em lote.");
      return;
    }

    const listaIds = Array.isArray(ids)
      ? ids
          .map((id) => Number(id || 0))
          .filter((id) => Number.isFinite(id) && id > 0)
      : [];
    if (listaIds.length < 1) {
      onFeedback("warning", "Nenhum pedido pendente selecionado.");
      return;
    }

    setProcessandoPendentesLote(true);
    let sucesso = 0;
    let falha = 0;

    try {
      for (const pedidoId of listaIds) {
        try {
          await api.atribuirEntregasPedido(
            pedidoId,
            {
              motoboy_id: motoboyId
            },
            role
          );
          sucesso += 1;
        } catch {
          falha += 1;
        }
      }

      if (sucesso > 0 && falha < 1) {
        onFeedback("success", `${sucesso} pedido(s) enviado(s) para o motoboy.`);
      } else if (sucesso > 0 && falha > 0) {
        onFeedback("warning", `${sucesso} pedido(s) enviado(s) e ${falha} com falha.`);
      } else {
        onFeedback("error", "Falha ao enviar pedidos em lote.");
      }

      await carregarDados();
      setPendentesSelecionados([]);
    } finally {
      setProcessandoPendentesLote(false);
    }
  }

  const listaFiltrada = useMemo(() => {
    return filtrarMotoboys(motoboys, q, fromDate, fromTime, toDate, toTime);
  }, [motoboys, q, fromDate, fromTime, toDate, toTime]);

  const pendentesFiltrados = useMemo(() => {
    const query = String(q || "")
      .trim()
      .toLowerCase();
    return (Array.isArray(pedidosPendentes) ? pedidosPendentes : []).filter((pedido) => {
      if (!inRange(pedido.dataISO, fromDate, fromTime, toDate, toTime)) return false;
      if (!query) return true;
      const numero = String(pedido.numero || "").toLowerCase();
      const source = String(pedido.source || "").toLowerCase();
      const payment = String(pedido.payment || "").toLowerCase();
      const status = String(pedido.status || "").toLowerCase();
      return numero.includes(query) || source.includes(query) || payment.includes(query) || status.includes(query);
    });
  }, [pedidosPendentes, q, fromDate, fromTime, toDate, toTime]);

  const pendentesAtivosFiltrados = useMemo(() => {
    return pendentesFiltrados.filter((pedido) => !Boolean(pedido?.resumoVisual?.cancelado));
  }, [pendentesFiltrados]);

  const pendentesCanceladosFiltrados = useMemo(() => {
    return pendentesFiltrados.filter((pedido) => Boolean(pedido?.resumoVisual?.cancelado));
  }, [pendentesFiltrados]);

  const pendentesFiltradosIds = useMemo(() => {
    return pendentesAtivosFiltrados
      .map((pedido) => Number(pedido?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
  }, [pendentesAtivosFiltrados]);

  const todosPendentesSelecionados =
    pendentesFiltradosIds.length > 0 &&
    pendentesFiltradosIds.every((id) => pendentesSelecionados.includes(id));

  useEffect(() => {
    const setFiltrado = new Set(pendentesFiltradosIds);
    setPendentesSelecionados((prev) => prev.filter((id) => setFiltrado.has(id)));
  }, [pendentesFiltradosIds]);

  const totalPedidosMotoboyFiltrados = useMemo(() => {
    return listaFiltrada.reduce((acc, motoboy) => acc + Number(motoboy.pedidosFiltrados?.length || 0), 0);
  }, [listaFiltrada]);

  const totalPendentesFiltrados = Number(pendentesFiltrados.length || 0);
  const totalPendentesAtivosFiltrados = Number(pendentesAtivosFiltrados.length || 0);
  const totalPendentesCanceladosFiltrados = Number(pendentesCanceladosFiltrados.length || 0);

  const motoboyOptions = useMemo(() => {
    return motoboys.map((motoboy) => ({
      value: String(motoboy.id),
      label: motoboy.nome
    }));
  }, [motoboys]);

  if (!podeVerEntregas) {
    return <p>Sem permissao para acessar entregas.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={headerCardStyle}>
        <div style={titleRowStyle}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-heading)" }}>Online</h2>
          <button type="button" style={neutralMiniButtonStyle(loading)} onClick={carregarDados} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div style={gridStatsStyle}>
          <div style={statCardStyle}>
            <span style={statLabelStyle}>Motoboys no filtro</span>
            <strong style={statValueStyle}>{inteiro(listaFiltrada.length)}</strong>
          </div>
          <div style={statCardStyle}>
            <span style={statLabelStyle}>Pedidos em motoboy (filtro)</span>
            <strong style={statValueStyle}>{inteiro(totalPedidosMotoboyFiltrados)}</strong>
          </div>
          <div style={statCardStyle}>
            <span style={statLabelStyle}>Pendentes (filtro)</span>
            <strong style={statValueStyle}>{inteiro(totalPendentesAtivosFiltrados)}</strong>
          </div>
          <div style={statCardStyle}>
            <span style={statLabelStyle}>Cancelados (filtro)</span>
            <strong style={statValueStyle}>{inteiro(totalPendentesCanceladosFiltrados)}</strong>
          </div>
        </div>

        <div style={filterPanelStyle}>
          <div style={filterGridStyle}>
            <div style={miniFieldStyle}>
              <span style={miniFieldLabelStyle}>Busca</span>
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder={
                  onlineTab === "motoboy"
                    ? "Motoboy ou numero do pedido"
                    : "Pedido pendente ou numero"
                }
                style={inputStyle}
              />
            </div>
            <div style={miniFieldStyle}>
              <span style={miniFieldLabelStyle}>Data inicial</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                style={inputDateStyle}
              />
            </div>
            <div style={miniFieldStyle}>
              <span style={miniFieldLabelStyle}>Hora inicial</span>
              <input
                type="time"
                value={fromTime}
                onChange={(event) => setFromTime(event.target.value)}
                style={inputDateStyle}
              />
            </div>
            <div style={miniFieldStyle}>
              <span style={miniFieldLabelStyle}>Data final</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                style={inputDateStyle}
              />
            </div>
            <div style={miniFieldStyle}>
              <span style={miniFieldLabelStyle}>Hora final</span>
              <input
                type="time"
                value={toTime}
                onChange={(event) => setToTime(event.target.value)}
                style={inputDateStyle}
              />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                style={neutralMiniButtonStyle(false)}
                onClick={() => {
                  const hoje = agoraDataIso();
                  setFromDate(hoje);
                  setToDate(hoje);
                  setFromTime("00:00");
                  setToTime("23:59");
                }}
              >
                Hoje
              </button>
              <button
                type="button"
                style={neutralMiniButtonStyle(false)}
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                  setFromTime("00:00");
                  setToTime("23:59");
                }}
              >
                Limpar filtro
              </button>
            </div>
          </div>
        </div>

        <div style={onlineTabsShellStyle}>
          <div style={onlineTabsWrapStyle}>
            <button
              type="button"
              style={onlineTabButtonStyle(onlineTab === "pedidos")}
              onClick={() => setOnlineTab("pedidos")}
            >
              Pedidos
              <span style={onlineTabCountStyle(onlineTab === "pedidos")}>{inteiro(totalPendentesFiltrados)}</span>
            </button>
            <button
              type="button"
              style={onlineTabButtonStyle(onlineTab === "motoboy")}
              onClick={() => setOnlineTab("motoboy")}
            >
              Motoboy
              <span style={onlineTabCountStyle(onlineTab === "motoboy")}>{inteiro(listaFiltrada.length)}</span>
            </button>
          </div>
          <div style={integracaoHelpTextStyle}>
            {onlineTab === "pedidos"
              ? "Aqui voce recebe os pedidos online e envia para um motoboy."
              : "Aqui voce gerencia motoboys e pedidos ja atribuidos."}
          </div>
        </div>

        {onlineTab === "pedidos" && podeGerirEntregas ? (
          <div style={integracoesPanelStyle}>
            <div style={titleRowStyle}>
              <strong style={{ fontFamily: "var(--font-heading)" }}>Configuracao avancada (tecnico)</strong>
              <button
                type="button"
                style={neutralMiniButtonStyle(false)}
                onClick={() => setMostrarPainelIntegracoes((prev) => !prev)}
              >
                {mostrarPainelIntegracoes ? "Ocultar tecnico" : "Abrir tecnico"}
              </button>
            </div>
            <div style={integracaoHelpTextStyle}>
              Use somente para implantacao e suporte. No dia a dia, use as abas Pedidos e Motoboy.
            </div>
            {mostrarPainelIntegracoes ? <div style={integracoesGridStyle}>
            {INTEGRACAO_ORDER.map((provider) => {
              const cfg = integracoes[provider];
              if (!cfg) return null;
              const isSaving = Boolean(salvandoIntegracao[provider]);
              const isSyncing = Boolean(sincronizandoIntegracao[provider]);
              const isHub = provider === "hub";
              const hubWebhookUrl = String(cfg.webhook_url || "").trim();
              const isConnected = isHub
                ? Boolean(cfg.enabled && (hubWebhookUrl || String(cfg.hub_token || "").trim()))
                : Boolean(cfg.enabled && (String(cfg.import_url || "").trim() || String(cfg.base_url || "").trim()));
              const showAdvanced = Boolean(mostrarAvancadoIntegracao[provider]);
              const ultimaDataSync =
                provider === "ifood" ? cfg.homologacao_last_sync_at || cfg.last_sync_at : cfg.last_sync_at;
              const ultimoResultadoSync =
                provider === "ifood"
                  ? cfg.homologacao_last_sync_result || cfg.last_sync_result
                  : cfg.last_sync_result;
              return (
                <section key={provider} style={integracaoCardStyle}>
                  <div style={integracaoTitleRowStyle}>
                    <strong style={{ fontSize: 20, fontFamily: "var(--font-heading)" }}>
                      {INTEGRACAO_LABEL[provider]}
                    </strong>
                    <span style={integracaoStatusPillStyle(isConnected)}>
                      {isConnected ? "Conectado" : "Desconectado"}
                    </span>
                  </div>

                  <div style={integracaoSimpleFieldsStyle}>
                    <input
                      value={codigoConexao?.[provider] || ""}
                      onChange={(event) =>
                        setCodigoConexao((prev) => ({
                          ...prev,
                          [provider]: event.target.value
                        }))
                      }
                      placeholder={
                        isHub
                          ? "URL publica do Hub (ex.: https://seu-subdominio.trycloudflare.com)"
                          : `Cole o codigo de conexao ${INTEGRACAO_LABEL[provider]}`
                      }
                      style={inputStyle}
                      disabled={!podeGerirEntregas || isSaving || isSyncing}
                    />
                  </div>

                  <div style={integracaoHelpTextStyle}>
                    {isHub
                      ? "Essencial: informe a URL publica do Hub e clique em Conectar conta."
                      : "Essencial: cole o codigo de conexao da conta e clique em Conectar conta."}
                  </div>

                  {provider === "ifood" && ifoodHomologacaoStatus ? (
                    <div style={integracaoQuickStatusStyle}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <strong style={{ fontSize: 12 }}>
                          Homologacao: {ifoodHomologacaoStatus?.checklist?.ready ? "PRONTA" : "PENDENTE"}
                        </strong>
                        <span style={integracaoHelpTextStyle}>
                          ACK 24h:{" "}
                          {Number(ifoodHomologacaoStatus?.metrics?.last_24h?.ack_rate_percent || 0).toLocaleString(
                            "pt-BR",
                            { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                          )}
                          %
                        </span>
                      </div>
                      <button
                        type="button"
                        style={neutralMiniButtonStyle(!podeGerirEntregas)}
                        onClick={() =>
                          copiarTexto(resumoHomologacaoIfoodTexto, "Resumo de homologacao iFood copiado.")
                        }
                        disabled={!podeGerirEntregas}
                      >
                        Copiar resumo
                      </button>
                    </div>
                  ) : null}

                  <div style={integracaoActionRowStyle}>
                    <button
                      type="button"
                      style={primaryMiniButtonStyle(isSaving || isSyncing || !podeGerirEntregas)}
                      onClick={() => conectarIntegracao(provider)}
                      disabled={isSaving || isSyncing || !podeGerirEntregas}
                    >
                      {isSaving ? "Conectando..." : "Conectar conta"}
                    </button>
                    {!isHub ? (
                      <button
                        type="button"
                        style={neutralMiniButtonStyle(isSaving || isSyncing || !podeGerirEntregas)}
                        onClick={() => sincronizarIntegracao(provider)}
                        disabled={isSaving || isSyncing || !podeGerirEntregas}
                      >
                        {isSyncing ? "Sincronizando..." : "Sincronizar pedidos"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      style={dangerMiniButtonStyle(isSaving || isSyncing || !podeGerirEntregas || !cfg.enabled)}
                      onClick={() => desconectarIntegracao(provider)}
                      disabled={isSaving || isSyncing || !podeGerirEntregas || !cfg.enabled}
                    >
                      Desconectar
                    </button>
                    <button
                      type="button"
                      style={neutralMiniButtonStyle(isSaving || isSyncing || !podeGerirEntregas)}
                      onClick={() => alternarAvancadoIntegracao(provider)}
                      disabled={isSaving || isSyncing || !podeGerirEntregas}
                    >
                      {showAdvanced ? "Ocultar avancado" : "Opcoes avancadas"}
                    </button>
                  </div>

                  {showAdvanced ? (
                    isHub ? (
                      <div style={integracaoAdvancedBoxStyle}>
                        <div style={{ ...integracaoHelpTextStyle, marginBottom: 8 }}>
                          Modo tecnico do Hub (opcional). O cliente final nao precisa mexer aqui.
                        </div>
                        <div style={integracaoActionRowStyle}>
                          <button
                            type="button"
                            style={neutralMiniButtonStyle(isSaving || isSyncing || !podeGerirEntregas)}
                            onClick={gerarNovoTokenHub}
                            disabled={isSaving || isSyncing || !podeGerirEntregas}
                          >
                            Gerar novo token
                          </button>
                          <button
                            type="button"
                            style={neutralMiniButtonStyle(
                              isSaving || isSyncing || !String(cfg.webhook_ifood_url || cfg.webhook_url || "").trim()
                            )}
                            onClick={() =>
                              copiarTexto(
                                cfg.webhook_ifood_url || cfg.webhook_url,
                                "Webhook do iFood copiado."
                              )
                            }
                            disabled={isSaving || isSyncing || !String(cfg.webhook_ifood_url || cfg.webhook_url || "").trim()}
                          >
                            Copiar webhook iFood
                          </button>
                          <button
                            type="button"
                            style={neutralMiniButtonStyle(
                              isSaving || isSyncing || !String(cfg.webhook_ninenine_url || cfg.webhook_url || "").trim()
                            )}
                            onClick={() =>
                              copiarTexto(
                                cfg.webhook_ninenine_url || cfg.webhook_url,
                                "Webhook da 99 copiado."
                              )
                            }
                            disabled={
                              isSaving || isSyncing || !String(cfg.webhook_ninenine_url || cfg.webhook_url || "").trim()
                            }
                          >
                            Copiar webhook 99
                          </button>
                        </div>
                        <div style={{ ...integracaoHelpTextStyle, marginTop: 8 }}>
                          Webhook principal: {String(cfg.webhook_url || "").trim() ? "gerado e pronto para uso." : "ainda nao gerado."}
                        </div>
                        {String(cfg.webhook_url || "").trim() ? <input value={cfg.webhook_url || ""} readOnly style={inputStyle} /> : null}
                      </div>
                    ) : (
                      <div style={integracaoAdvancedBoxStyle}>
                      <div style={{ ...integracaoHelpTextStyle, marginBottom: 6 }}>
                        Modo tecnico (uso da GastroCode). So altere se orientado.
                      </div>
                      <div style={integracaoFieldsGridStyle}>
                        <input
                          value={cfg.base_url}
                          onChange={(event) => alterarIntegracaoCampo(provider, "base_url", event.target.value)}
                          placeholder="URL base da API (ex.: http://localhost:3210)"
                          style={inputStyle}
                          disabled={!podeGerirEntregas || isSaving || isSyncing}
                        />
                        <input
                          value={cfg.import_path}
                          onChange={(event) => alterarIntegracaoCampo(provider, "import_path", event.target.value)}
                          placeholder="/orders"
                          style={inputStyle}
                          disabled={!podeGerirEntregas || isSaving || isSyncing}
                        />
                        <input
                          value={cfg.import_query}
                          onChange={(event) => alterarIntegracaoCampo(provider, "import_query", event.target.value)}
                          placeholder={provider === "ifood" ? "source=IFOOD" : "source=NINENINE"}
                          style={inputStyle}
                          disabled={!podeGerirEntregas || isSaving || isSyncing}
                        />
                        <input
                          value={cfg.api_key}
                          onChange={(event) => alterarIntegracaoCampo(provider, "api_key", event.target.value)}
                          placeholder="x-api-key"
                          style={inputStyle}
                          disabled={!podeGerirEntregas || isSaving || isSyncing}
                        />
                        <input
                          value={cfg.bearer_token}
                          onChange={(event) => alterarIntegracaoCampo(provider, "bearer_token", event.target.value)}
                          placeholder="Bearer token (opcional)"
                          style={inputStyle}
                          disabled={!podeGerirEntregas || isSaving || isSyncing}
                        />
                        <input
                          value={cfg.webhook_secret}
                          onChange={(event) => alterarIntegracaoCampo(provider, "webhook_secret", event.target.value)}
                          placeholder="Segredo do webhook (opcional)"
                          style={inputStyle}
                          disabled={!podeGerirEntregas || isSaving || isSyncing}
                        />
                      </div>

                      {provider === "ifood" ? (
                        <div style={{ ...integracaoAdvancedBoxStyle, marginTop: 10 }}>
                          <div style={integracaoSubTitleStyle}>Homologacao iFood (producao)</div>
                          <div style={integracaoToggleRowStyle}>
                            <label style={checkboxLabelStyle}>
                              <input
                                type="checkbox"
                                checked={Boolean(cfg.homologacao_enabled)}
                                onChange={(event) =>
                                  alterarIntegracaoCampo(provider, "homologacao_enabled", event.target.checked)
                                }
                                disabled={!podeGerirEntregas || isSaving || isSyncing}
                              />
                              <span>Ativar modo homologacao iFood</span>
                            </label>
                            <label style={checkboxLabelStyle}>
                              <input
                                type="checkbox"
                                checked={Boolean(cfg.homologacao_auto_ack)}
                                onChange={(event) =>
                                  alterarIntegracaoCampo(provider, "homologacao_auto_ack", event.target.checked)
                                }
                                disabled={!podeGerirEntregas || isSaving || isSyncing}
                              />
                              <span>ACK automatico</span>
                            </label>
                            <label style={checkboxLabelStyle}>
                              <input
                                type="checkbox"
                                checked={Boolean(cfg.homologacao_polling_exclude_heartbeat)}
                                onChange={(event) =>
                                  alterarIntegracaoCampo(
                                    provider,
                                    "homologacao_polling_exclude_heartbeat",
                                    event.target.checked
                                  )
                                }
                                disabled={!podeGerirEntregas || isSaving || isSyncing}
                              />
                              <span>excludeHeartbeat=true</span>
                            </label>
                            <label style={checkboxLabelStyle}>
                              <input
                                type="checkbox"
                                checked={Boolean(cfg.homologacao_webhook_signature_required)}
                                onChange={(event) =>
                                  alterarIntegracaoCampo(
                                    provider,
                                    "homologacao_webhook_signature_required",
                                    event.target.checked
                                  )
                                }
                                disabled={!podeGerirEntregas || isSaving || isSyncing}
                              />
                              <span>Exigir assinatura no webhook</span>
                            </label>
                          </div>

                          <div style={integracaoFieldsGridStyle}>
                            <input
                              value={cfg.homologacao_base_url}
                              onChange={(event) =>
                                alterarIntegracaoCampo(provider, "homologacao_base_url", event.target.value)
                              }
                              placeholder="Base URL iFood (ex.: https://merchant-api.ifood.com.br)"
                              style={inputStyle}
                              disabled={!podeGerirEntregas || isSaving || isSyncing}
                            />
                            <input
                              value={cfg.homologacao_token_url}
                              onChange={(event) =>
                                alterarIntegracaoCampo(provider, "homologacao_token_url", event.target.value)
                              }
                              placeholder="/authentication/v1.0/oauth/token"
                              style={inputStyle}
                              disabled={!podeGerirEntregas || isSaving || isSyncing}
                            />
                            <input
                              value={cfg.homologacao_polling_path}
                              onChange={(event) =>
                                alterarIntegracaoCampo(provider, "homologacao_polling_path", event.target.value)
                              }
                              placeholder="/events/v1.0/events:polling"
                              style={inputStyle}
                              disabled={!podeGerirEntregas || isSaving || isSyncing}
                            />
                            <input
                              value={cfg.homologacao_ack_path}
                              onChange={(event) =>
                                alterarIntegracaoCampo(provider, "homologacao_ack_path", event.target.value)
                              }
                              placeholder="/events/v1.0/events/acknowledgment"
                              style={inputStyle}
                              disabled={!podeGerirEntregas || isSaving || isSyncing}
                            />
                            <input
                              value={cfg.homologacao_order_details_path}
                              onChange={(event) =>
                                alterarIntegracaoCampo(
                                  provider,
                                  "homologacao_order_details_path",
                                  event.target.value
                                )
                              }
                              placeholder="/order/v1.0/orders/{orderId}"
                              style={inputStyle}
                              disabled={!podeGerirEntregas || isSaving || isSyncing}
                            />
                            <input
                              value={cfg.homologacao_order_details_path_fallback}
                              onChange={(event) =>
                                alterarIntegracaoCampo(
                                  provider,
                                  "homologacao_order_details_path_fallback",
                                  event.target.value
                                )
                              }
                              placeholder="/orders/{orderId} (fallback)"
                              style={inputStyle}
                              disabled={!podeGerirEntregas || isSaving || isSyncing}
                            />
                            <input
                              value={cfg.homologacao_polling_merchants}
                              onChange={(event) =>
                                alterarIntegracaoCampo(
                                  provider,
                                  "homologacao_polling_merchants",
                                  event.target.value
                                )
                              }
                              placeholder="Merchant IDs (separados por ; ou ,)"
                              style={inputStyle}
                              disabled={!podeGerirEntregas || isSaving || isSyncing}
                            />
                            <input
                              type="number"
                              min={30}
                              max={120}
                              value={Number(cfg.homologacao_polling_interval_seconds || 30)}
                              onChange={(event) =>
                                alterarIntegracaoCampo(
                                  provider,
                                  "homologacao_polling_interval_seconds",
                                  Number(event.target.value || 30)
                                )
                              }
                              placeholder="Intervalo do polling (30s)"
                              style={inputStyle}
                              disabled={!podeGerirEntregas || isSaving || isSyncing}
                            />
                            <input
                              value={cfg.homologacao_client_id}
                              onChange={(event) =>
                                alterarIntegracaoCampo(provider, "homologacao_client_id", event.target.value)
                              }
                              placeholder="Client ID iFood"
                              style={inputStyle}
                              disabled={!podeGerirEntregas || isSaving || isSyncing}
                            />
                            <input
                              type="password"
                              value={cfg.homologacao_client_secret}
                              onChange={(event) =>
                                alterarIntegracaoCampo(provider, "homologacao_client_secret", event.target.value)
                              }
                              placeholder="Client Secret iFood (preencha para atualizar)"
                              style={inputStyle}
                              disabled={!podeGerirEntregas || isSaving || isSyncing}
                            />
                            <SelectField
                              value={cfg.homologacao_grant_type}
                              onChange={(value) => alterarIntegracaoCampo(provider, "homologacao_grant_type", value)}
                              options={[
                                { value: "client_credentials", label: "client_credentials" },
                                { value: "authorization_code", label: "authorization_code" },
                                { value: "refresh_token", label: "refresh_token" }
                              ]}
                              buttonStyle={inputDateStyle}
                              wrapperStyle={{ minWidth: 180 }}
                              disabled={!podeGerirEntregas || isSaving || isSyncing}
                            />
                            <input
                              value={cfg.homologacao_scope}
                              onChange={(event) =>
                                alterarIntegracaoCampo(provider, "homologacao_scope", event.target.value)
                              }
                              placeholder="Scope OAuth (opcional)"
                              style={inputStyle}
                              disabled={!podeGerirEntregas || isSaving || isSyncing}
                            />
                            <input
                              value={cfg.homologacao_authorization_code}
                              onChange={(event) =>
                                alterarIntegracaoCampo(
                                  provider,
                                  "homologacao_authorization_code",
                                  event.target.value
                                )
                              }
                              placeholder="Authorization code (se usar authorization_code)"
                              style={inputStyle}
                              disabled={!podeGerirEntregas || isSaving || isSyncing}
                            />
                            <input
                              value={cfg.homologacao_refresh_token}
                              onChange={(event) =>
                                alterarIntegracaoCampo(provider, "homologacao_refresh_token", event.target.value)
                              }
                              placeholder="Refresh token (se usar refresh_token)"
                              style={inputStyle}
                              disabled={!podeGerirEntregas || isSaving || isSyncing}
                            />
                          </div>

                          <div style={{ ...integracaoActionRowStyle, marginTop: 8 }}>
                            <button
                              type="button"
                              style={primaryMiniButtonStyle(isSaving || isSyncing || !podeGerirEntregas)}
                              onClick={() => salvarIntegracao(provider)}
                              disabled={isSaving || isSyncing || !podeGerirEntregas}
                            >
                              {isSaving ? "Salvando..." : "Salvar homologacao iFood"}
                            </button>
                            <button
                              type="button"
                              style={neutralMiniButtonStyle(renovandoIfoodToken || isSyncing || !podeGerirEntregas)}
                              onClick={renovarTokenIfood}
                              disabled={renovandoIfoodToken || isSyncing || !podeGerirEntregas}
                            >
                              {renovandoIfoodToken ? "Renovando token..." : "Renovar token agora"}
                            </button>
                            <button
                              type="button"
                              style={neutralMiniButtonStyle(loadingIfoodStatus || !podeGerirEntregas)}
                              onClick={() => carregarIfoodHomologacaoStatus(false)}
                              disabled={loadingIfoodStatus || !podeGerirEntregas}
                            >
                              {loadingIfoodStatus ? "Atualizando status..." : "Atualizar status"}
                            </button>
                            <button
                              type="button"
                              style={neutralMiniButtonStyle(loadingIfoodEventos || !podeGerirEntregas)}
                              onClick={() => carregarIfoodEventos(80, false)}
                              disabled={loadingIfoodEventos || !podeGerirEntregas}
                            >
                              {loadingIfoodEventos ? "Atualizando eventos..." : "Ver eventos recentes"}
                            </button>
                            <button
                              type="button"
                              style={neutralMiniButtonStyle(!podeGerirEntregas)}
                              onClick={() =>
                                copiarTexto(resumoHomologacaoIfoodTexto, "Resumo de homologacao iFood copiado.")
                              }
                              disabled={!podeGerirEntregas}
                            >
                              Copiar resumo p/ ticket
                            </button>
                            <button
                              type="button"
                              style={neutralMiniButtonStyle(
                                !String(integracoes?.hub?.webhook_ifood_url || integracoes?.hub?.webhook_url || "").trim()
                              )}
                              onClick={() =>
                                copiarTexto(
                                  integracoes?.hub?.webhook_ifood_url || integracoes?.hub?.webhook_url || "",
                                  "Webhook iFood copiado."
                                )
                              }
                              disabled={
                                !String(integracoes?.hub?.webhook_ifood_url || integracoes?.hub?.webhook_url || "").trim()
                              }
                            >
                              Copiar webhook iFood
                            </button>
                          </div>

                          {ifoodHomologacaoStatus ? (
                            <div style={integracaoStatusPanelStyle}>
                              <div style={integracaoStatusHeadlineStyle}>
                                <span>
                                  Checklist homologacao:{" "}
                                  {ifoodHomologacaoStatus?.checklist?.ready ? "PRONTO" : "PENDENTE"}
                                </span>
                                <span>
                                  ACK 24h:{" "}
                                  {Number(
                                    ifoodHomologacaoStatus?.metrics?.last_24h?.ack_rate_percent || 0
                                  ).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  %
                                </span>
                              </div>
                              <div style={integracaoChecklistGridStyle}>
                                {(Array.isArray(ifoodHomologacaoStatus?.checklist?.items)
                                  ? ifoodHomologacaoStatus.checklist.items
                                  : []
                                ).map((item) => (
                                  <span key={item.key} style={checklistPillStyle(Boolean(item.ok))}>
                                    {item.ok ? "OK" : "PEND"} - {item.label}
                                  </span>
                                ))}
                              </div>
                              {ifoodHomologacaoStatus?.last_sync_result ? (
                                <div style={integracaoHelpTextStyle}>
                                  Ultimo resultado: {ifoodHomologacaoStatus.last_sync_result}
                                </div>
                              ) : null}
                              {cfg.homologacao_last_token_refresh_at ? (
                                <div style={integracaoHelpTextStyle}>
                                  Ultima renovacao de token: {formatDateTimePtBr(cfg.homologacao_last_token_refresh_at)}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          <div style={integracaoStatusPanelStyle}>
                            <div style={integracaoStatusHeadlineStyle}>
                              <span>Resumo pronto para suporte/homologacao</span>
                            </div>
                            <div style={integracaoHelpTextStyle}>
                              Esse texto ja sai no formato para colar no ticket do iFood.
                            </div>
                            <textarea
                              value={resumoHomologacaoIfoodTexto}
                              readOnly
                              style={{ ...textAreaStyle, minHeight: 140, fontSize: 12 }}
                            />
                          </div>

                          {ifoodEventos.length > 0 ? (
                            <div style={integracaoEventsPanelStyle}>
                              {ifoodEventos.slice(0, 8).map((evento) => (
                                <div key={`${evento.event_id}-${evento.id}`} style={integracaoEventItemStyle}>
                                  <div style={{ display: "grid", gap: 2 }}>
                                    <strong style={{ fontSize: 12 }}>{evento.full_code || evento.code || "EVENTO"}</strong>
                                    <span style={{ color: "#9db1e8", fontSize: 11 }}>
                                      Pedido: {evento.order_id || "-"} |{" "}
                                      {formatDateTimePtBr(evento.received_at || evento.created_at_event)}
                                    </span>
                                  </div>
                                  <span style={checklistPillStyle(String(evento.status || "").toUpperCase() === "ACKED")}>
                                    {evento.status || "RECEIVED"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            style={primaryMiniButtonStyle(isSaving || isSyncing || !podeGerirEntregas)}
                            onClick={() => salvarIntegracao(provider)}
                            disabled={isSaving || isSyncing || !podeGerirEntregas}
                          >
                            {isSaving ? "Salvando..." : "Salvar modo avancado"}
                          </button>
                        </div>
                      )}
                      </div>
                    )
                  ) : null}

                  {ultimaDataSync ? (
                    <div style={integracaoLastSyncStyle}>
                      <strong>Ultimo sync:</strong> {formatDateTimePtBr(ultimaDataSync)}
                      {ultimoResultadoSync ? <div>{ultimoResultadoSync}</div> : null}
                    </div>
                  ) : (
                    <div style={integracaoLastSyncStyle}>
                      <strong>Ultimo sync:</strong> ainda nao sincronizado.
                    </div>
                  )}
                </section>
              );
            })}
            </div>
          : null}
          </div>
        ) : null}

        {onlineTab === "motoboy" && podeGerirEntregas ? (
          <div style={createRowStyle}>
            <input
              value={novoNome}
              onChange={(event) => setNovoNome(event.target.value)}
              placeholder="Nome do motoboy"
              style={inputStyle}
            />
            <button type="button" style={primaryMiniButtonStyle(savingMotoboy)} onClick={criarMotoboy} disabled={savingMotoboy}>
              {savingMotoboy ? "Criando..." : "Adicionar motoboy"}
            </button>
          </div>
        ) : null}

        {onlineTab === "pedidos" && podeGerirEntregas ? (
          <div style={centralAddBoxStyle}>
            <div style={titleRowStyle}>
              <strong style={{ fontFamily: "var(--font-heading)" }}>Entrada rapida (varios pedidos de uma vez)</strong>
            </div>
            <div style={integracaoHelpTextStyle}>
              Cole varios codigos separados por espaco, virgula ou Enter e envie tudo em um unico clique.
            </div>
            <textarea
              value={pedidoGlobalText}
              onChange={(event) => setPedidoGlobalText(event.target.value)}
              style={textAreaStyle}
              placeholder="Ex.: 3456 5435 8890 ou uma lista em varias linhas"
            />
            <div style={rowWrapStyle}>
              <div style={miniFieldStyle}>
                <span style={miniFieldLabelStyle}>Motoboy</span>
                <SelectField
                  value={selectedMotoboyId}
                  onChange={setSelectedMotoboyId}
                  options={motoboyOptions}
                  placeholder="Selecione o motoboy"
                  buttonStyle={inputDateStyle}
                  wrapperStyle={{ minWidth: 210, maxWidth: 280 }}
                  disabled={addingGlobal || motoboyOptions.length < 1}
                />
              </div>
              <div style={miniFieldStyle}>
                <span style={miniFieldLabelStyle}>Forma de pagamento</span>
                <SelectField
                  value={paymentModeGlobal}
                  onChange={setPaymentModeGlobal}
                  options={PAGAMENTO_ENTREGA_OPTIONS}
                  buttonStyle={inputDateStyle}
                  wrapperStyle={{ minWidth: 190, maxWidth: 230 }}
                  disabled={addingGlobal}
                />
              </div>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={useCustomWhenGlobal}
                  onChange={(event) => setUseCustomWhenGlobal(event.target.checked)}
                />
                <span>Definir data/hora manual</span>
              </label>
              {useCustomWhenGlobal ? (
                <>
                  <input
                    type="date"
                    value={whenDateGlobal}
                    onChange={(event) => setWhenDateGlobal(event.target.value)}
                    style={inputDateStyle}
                  />
                  <input
                    type="time"
                    value={whenTimeGlobal}
                    onChange={(event) => setWhenTimeGlobal(event.target.value)}
                    style={inputDateStyle}
                  />
                </>
              ) : null}
              <button
                type="button"
                style={primaryMiniButtonStyle(addingGlobal || motoboyOptions.length < 1)}
                onClick={adicionarPedidosGlobal}
                disabled={addingGlobal || motoboyOptions.length < 1}
              >
                {addingGlobal ? "Adicionando..." : "Adicionar varios pedidos ao motoboy"}
              </button>
            </div>
          </div>
        ) : null}

        {onlineTab === "pedidos" && podeGerirEntregas ? (
          <div style={centralAddBoxStyle}>
            <div style={titleRowStyle}>
              <strong style={{ fontFamily: "var(--font-heading)" }}>Pedidos pendentes (antes do motoboy)</strong>
              <span style={kpiTagStyle}>{inteiro(pendentesAtivosFiltrados.length)}</span>
            </div>
            <div style={integracaoHelpTextStyle}>
              Os pedidos de integracao entram aqui primeiro. Depois, voce envia para um motoboy.
            </div>
            <div style={rowWrapStyle}>
              <div style={miniFieldStyle}>
                <span style={miniFieldLabelStyle}>Motoboy para envio</span>
                <SelectField
                  value={selectedMotoboyId}
                  onChange={setSelectedMotoboyId}
                  options={motoboyOptions}
                  placeholder="Selecione o motoboy"
                  buttonStyle={inputDateStyle}
                  wrapperStyle={{ minWidth: 210, maxWidth: 280 }}
                  disabled={motoboyOptions.length < 1}
                />
              </div>
              {motoboyOptions.length < 1 ? (
                <span style={integracaoHelpTextStyle}>Cadastre um motoboy na sub-aba Motoboy para enviar os pedidos.</span>
              ) : null}
            </div>
            <div style={rowWrapStyle}>
              <button
                type="button"
                style={neutralMiniButtonStyle(processandoPendentesLote || pendentesFiltradosIds.length < 1)}
                onClick={alternarSelecionarTodosPendentes}
                disabled={processandoPendentesLote || pendentesFiltradosIds.length < 1}
              >
                {todosPendentesSelecionados ? "Limpar selecao" : "Selecionar todos do filtro"}
              </button>
              <button
                type="button"
                style={primaryMiniButtonStyle(
                  processandoPendentesLote ||
                    pendentesSelecionados.length < 1 ||
                    !selectedMotoboyId ||
                    motoboyOptions.length < 1
                )}
                onClick={() => enviarPendentesParaMotoboyPorIds(pendentesSelecionados)}
                disabled={
                  processandoPendentesLote ||
                  pendentesSelecionados.length < 1 ||
                  !selectedMotoboyId ||
                  motoboyOptions.length < 1
                }
              >
                {processandoPendentesLote
                  ? "Enviando em lote..."
                  : `Enviar selecionados (${inteiro(pendentesSelecionados.length)})`}
              </button>
              <button
                type="button"
                style={primaryMiniButtonStyle(
                  processandoPendentesLote || pendentesFiltradosIds.length < 1 || !selectedMotoboyId || motoboyOptions.length < 1
                )}
                onClick={() => enviarPendentesParaMotoboyPorIds(pendentesFiltradosIds)}
                disabled={
                  processandoPendentesLote ||
                  pendentesFiltradosIds.length < 1 ||
                  !selectedMotoboyId ||
                  motoboyOptions.length < 1
                }
              >
                {processandoPendentesLote
                  ? "Enviando em lote..."
                  : `Enviar TODOS do filtro (${inteiro(pendentesFiltradosIds.length)})`}
              </button>
            </div>
            {pendentesAtivosFiltrados.length < 1 ? (
              <div style={{ color: "#9cb0e8", fontSize: 13 }}>Nenhum pedido pendente ativo no filtro atual.</div>
            ) : (
              <div style={listStyle}>
                {pendentesAtivosFiltrados.map((pedido) => {
                  const actionKeyAtribuir = `atr:${pedido.id}`;
                  const actionKeyRemover = `del:${pedido.id}`;
                  const pedidoId = Number(pedido?.id || 0);
                  const selecionado = pendentesSelecionados.includes(pedidoId);
                  return (
                    <article key={`pendente-${pedido.id}`} style={pedidoItemStyle}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <label style={checkboxLabelStyle}>
                          <input
                            type="checkbox"
                            checked={selecionado}
                            onChange={() => alternarSelecionarPendente(pedidoId)}
                            disabled={processandoPendentesLote}
                          />
                        </label>
                        <div style={{ display: "grid", gap: 2 }}>
                        <strong style={{ fontSize: 18, color: "#ffd27b" }}>#{pedido.numero}</strong>
                        <span style={{ fontSize: 12, color: "#9cb0e8" }}>{formatDateTimePtBr(pedido.dataISO)}</span>
                        <PedidoResumoBadges pedido={pedido} />
                        {pedido?.resumoVisual?.clienteNome ? (
                          <span style={{ fontSize: 12, color: "#9cb0e8" }}>
                            Cliente: {pedido.resumoVisual.clienteNome}
                            {pedido?.resumoVisual?.clienteDocumento ? ` (${pedido.resumoVisual.clienteDocumento})` : ""}
                          </span>
                        ) : null}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={sourceTagStyle}>{nomeOrigem(pedido.source)}</span>
                          <span style={paymentTagStyle}>{nomePagamentoEntrega(pedido.payment)}</span>
                        </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          style={primaryMiniButtonStyle(
                            pedidoPendenteEmAcao === actionKeyAtribuir ||
                              processandoPendentesLote ||
                              !selectedMotoboyId ||
                              !podeGerirEntregas
                          )}
                          onClick={() => enviarPendenteParaMotoboy(pedido)}
                          disabled={
                            pedidoPendenteEmAcao === actionKeyAtribuir ||
                            processandoPendentesLote ||
                            !selectedMotoboyId ||
                            !podeGerirEntregas
                          }
                        >
                          {pedidoPendenteEmAcao === actionKeyAtribuir ? "Enviando..." : "Enviar para motoboy"}
                        </button>
                        <button
                          type="button"
                          style={neutralMiniButtonStyle(processandoPendentesLote)}
                          onClick={() => setPedidoPendenteDetalhes(pedido)}
                          disabled={processandoPendentesLote}
                        >
                          Detalhes
                        </button>
                        <button
                          type="button"
                          style={dangerMiniButtonStyle(
                            pedidoPendenteEmAcao === actionKeyRemover || processandoPendentesLote || !podeGerirEntregas
                          )}
                          onClick={() => removerPedidoPendente(pedido)}
                          disabled={pedidoPendenteEmAcao === actionKeyRemover || processandoPendentesLote || !podeGerirEntregas}
                        >
                          {pedidoPendenteEmAcao === actionKeyRemover ? "Removendo..." : "Remover"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <div style={{ ...titleRowStyle, marginTop: 10 }}>
              <strong style={{ fontFamily: "var(--font-heading)" }}>Cancelados (sem motoboy)</strong>
              <span style={dangerTagStyle}>{inteiro(pendentesCanceladosFiltrados.length)}</span>
            </div>
            <div style={integracaoHelpTextStyle}>
              Pedidos cancelados ficam separados para conferencia e nao entram no envio para motoboy.
            </div>
            {pendentesCanceladosFiltrados.length < 1 ? (
              <div style={{ color: "#9cb0e8", fontSize: 13 }}>Nenhum pedido cancelado no filtro atual.</div>
            ) : (
              <div style={listStyle}>
                {pendentesCanceladosFiltrados.map((pedido) => {
                  const actionKeyRemover = `del:${pedido.id}`;
                  return (
                    <article
                      key={`pendente-cancelado-${pedido.id}`}
                      style={{ ...pedidoItemStyle, border: "1px solid #8b4b58", background: "#301a24" }}
                    >
                      <div style={{ display: "grid", gap: 2 }}>
                        <strong style={{ fontSize: 18, color: "#ffd27b" }}>#{pedido.numero}</strong>
                        <span style={{ fontSize: 12, color: "#9cb0e8" }}>{formatDateTimePtBr(pedido.dataISO)}</span>
                        <PedidoResumoBadges pedido={pedido} />
                        {pedido?.resumoVisual?.clienteNome ? (
                          <span style={{ fontSize: 12, color: "#9cb0e8" }}>
                            Cliente: {pedido.resumoVisual.clienteNome}
                            {pedido?.resumoVisual?.clienteDocumento ? ` (${pedido.resumoVisual.clienteDocumento})` : ""}
                          </span>
                        ) : null}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={sourceTagStyle}>{nomeOrigem(pedido.source)}</span>
                          <span style={paymentTagStyle}>{nomePagamentoEntrega(pedido.payment)}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          style={neutralMiniButtonStyle(processandoPendentesLote)}
                          onClick={() => setPedidoPendenteDetalhes(pedido)}
                          disabled={processandoPendentesLote}
                        >
                          Detalhes
                        </button>
                        <button
                          type="button"
                          style={dangerMiniButtonStyle(
                            pedidoPendenteEmAcao === actionKeyRemover || processandoPendentesLote || !podeGerirEntregas
                          )}
                          onClick={() => removerPedidoPendente(pedido)}
                          disabled={pedidoPendenteEmAcao === actionKeyRemover || processandoPendentesLote || !podeGerirEntregas}
                        >
                          {pedidoPendenteEmAcao === actionKeyRemover ? "Removendo..." : "Remover"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {feedback ? (
        <div style={feedbackStyle(feedback.type)}>
          {feedback.text}
        </div>
      ) : null}

      {erro ? <div style={feedbackStyle("error")}>{erro}</div> : null}

      {onlineTab === "motoboy" ? (
        listaFiltrada.length < 1 ? (
          <div style={emptyStyle}>
            Nenhum motoboy encontrado para o filtro atual.
          </div>
        ) : (
          <div style={cardsGridStyle}>
            {listaFiltrada.map((motoboy) => (
              <MotoboyCard
                key={motoboy.id}
                motoboy={motoboy}
                fromDate={fromDate}
                fromTime={fromTime}
                toDate={toDate}
                toTime={toTime}
                podeGerir={podeGerirEntregas}
                onRefresh={carregarDados}
                onFeedback={onFeedback}
              />
            ))}
          </div>
        )
      ) : null}

      <PedidoDetalhesDialog
        pedido={pedidoPendenteDetalhes}
        open={Boolean(pedidoPendenteDetalhes)}
        onClose={() => setPedidoPendenteDetalhes(null)}
      />
    </div>
  );
}

const headerCardStyle = {
  border: "1px solid #2d3352",
  borderRadius: 16,
  background: "#151a31",
  padding: 14,
  display: "grid",
  gap: 10
};

const titleRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap"
};

const gridStatsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 8
};

const statCardStyle = {
  border: "1px solid #2e375a",
  borderRadius: 12,
  background: "#12182f",
  padding: "10px 12px",
  display: "grid",
  gap: 4
};

const statLabelStyle = {
  color: "#9fb0e3",
  fontSize: 12
};

const statValueStyle = {
  fontSize: 22,
  fontWeight: 800
};

const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 8,
  alignItems: "center"
};

const filterPanelStyle = {
  border: "1px solid #2b335c",
  borderRadius: 12,
  background: "#111831",
  padding: 10
};

const onlineTabsShellStyle = {
  border: "1px solid #2c3763",
  borderRadius: 12,
  background: "#101733",
  padding: 10,
  display: "grid",
  gap: 8
};

const onlineTabsWrapStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center"
};

function onlineTabButtonStyle(active) {
  return {
    minHeight: 40,
    borderRadius: 10,
    border: active ? "1px solid #5f95ff" : "1px solid #3f4b76",
    background: active
      ? "linear-gradient(120deg, #2e63f4 0%, #4b7dff 100%)"
      : "linear-gradient(120deg, #181f3f 0%, #101733 100%)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
    padding: "0 12px",
    display: "inline-flex",
    gap: 8,
    alignItems: "center"
  };
}

function onlineTabCountStyle(active) {
  return {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    border: active ? "1px solid rgba(255,255,255,0.44)" : "1px solid #3f4b76",
    background: active ? "rgba(255,255,255,0.18)" : "#1b2242",
    display: "grid",
    placeItems: "center",
    padding: "0 6px",
    fontSize: 12,
    fontWeight: 800
  };
}

const createRowStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8
};

const inputStyle = {
  minHeight: 40,
  border: "1px solid #3b4263",
  background: "#121427",
  borderRadius: 10,
  color: "#fff",
  padding: "0 12px",
  boxSizing: "border-box",
  width: "100%"
};

const inputDateStyle = {
  minHeight: 40,
  border: "1px solid #3b4263",
  background: "#121427",
  borderRadius: 10,
  color: "#fff",
  padding: "0 10px",
  boxSizing: "border-box",
  width: "100%"
};

const cardsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
  alignItems: "start"
};

const cardStyle = {
  border: "1px solid #2d3352",
  borderRadius: 16,
  background: "#151a31",
  padding: 12,
  display: "grid",
  gap: 10,
  alignContent: "start"
};

const cardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap"
};

const kpiWrapStyle = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap"
};

const kpiTagStyle = {
  border: "1px solid #3c4d87",
  borderRadius: 999,
  background: "#1d2646",
  color: "#bdd0ff",
  fontSize: 12,
  padding: "4px 8px"
};

const centralAddBoxStyle = {
  border: "1px solid #2f3a67",
  borderRadius: 12,
  background: "#10172f",
  padding: 10,
  display: "grid",
  gap: 8
};

const textAreaStyle = {
  minHeight: 74,
  border: "1px solid #3b4263",
  background: "#121427",
  borderRadius: 10,
  color: "#fff",
  padding: "10px 12px",
  resize: "vertical",
  fontFamily: "var(--font-body)"
};

const rowWrapStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap"
};

const integracoesPanelStyle = {
  border: "1px solid #2f3a67",
  borderRadius: 12,
  background: "#10172f",
  padding: 10,
  display: "grid",
  gap: 10
};

const integracoesGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 10
};

const integracaoCardStyle = {
  border: "1px solid #2f3b66",
  borderRadius: 12,
  background: "#0f162d",
  padding: 10,
  display: "grid",
  gap: 8
};

const integracaoTitleRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8
};

function integracaoStatusPillStyle(connected) {
  return {
    border: `1px solid ${connected ? "#2d8762" : "#7c4362"}`,
    borderRadius: 999,
    background: connected ? "#154834" : "#4a2234",
    color: connected ? "#d8ffea" : "#ffe4ee",
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 10px"
  };
}

const integracaoSimpleFieldsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 8
};

const integracaoFieldsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8
};

const integracaoAdvancedBoxStyle = {
  border: "1px dashed #3b4a7d",
  borderRadius: 10,
  background: "#121a34",
  padding: 9
};

const integracaoActionRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center"
};

const integracaoLastSyncStyle = {
  border: "1px solid #31416f",
  borderRadius: 10,
  background: "#13203f",
  color: "#d7e2ff",
  padding: "8px 10px",
  fontSize: 12,
  display: "grid",
  gap: 3
};

const integracaoHelpTextStyle = {
  color: "#9db1e8",
  fontSize: 12
};

const integracaoQuickStatusStyle = {
  border: "1px solid #385285",
  borderRadius: 10,
  background: "#14203d",
  padding: "8px 10px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap"
};

const integracaoSubTitleStyle = {
  fontFamily: "var(--font-heading)",
  fontSize: 15,
  color: "#dbe6ff"
};

const integracaoToggleRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 8
};

const integracaoStatusPanelStyle = {
  border: "1px solid #34518f",
  borderRadius: 10,
  background: "#152141",
  padding: "8px 9px",
  marginTop: 8,
  display: "grid",
  gap: 8
};

const integracaoStatusHeadlineStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  color: "#d8e6ff",
  fontSize: 12,
  fontWeight: 700
};

const integracaoChecklistGridStyle = {
  display: "grid",
  gap: 6
};

function checklistPillStyle(ok) {
  return {
    border: `1px solid ${ok ? "#2f8a66" : "#a85b4f"}`,
    borderRadius: 999,
    background: ok ? "#184434" : "#45241f",
    color: ok ? "#ddffee" : "#ffe2db",
    fontSize: 11,
    fontWeight: 700,
    padding: "4px 8px",
    display: "inline-flex",
    width: "fit-content"
  };
}

const integracaoEventsPanelStyle = {
  border: "1px solid #2f3f6d",
  borderRadius: 10,
  background: "#101a34",
  padding: 8,
  marginTop: 8,
  display: "grid",
  gap: 6,
  maxHeight: 210,
  overflow: "auto"
};

const integracaoEventItemStyle = {
  border: "1px solid #2f3a67",
  borderRadius: 8,
  background: "#141e3b",
  padding: "7px 8px",
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap"
};

const miniFieldStyle = {
  display: "grid",
  gap: 4,
  minWidth: 190
};

const miniFieldLabelStyle = {
  color: "#9cb0e8",
  fontSize: 12
};

const checkboxLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "#c8d4ff",
  fontSize: 13
};

const listStyle = {
  border: "1px solid #2f3763",
  borderRadius: 12,
  background: "#0f152b",
  padding: 8,
  display: "grid",
  gap: 8,
  maxHeight: 320,
  overflow: "auto"
};

const pedidoItemStyle = {
  border: "1px solid #2d3352",
  borderRadius: 10,
  background: "#151d38",
  padding: "9px 10px",
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap"
};

const sourceTagStyle = {
  border: "1px solid #43579c",
  borderRadius: 999,
  background: "#1c2750",
  color: "#c8d6ff",
  fontSize: 12,
  padding: "4px 8px"
};

const paymentTagStyle = {
  border: "1px solid #2f6f58",
  borderRadius: 999,
  background: "#153327",
  color: "#d4ffe9",
  fontSize: 12,
  padding: "4px 8px"
};

const statusTagStyle = {
  border: "1px solid #5d74ba",
  borderRadius: 999,
  background: "#203463",
  color: "#e0eaff",
  fontSize: 11,
  fontWeight: 700,
  padding: "3px 8px"
};

const metaTagStyle = {
  border: "1px solid #445289",
  borderRadius: 999,
  background: "#1a2348",
  color: "#ccdafd",
  fontSize: 11,
  padding: "3px 8px"
};

const dangerTagStyle = {
  border: "1px solid #9f5661",
  borderRadius: 999,
  background: "#502530",
  color: "#ffe6eb",
  fontSize: 11,
  fontWeight: 700,
  padding: "3px 8px"
};

const pedidoDetalhesOverlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 1300,
  background: "rgba(4,8,20,0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16
};

const pedidoDetalhesCardStyle = {
  width: "min(920px, 96vw)",
  maxHeight: "90vh",
  overflow: "auto",
  border: "1px solid #37497a",
  borderRadius: 16,
  background: "#111b36",
  padding: 14,
  display: "grid",
  gap: 10
};

const pedidoDetalhesGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8
};

const pedidoDetalhesFieldStyle = {
  border: "1px solid #2f3d6b",
  borderRadius: 10,
  background: "#162247",
  padding: "8px 10px",
  display: "grid",
  gap: 2
};

const pedidoDetalhesLabelStyle = {
  color: "#9fb2ea",
  fontSize: 12
};

const pedidoDetalhesTextareaStyle = {
  width: "100%",
  minHeight: 210,
  border: "1px solid #3b4c83",
  borderRadius: 10,
  background: "#0f1731",
  color: "#e6edff",
  padding: 10,
  fontFamily: "Consolas, 'Courier New', monospace",
  fontSize: 12,
  resize: "vertical"
};

function feedbackStyle(type = "info") {
  const map = {
    success: {
      background: "#133a2a",
      border: "#1d8f62",
      color: "#d8ffea"
    },
    warning: {
      background: "#423214",
      border: "#c58e2c",
      color: "#ffeab9"
    },
    error: {
      background: "#481a22",
      border: "#bb4759",
      color: "#ffe4e9"
    },
    info: {
      background: "#162642",
      border: "#3d62a7",
      color: "#d8e6ff"
    }
  };

  const palette = map[type] || map.info;
  return {
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
    borderRadius: 12,
    padding: "10px 12px"
  };
}

const emptyStyle = {
  border: "1px dashed #324170",
  borderRadius: 16,
  background: "#121a32",
  padding: "16px 14px",
  color: "#b7c6f1"
};

function neutralMiniButtonStyle(disabled) {
  return {
    minHeight: 38,
    border: "1px solid #3d4770",
    borderRadius: 10,
    background: disabled ? "#252a44" : "#1b213c",
    color: "#d7def9",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "0 12px"
  };
}

function primaryMiniButtonStyle(disabled) {
  return {
    minHeight: 38,
    border: "none",
    borderRadius: 10,
    background: disabled ? "#596288" : "#2e63f4",
    color: "#fff",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "0 12px"
  };
}

function dangerMiniButtonStyle(disabled) {
  return {
    minHeight: 34,
    border: "1px solid #92495f",
    borderRadius: 10,
    background: disabled ? "#563645" : "#6b2536",
    color: "#ffe8ee",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "0 12px"
  };
}
