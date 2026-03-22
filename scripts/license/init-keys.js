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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(__dirname, "..", "..");
  const privatePath = path.resolve(
    projectRoot,
    String(args.private || "licensing/private/license-private.pem")
  );
  const publicPath = path.resolve(
    projectRoot,
    String(args.public || "backend/src/config/license-public.pem")
  );
  const force = String(args.force || "").toLowerCase() === "true";

  if (!force && (fs.existsSync(privatePath) || fs.existsSync(publicPath))) {
    console.log("Chaves ja existem. Use --force=true para recriar.");
    console.log(`Privada: ${privatePath}`);
    console.log(`Publica: ${publicPath}`);
    process.exit(0);
  }

  ensureDir(path.dirname(privatePath));
  ensureDir(path.dirname(publicPath));

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ format: "pem", type: "pkcs8" });
  const publicPem = publicKey.export({ format: "pem", type: "spki" });

  fs.writeFileSync(privatePath, privatePem, { encoding: "utf8", mode: 0o600 });
  fs.writeFileSync(publicPath, publicPem, { encoding: "utf8" });

  console.log("Chaves de licenca geradas com sucesso.");
  console.log(`Privada (NAO compartilhe): ${privatePath}`);
  console.log(`Publica (vai no app): ${publicPath}`);
}

main();
