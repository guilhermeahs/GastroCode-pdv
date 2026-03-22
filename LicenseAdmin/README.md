# Hadassa License Admin

App separado (offline) para emitir licencas assinadas do PDV.

## Rodar local

```bash
npm install
npm run dev
```

## Build instalador

```bash
npm run build
```

Saida em `LicenseAdmin/release/`.

## Fluxo de uso

1. Gerar chaves no app admin (uma vez).
2. Copiar chave publica para o projeto PDV.
3. Cliente informa codigo de dispositivo `PDV-...`.
4. Gerar token para esse cliente/dispositivo.
5. Enviar token para o cliente colar na tela de ativacao do PDV.

## Seguranca

- Chave privada fica no cofre local do app admin:
  - `%APPDATA%/Hadassa License Admin/vault/keys/license-private.pem`
- Nunca envie a chave privada para cliente.
- A chave publica pode ser embutida no app PDV.
