const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const db = require("../config/db");

const PUBLIC_KEY_PATH_DEFAULT = path.join(__dirname, "..", "config", "license-public.pem");

const selectLicencaStmt = db.prepare(`
  SELECT
    id,
    status,
    plano,
    chave_hash,
    chave_mascara,
    dispositivo_id,
    dispositivo_nome,
    ativada_em,
    expira_em,
    ultima_validacao_em,
    offline_tolerancia_dias,
    observacao,
    updated_at
  FROM licenca_ativacao
  WHERE id = 1
  LIMIT 1
`);

const upsertLicencaStmt = db.prepare(`
  INSERT INTO licenca_ativacao (
    id,
    status,
    plano,
    chave_hash,
    chave_mascara,
    dispositivo_id,
    dispositivo_nome,
    ativada_em,
    expira_em,
    ultima_validacao_em,
    offline_tolerancia_dias,
    observacao,
    updated_at
  )
  VALUES (
    1,
    @status,
    @plano,
    @chave_hash,
    @chave_mascara,
    @dispositivo_id,
    @dispositivo_nome,
    @ativada_em,
    @expira_em,
    @ultima_validacao_em,
    @offline_tolerancia_dias,
    @observacao,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT(id) DO UPDATE SET
    status = excluded.status,
    plano = excluded.plano,
    chave_hash = excluded.chave_hash,
    chave_mascara = excluded.chave_mascara,
    dispositivo_id = excluded.dispositivo_id,
    dispositivo_nome = excluded.dispositivo_nome,
    ativada_em = excluded.ativada_em,
    expira_em = excluded.expira_em,
    ultima_validacao_em = excluded.ultima_validacao_em,
    offline_tolerancia_dias = excluded.offline_tolerancia_dias,
    observacao = excluded.observacao,
    updated_at = CURRENT_TIMESTAMP
`);

const updateLicencaStatusStmt = db.prepare(`
  UPDATE licenca_ativacao
  SET status = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = 1
`);

const updateUltimaValidacaoStmt = db.prepare(`
  UPDATE licenca_ativacao
  SET ultima_validacao_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
  WHERE id = 1
`);

const bloquearLicencaStmt = db.prepare(`
  UPDATE licenca_ativacao
  SET status = 'BLOQUEADA',
      observacao = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = 1
`);

function sanitizeText(value, max = 180) {
  return String(value || "")
    .trim()
    .slice(0, max);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function toIsoOrNull(dateInput) {
  if (!dateInput) return null;
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function calcularDiasRestantes(expiraEm) {
  const iso = toIsoOrNull(expiraEm);
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

function base64UrlDecode(value) {
  const txt = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = txt.length % 4 ? "=".repeat(4 - (txt.length % 4)) : "";
  return Buffer.from(`${txt}${pad}`, "base64");
}

function normalizarTokenTexto(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFKC")
    .replace(/[“”‘’"'`]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, "");
}

function normalizarSegmentoBase64Url(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[^A-Za-z0-9+/_=-]/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function extrairIdentidadeDispositivo() {
  const cpu = Array.isArray(os.cpus()) && os.cpus().length > 0 ? os.cpus()[0] : null;
  const cpuModel = sanitizeText(cpu?.model || "cpu", 120);
  const nets = os.networkInterfaces();

  const macs = Object.values(nets || {})
    .flat()
    .filter((item) => item && !item.internal && item.mac && item.mac !== "00:00:00:00:00:00")
    .map((item) => item.mac)
    .sort();

  const origem = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.release(),
    cpuModel,
    macs.join("|")
  ].join("::");

  const codigo = `PDV-${sha256(origem).slice(0, 16).toUpperCase()}`;
  const nome = `${os.hostname()} (${os.platform()}-${os.arch()})`;
  return { codigo, nome };
}

function carregarPublicKey() {
  const customPath = sanitizeText(process.env.APPGESTAO_LICENSE_PUBLIC_KEY_PATH, 360);
  const publicKeyPath = customPath || PUBLIC_KEY_PATH_DEFAULT;

  if (!fs.existsSync(publicKeyPath)) {
    const error = new Error(
      `Chave publica de licenca nao encontrada. Gere em: ${publicKeyPath}`
    );
    error.statusCode = 500;
    throw error;
  }

  return fs.readFileSync(publicKeyPath, "utf-8").replace(/^\uFEFF/, "").trim();
}

function parseToken(tokenInput) {
  const bruto = normalizarTokenTexto(tokenInput);
  const tokenExtraido = (() => {
    const match = bruto.match(/HB1\.[A-Za-z0-9+/_=-]+\.[A-Za-z0-9+/_=-]+/i);
    return match ? match[0] : bruto;
  })();

  const tokenRaw = sanitizeText(tokenExtraido, 2200);
  if (!tokenRaw) {
    const error = new Error("Informe o token de licenca.");
    error.statusCode = 400;
    throw error;
  }

  const partes = tokenRaw.replace(/^hb1\./i, "HB1.").split(".");
  if (partes.length !== 3 || partes[0] !== "HB1") {
    const error = new Error("Token invalido. Formato esperado: HB1.payload.assinatura");
    error.statusCode = 400;
    throw error;
  }

  const payloadEncoded = normalizarSegmentoBase64Url(partes[1]);
  const signatureEncoded = normalizarSegmentoBase64Url(partes[2]);
  if (!payloadEncoded || !signatureEncoded) {
    const error = new Error("Token invalido. Conteudo corrompido.");
    error.statusCode = 400;
    throw error;
  }

  const token = `HB1.${payloadEncoded}.${signatureEncoded}`;

  let payload = null;
  try {
    payload = JSON.parse(base64UrlDecode(payloadEncoded).toString("utf8"));
  } catch {
    const error = new Error("Token invalido. Payload ilegivel.");
    error.statusCode = 400;
    throw error;
  }

  return {
    token,
    header: partes[0],
    payloadEncoded,
    signatureEncoded,
    payload
  };
}

function verificarAssinaturaComAlgoritmos(signedContent, publicKey, signature) {
  const algoritmos = [null, "sha256", "RSA-SHA256"];
  for (const algoritmo of algoritmos) {
    try {
      if (crypto.verify(algoritmo, signedContent, publicKey, signature)) {
        return true;
      }
    } catch {}
  }
  return false;
}

function fingerprintPublicKey(publicKey) {
  return sha256(String(publicKey || "").replace(/\r\n/g, "\n").trim()).slice(0, 16).toUpperCase();
}

function validarAssinatura(parsedToken, publicKey = null) {
  const pubKey = publicKey || carregarPublicKey();
  const signedContent = Buffer.from(`${parsedToken.header}.${parsedToken.payloadEncoded}`, "utf8");
  const signature = base64UrlDecode(parsedToken.signatureEncoded);
  return verificarAssinaturaComAlgoritmos(signedContent, pubKey, signature);
}

function validarPayload(payload, deviceCode) {
  if (!payload || typeof payload !== "object") {
    const error = new Error("Licenca invalida. Conteudo ausente.");
    error.statusCode = 400;
    throw error;
  }

  const licenseId = sanitizeText(payload.license_id || payload.id, 80);
  const plano = sanitizeText(payload.plan || payload.plano, 32) || "BASICO";
  const customer = sanitizeText(payload.customer || payload.cliente, 120);
  const deviceTarget = sanitizeText(payload.device_id || "", 40);
  const issuedAt = toIsoOrNull(payload.issued_at || payload.emitida_em || new Date().toISOString());
  const expiresAt = toIsoOrNull(payload.expires_at || payload.expira_em || null);
  const offlineDays = Math.max(1, Math.min(45, Number(payload.offline_days || 7) || 7));

  if (!licenseId) {
    const error = new Error("Licenca invalida: identificador ausente.");
    error.statusCode = 400;
    throw error;
  }

  if (!issuedAt) {
    const error = new Error("Licenca invalida: data de emissao ausente.");
    error.statusCode = 400;
    throw error;
  }

  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    const error = new Error("Licenca expirada.");
    error.statusCode = 402;
    error.code = "LICENCA_EXPIRADA";
    throw error;
  }

  if (deviceTarget && deviceTarget !== deviceCode) {
    const error = new Error("Licenca emitida para outro dispositivo.");
    error.statusCode = 409;
    error.code = "LICENCA_OUTRO_DISPOSITIVO";
    throw error;
  }

  return {
    license_id: licenseId,
    plano,
    customer,
    device_id: deviceTarget || deviceCode,
    issued_at: issuedAt,
    expires_at: expiresAt,
    offline_days: offlineDays
  };
}

function mascararToken(token) {
  const txt = sanitizeText(token, 2200);
  if (txt.length <= 12) return txt;
  return `${txt.slice(0, 6)}...${txt.slice(-6)}`;
}

function montarPayload(row) {
  const deviceInfo = extrairIdentidadeDispositivo();
  const publicKeyFingerprint = (() => {
    try {
      return fingerprintPublicKey(carregarPublicKey());
    } catch {
      return "";
    }
  })();

  if (!row) {
    return {
      ativa: false,
      status: "NAO_ATIVADA",
      mensagem: "Licenca nao ativada. Cole o token assinado para liberar o sistema.",
      licenca: null,
      codigo_dispositivo: deviceInfo.codigo,
      dispositivo_nome: deviceInfo.nome,
      chave_publica_fingerprint: publicKeyFingerprint
    };
  }

  const expiraEmIso = toIsoOrNull(row.expira_em);
  const diasRestantes = calcularDiasRestantes(expiraEmIso);
  const observacaoParsed = (() => {
    try {
      const obj = JSON.parse(String(row.observacao || "{}"));
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  })();

  const ativa = row.status === "ATIVA";
  let mensagem = "Licenca ativa.";
  if (row.status === "EXPIRADA") {
    mensagem = "Licenca expirada. Gere e aplique um novo token.";
  } else if (row.status === "BLOQUEADA") {
    mensagem = "Licenca bloqueada.";
  } else if (expiraEmIso && diasRestantes !== null && diasRestantes <= 7) {
    mensagem = `Licenca ativa, expira em ${diasRestantes} dia(s).`;
  }

  return {
    ativa,
    status: row.status,
    mensagem,
    licenca: {
      plano: row.plano,
      chave_mascara: row.chave_mascara,
      dispositivo_id: row.dispositivo_id || "",
      dispositivo_nome: row.dispositivo_nome || "",
      ativada_em: toIsoOrNull(row.ativada_em),
      expira_em: expiraEmIso,
      dias_restantes: diasRestantes,
      offline_tolerancia_dias: Math.max(1, Number(row.offline_tolerancia_dias || 7) || 7),
      ultima_validacao_em: toIsoOrNull(row.ultima_validacao_em),
      observacao: observacaoParsed?.customer
        ? `Cliente: ${sanitizeText(observacaoParsed.customer, 90)}`
        : String(row.observacao || "")
    },
    codigo_dispositivo: deviceInfo.codigo,
    dispositivo_nome: deviceInfo.nome,
    chave_publica_fingerprint: publicKeyFingerprint
  };
}

function carregarStatus() {
  const row = selectLicencaStmt.get();
  if (!row) return montarPayload(null);

  if (row.status === "ATIVA" && row.expira_em) {
    const expira = new Date(row.expira_em).getTime();
    if (Number.isFinite(expira) && expira <= Date.now()) {
      updateLicencaStatusStmt.run("EXPIRADA");
      const atualizado = { ...row, status: "EXPIRADA" };
      return montarPayload(atualizado);
    }
  }

  if (row.status === "ATIVA") {
    updateUltimaValidacaoStmt.run();
    row.ultima_validacao_em = new Date().toISOString();
  }

  return montarPayload(row);
}

function ativarLicenca({ token_licenca, chave }) {
  const incomingToken = token_licenca || chave || "";
  const parsed = parseToken(incomingToken);
  const publicKey = carregarPublicKey();
  const publicKeyFingerprint = fingerprintPublicKey(publicKey);

  if (!validarAssinatura(parsed, publicKey)) {
    const error = new Error(
      `Assinatura da licenca invalida. Verifique se o token foi copiado completo e se a chave publica instalada no PDV corresponde ao emissor (fingerprint: ${publicKeyFingerprint}).`
    );
    error.statusCode = 401;
    throw error;
  }

  const deviceInfo = extrairIdentidadeDispositivo();
  const payloadValido = validarPayload(parsed.payload, deviceInfo.codigo);
  const hashToken = sha256(parsed.token);
  const nowIso = new Date().toISOString();

  upsertLicencaStmt.run({
    status: "ATIVA",
    plano: payloadValido.plano,
    chave_hash: hashToken,
    chave_mascara: mascararToken(parsed.token),
    dispositivo_id: payloadValido.device_id,
    dispositivo_nome: deviceInfo.nome,
    ativada_em: nowIso,
    expira_em: payloadValido.expires_at,
    ultima_validacao_em: nowIso,
    offline_tolerancia_dias: payloadValido.offline_days,
    observacao: JSON.stringify({
      license_id: payloadValido.license_id,
      customer: payloadValido.customer,
      issued_at: payloadValido.issued_at
    })
  });

  return carregarStatus();
}

function bloquearLicenca(motivo) {
  const row = selectLicencaStmt.get();
  if (!row) {
    const error = new Error("Nenhuma licenca ativa para bloquear.");
    error.statusCode = 404;
    throw error;
  }

  bloquearLicencaStmt.run(sanitizeText(motivo, 220) || "Bloqueio manual.");
  return carregarStatus();
}

module.exports = {
  extrairIdentidadeDispositivo,
  carregarStatus,
  ativarLicenca,
  bloquearLicenca
};
