const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = String(argv[i] || "");
    if (!item.startsWith("--")) continue;
    const clean = item.slice(2);
    const eqIdx = clean.indexOf("=");
    if (eqIdx >= 0) {
      const key = clean.slice(0, eqIdx);
      const value = clean.slice(eqIdx + 1);
      args[key] = value;
      continue;
    }
    const next = argv[i + 1];
    if (next && !String(next).startsWith("--")) {
      args[clean] = String(next);
      i += 1;
    } else {
      args[clean] = "true";
    }
  }
  return args;
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

function parseToken(tokenInput) {
  const bruto = normalizarTokenTexto(tokenInput);
  const tokenExtraido = (() => {
    const match = bruto.match(/HB1\.[A-Za-z0-9+/_=-]+\.[A-Za-z0-9+/_=-]+/i);
    return match ? match[0] : bruto;
  })();

  if (!tokenExtraido) {
    throw new Error("Token vazio.");
  }

  const partes = tokenExtraido.replace(/^hb1\./i, "HB1.").split(".");
  if (partes.length !== 3 || partes[0] !== "HB1") {
    throw new Error("Formato invalido. Esperado: HB1.payload.assinatura");
  }

  const payloadEncoded = normalizarSegmentoBase64Url(partes[1]);
  const signatureEncoded = normalizarSegmentoBase64Url(partes[2]);
  if (!payloadEncoded || !signatureEncoded) {
    throw new Error("Token corrompido (segmentos invalidos).");
  }

  const token = `HB1.${payloadEncoded}.${signatureEncoded}`;
  const payload = JSON.parse(base64UrlDecode(payloadEncoded).toString("utf8"));
  return { token, payload, payloadEncoded, signatureEncoded };
}

function verifyAny(publicKeyPem, payloadEncoded, signatureEncoded) {
  const assinatura = base64UrlDecode(signatureEncoded);
  const conteudo = Buffer.from(`HB1.${payloadEncoded}`, "utf8");
  const algos = [null, "sha256", "RSA-SHA256"];
  for (const algo of algos) {
    try {
      if (crypto.verify(algo, conteudo, publicKeyPem, assinatura)) {
        return { ok: true, algorithm: algo === null ? "null(ed25519)" : algo };
      }
    } catch {}
  }
  return { ok: false, algorithm: "" };
}

function fingerprintPem(pemText) {
  return crypto
    .createHash("sha256")
    .update(String(pemText || "").replace(/\r\n/g, "\n").trim(), "utf8")
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(__dirname, "..", "..");
  const tokenArg = String(args.token || "").trim();
  const tokenPath = String(args["token-file"] || "").trim();
  const publicPath = path.resolve(
    projectRoot,
    String(args.public || "backend/src/config/license-public.pem")
  );

  let token = tokenArg;
  if (!token && tokenPath) {
    token = fs.readFileSync(path.resolve(projectRoot, tokenPath), "utf8");
  }

  if (!token) {
    console.error("Informe --token=\"HB1...\" ou --token-file=arquivo.txt");
    process.exit(1);
  }

  if (!fs.existsSync(publicPath)) {
    console.error(`Chave publica nao encontrada: ${publicPath}`);
    process.exit(1);
  }

  const parsed = parseToken(token);
  const publicKeyPem = fs.readFileSync(publicPath, "utf8");
  const verified = verifyAny(publicKeyPem, parsed.payloadEncoded, parsed.signatureEncoded);

  console.log("Public key:", publicPath);
  console.log("Fingerprint:", fingerprintPem(publicKeyPem));
  console.log("Assinatura valida:", verified.ok ? "SIM" : "NAO");
  if (verified.ok) {
    console.log("Algoritmo aceito:", verified.algorithm);
  }
  console.log("Payload:");
  console.log(JSON.stringify(parsed.payload, null, 2));
}

main();
