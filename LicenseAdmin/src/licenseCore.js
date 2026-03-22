const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

function sanitizeText(value, max = 200) {
  return String(value || "")
    .trim()
    .slice(0, max);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function base64UrlEncode(valueBuffer) {
  return Buffer.from(valueBuffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function hojeYmd() {
  return new Date().toISOString().slice(0, 10).replaceAll("-", "");
}

function gerarLicenseId() {
  const rnd = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `LIC-${hojeYmd()}-${rnd}`;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function fingerprintPem(pemText) {
  return crypto
    .createHash("sha256")
    .update(String(pemText || "").replace(/\r\n/g, "\n").trim(), "utf8")
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
}

function getVaultPaths(userDataPath, projectRoot) {
  const root = path.join(userDataPath, "vault");
  const keysDir = path.join(root, "keys");
  const issuedDir = path.join(root, "issued");
  const privateKeyPath = path.join(keysDir, "license-private.pem");
  const publicKeyPath = path.join(keysDir, "license-public.pem");
  const issuedPath = path.join(issuedDir, "licenses.jsonl");
  const pathProjeto = path.resolve(projectRoot, "..", "backend", "src", "config", "license-public.pem");
  const localAppData = String(process.env.LOCALAPPDATA || "").trim();
  const candidatosInstalado = [
    path.join(localAppData, "Programs", "Gestao de Mesas e Caixa", "resources", "app.asar.unpacked", "backend", "src", "config", "license-public.pem"),
    path.join(localAppData, "Programs", "Hadassa Beer PDV", "resources", "app.asar.unpacked", "backend", "src", "config", "license-public.pem"),
    path.join(localAppData, "Programs", "Gestao de Mesas e Caixa", "resources", "app", "backend", "src", "config", "license-public.pem")
  ].filter(Boolean);

  const defaultPublicTargetPath = [pathProjeto, ...candidatosInstalado].find((item) => {
    try {
      return fs.existsSync(item);
    } catch {
      return false;
    }
  }) || pathProjeto;
  return {
    root,
    keysDir,
    issuedDir,
    privateKeyPath,
    publicKeyPath,
    issuedPath,
    defaultPublicTargetPath
  };
}

function getStatus(paths) {
  ensureDir(paths.keysDir);
  ensureDir(paths.issuedDir);

  let issuedCount = 0;
  if (fileExists(paths.issuedPath)) {
    const raw = fs.readFileSync(paths.issuedPath, "utf8");
    issuedCount = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean).length;
  }

  const publicKeyExists = fileExists(paths.publicKeyPath);
  const publicKeyFingerprint = publicKeyExists
    ? fingerprintPem(fs.readFileSync(paths.publicKeyPath, "utf8"))
    : "";

  return {
    vault_root: paths.root,
    private_key_exists: fileExists(paths.privateKeyPath),
    public_key_exists: publicKeyExists,
    public_key_fingerprint: publicKeyFingerprint,
    private_key_path: paths.privateKeyPath,
    public_key_path: paths.publicKeyPath,
    issued_path: paths.issuedPath,
    issued_count: issuedCount,
    default_public_target_path: paths.defaultPublicTargetPath,
    host: os.hostname(),
    platform: `${os.platform()}-${os.arch()}`
  };
}

function initKeys(paths, passphrase, { force = false } = {}) {
  const txtPass = String(passphrase || "");
  if (txtPass.length < 8) {
    const error = new Error("Use uma senha de no minimo 8 caracteres.");
    error.statusCode = 400;
    throw error;
  }

  ensureDir(paths.keysDir);

  if (!force && (fileExists(paths.privateKeyPath) || fileExists(paths.publicKeyPath))) {
    const error = new Error("Chaves ja existem. Marque 'forcar recriacao' para substituir.");
    error.statusCode = 409;
    throw error;
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

  const privatePem = privateKey.export({
    format: "pem",
    type: "pkcs8",
    cipher: "aes-256-cbc",
    passphrase: txtPass
  });

  const publicPem = publicKey.export({
    format: "pem",
    type: "spki"
  });

  fs.writeFileSync(paths.privateKeyPath, privatePem, { encoding: "utf8", mode: 0o600 });
  fs.writeFileSync(paths.publicKeyPath, publicPem, { encoding: "utf8" });

  return getStatus(paths);
}

function buildPayload(input) {
  const customer = sanitizeText(input.customer, 120);
  const deviceId = sanitizeText(input.device_id, 40).toUpperCase();
  const plan = sanitizeText(input.plan || "MENSAL", 32).toUpperCase();
  const offlineDays = Math.max(1, Math.min(45, Number(input.offline_days || 7) || 7));

  if (!customer) {
    const error = new Error("Informe o nome do cliente.");
    error.statusCode = 400;
    throw error;
  }

  if (!deviceId || !/^PDV-[A-Z0-9]{8,32}$/.test(deviceId)) {
    const error = new Error("Codigo do dispositivo invalido. Ex.: PDV-1234ABCD5678EF90");
    error.statusCode = 400;
    throw error;
  }

  const expiresIsoFromField = toIsoOrNull(input.expires_at);
  const days = Number(input.days || 30);
  let expiresAt = null;

  if (expiresIsoFromField) {
    expiresAt = expiresIsoFromField;
  } else if (Number.isFinite(days) && days > 0) {
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  return {
    v: 1,
    license_id: sanitizeText(input.license_id || gerarLicenseId(), 80),
    customer,
    plan,
    device_id: deviceId,
    issued_at: new Date().toISOString(),
    expires_at: expiresAt,
    offline_days: offlineDays
  };
}

function generateLicenseToken(paths, input, passphrase) {
  const txtPass = String(passphrase || "");
  if (!txtPass) {
    const error = new Error("Informe a senha da chave privada para assinar.");
    error.statusCode = 400;
    throw error;
  }

  if (!fileExists(paths.privateKeyPath)) {
    const error = new Error("Chave privada nao encontrada. Gere as chaves primeiro.");
    error.statusCode = 404;
    throw error;
  }

  const privatePem = fs.readFileSync(paths.privateKeyPath, "utf8");
  const payload = buildPayload(input);
  const payloadEncoded = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const signedContent = Buffer.from(`HB1.${payloadEncoded}`, "utf8");

  let signature = null;
  try {
    signature = crypto.sign(null, signedContent, {
      key: privatePem,
      passphrase: txtPass
    });
  } catch {
    const error = new Error("Senha da chave privada incorreta ou chave invalida.");
    error.statusCode = 401;
    throw error;
  }

  const signatureEncoded = base64UrlEncode(signature);
  const token = `HB1.${payloadEncoded}.${signatureEncoded}`;

  ensureDir(paths.issuedDir);
  fs.appendFileSync(
    paths.issuedPath,
    `${JSON.stringify({
      generated_at: new Date().toISOString(),
      payload,
      token_preview: `${token.slice(0, 24)}...${token.slice(-24)}`
    })}\n`,
    "utf8"
  );

  return {
    token,
    payload
  };
}

function listIssued(paths, limit = 30) {
  if (!fileExists(paths.issuedPath)) return [];
  const raw = fs.readFileSync(paths.issuedPath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .slice(-Math.max(1, Math.min(300, Number(limit) || 30)))
    .reverse()
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function exportPublicKey(paths, targetPathInput) {
  if (!fileExists(paths.publicKeyPath)) {
    const error = new Error("Chave publica nao encontrada. Gere as chaves primeiro.");
    error.statusCode = 404;
    throw error;
  }

  const targetPath = path.resolve(sanitizeText(targetPathInput || paths.defaultPublicTargetPath, 360));
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(paths.publicKeyPath, targetPath);
  return {
    target_path: targetPath
  };
}

module.exports = {
  getVaultPaths,
  getStatus,
  initKeys,
  generateLicenseToken,
  listIssued,
  exportPublicKey
};
