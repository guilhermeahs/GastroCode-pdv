const crypto = require("crypto");

function gerarSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function hashPin(pin, salt) {
  const pinSeguro = String(pin || "");
  const saltSeguro = String(salt || "");
  return crypto.createHash("sha256").update(`${saltSeguro}:${pinSeguro}`).digest("hex");
}

function gerarTokenSessao() {
  return crypto.randomBytes(24).toString("hex");
}

function pinValidoFormato(pin) {
  return /^\d{4,8}$/.test(String(pin || ""));
}

module.exports = {
  gerarSalt,
  hashPin,
  gerarTokenSessao,
  pinValidoFormato
};

