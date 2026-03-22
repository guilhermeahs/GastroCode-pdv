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

function base64UrlEncode(valueBuffer) {
  return Buffer.from(valueBuffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sanitizeText(value, max = 120) {
  return String(value || "")
    .trim()
    .slice(0, max);
}

function gerarLicenseId() {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10).replaceAll("-", "");
  const rnd = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `LIC-${stamp}-${rnd}`;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(__dirname, "..", "..");
  const privatePath = path.resolve(
    projectRoot,
    String(args.private || "licensing/private/license-private.pem")
  );
  const outputJsonlPath = path.resolve(
    projectRoot,
    String(args.out || "licensing/issued/licenses.jsonl")
  );

  const customer = sanitizeText(args.customer || args.cliente, 120);
  const deviceId = sanitizeText(args.device || args.dispositivo, 40);
  const plan = sanitizeText(args.plan || args.plano || "MENSAL", 32).toUpperCase();
  const offlineDays = Math.max(1, Math.min(45, Number(args["offline-days"] || 7) || 7));

  if (!fs.existsSync(privatePath)) {
    console.error(`Chave privada nao encontrada: ${privatePath}`);
    console.error("Rode primeiro: npm run license:init");
    process.exit(1);
  }

  if (!customer) {
    console.error("Informe o cliente: --customer=\"Nome\"");
    process.exit(1);
  }

  if (!deviceId) {
    console.error("Informe o codigo do dispositivo: --device=\"PDV-XXXXXXXXXXXX\"");
    process.exit(1);
  }

  const days = Number(args.days || args.dias || 30);
  const expiresArg = toIsoOrNull(args.expires || args.expira);

  let expiresAt = null;
  if (expiresArg) {
    expiresAt = expiresArg;
  } else if (Number.isFinite(days) && days > 0) {
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  const payload = {
    v: 1,
    license_id: sanitizeText(args.id || gerarLicenseId(), 80),
    customer,
    plan,
    device_id: deviceId,
    issued_at: new Date().toISOString(),
    expires_at: expiresAt,
    offline_days: offlineDays
  };

  const payloadEncoded = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const signedContent = Buffer.from(`HB1.${payloadEncoded}`, "utf8");
  const privateKeyPem = fs.readFileSync(privatePath, "utf8");
  const signature = crypto.sign(null, signedContent, privateKeyPem);
  const signatureEncoded = base64UrlEncode(signature);
  const token = `HB1.${payloadEncoded}.${signatureEncoded}`;

  fs.mkdirSync(path.dirname(outputJsonlPath), { recursive: true });
  fs.appendFileSync(
    outputJsonlPath,
    `${JSON.stringify({
      generated_at: new Date().toISOString(),
      payload,
      token_preview: `${token.slice(0, 22)}...${token.slice(-22)}`
    })}\n`,
    "utf8"
  );

  console.log("Licenca gerada com sucesso.\n");
  console.log("Cliente:", payload.customer);
  console.log("Plano:", payload.plan);
  console.log("Dispositivo:", payload.device_id);
  console.log("Expira em:", payload.expires_at || "sem expiracao");
  console.log("\nTOKEN (entregue ao cliente):\n");
  console.log(token);
}

main();
