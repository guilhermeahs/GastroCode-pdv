import nacl from "tweetnacl";
import { fromByteArray, toByteArray } from "base64-js";
import { sha256 } from "js-sha256";

const PKCS8_ED25519_MARKER = Uint8Array.from([0x04, 0x20]);
const SPKI_ED25519_PREFIX_HEX = "302a300506032b6570032100";
const textEncoder =
  typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

function utf8ToBytes(value) {
  const text = String(value || "");
  if (textEncoder) {
    return textEncoder.encode(text);
  }
  // Fallback para runtimes sem TextEncoder (alguns Android/Hermes em release).
  const encoded = encodeURIComponent(text);
  const out = [];
  for (let i = 0; i < encoded.length; i += 1) {
    const ch = encoded[i];
    if (ch === "%") {
      out.push(Number.parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(ch.charCodeAt(0));
    }
  }
  return Uint8Array.from(out);
}

function hexToBytes(hex) {
  const clean = String(hex || "").trim().toLowerCase();
  if (!clean || clean.length % 2 !== 0) {
    throw new Error("Hex invalido.");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

function normalizePem(pem) {
  return String(pem || "")
    .replace(/^\uFEFF/, "")
    .trim();
}

function base64ToBytes(base64) {
  const normalized = String(base64 || "").replace(/\s+/g, "");
  return toByteArray(normalized);
}

function bytesToBase64Url(bytes) {
  return fromByteArray(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function utf8ToBase64Url(text) {
  return bytesToBase64Url(utf8ToBytes(text));
}

function buildPemBlock(header, bytes) {
  const base64 = fromByteArray(bytes);
  const chunked = base64.match(/.{1,64}/g)?.join("\n") || base64;
  return `-----BEGIN ${header}-----\n${chunked}\n-----END ${header}-----`;
}

export function parsePkcs8Ed25519Seed(privatePem) {
  const pem = normalizePem(privatePem);
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");

  if (!base64) {
    throw new Error("Chave privada vazia.");
  }

  let der;
  try {
    der = base64ToBytes(base64);
  } catch {
    throw new Error("Chave privada invalida. Cole o PEM completo.");
  }

  for (let i = 0; i < der.length - 33; i += 1) {
    if (der[i] === PKCS8_ED25519_MARKER[0] && der[i + 1] === PKCS8_ED25519_MARKER[1]) {
      const seed = der.slice(i + 2, i + 34);
      if (seed.length === 32) {
        return seed;
      }
    }
  }

  throw new Error("Formato nao suportado. Use chave PKCS8 Ed25519.");
}

export function publicKeyPemFromPrivatePem(privatePem) {
  const seed = parsePkcs8Ed25519Seed(privatePem);
  const keyPair = nacl.sign.keyPair.fromSeed(seed);
  const prefix = hexToBytes(SPKI_ED25519_PREFIX_HEX);
  const der = new Uint8Array(prefix.length + keyPair.publicKey.length);
  der.set(prefix, 0);
  der.set(keyPair.publicKey, prefix.length);
  return buildPemBlock("PUBLIC KEY", der);
}

export function publicFingerprintFromPrivatePem(privatePem) {
  const publicPem = publicKeyPemFromPrivatePem(privatePem).replace(/\r\n/g, "\n").trim();
  return sha256(publicPem).slice(0, 16).toUpperCase();
}

export function normalizeDeviceId(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

export function generateLicenseId() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const rnd = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `LIC-${stamp}-${rnd}`;
}

export function buildLicensePayload(input) {
  const customer = String(input?.customer || "").trim();
  const deviceId = normalizeDeviceId(input?.device_id);
  const plan = String(input?.plan || "MENSAL").trim().toUpperCase();
  const days = Math.max(0, Number(input?.days || 0));
  const offlineDays = Math.max(1, Math.min(45, Number(input?.offline_days || 7) || 7));

  if (!customer) {
    throw new Error("Informe o nome do cliente.");
  }
  if (!/^PDV-[A-Z0-9]{8,32}$/.test(deviceId)) {
    throw new Error("Codigo do dispositivo invalido (ex.: PDV-1234ABCD5678EF90).");
  }

  return {
    v: 1,
    license_id: String(input?.license_id || generateLicenseId()).trim().slice(0, 80),
    customer,
    plan,
    device_id: deviceId,
    issued_at: new Date().toISOString(),
    expires_at: days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null,
    offline_days: offlineDays
  };
}

export function signTokenWithPrivatePem(privatePem, payload) {
  const seed = parsePkcs8Ed25519Seed(privatePem);
  const keyPair = nacl.sign.keyPair.fromSeed(seed);
  const payloadEncoded = utf8ToBase64Url(JSON.stringify(payload));
  const signedContent = utf8ToBytes(`HB1.${payloadEncoded}`);
  const signature = nacl.sign.detached(signedContent, keyPair.secretKey);
  const signatureEncoded = bytesToBase64Url(signature);
  return `HB1.${payloadEncoded}.${signatureEncoded}`;
}

export function buildLicenseToken(privatePem, input) {
  const payload = buildLicensePayload(input);
  const token = signTokenWithPrivatePem(privatePem, payload);
  return { token, payload };
}
