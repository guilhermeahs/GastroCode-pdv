# Hadassa License Mobile (Android)

App mobile offline para emitir token de licenca `HB1.payload.assinatura` para o PDV.

## Recursos

- Importar e salvar chave privada Ed25519 (PEM PKCS8) no dispositivo.
- Gerar licenca por cliente e `PDV-...`.
- Copiar token para envio ao cliente.
- Historico local de emissoes.
- Protecao por PIN (4-8 digitos).

## Rodar local

```bash
cd "D:\Ti\pdv jennifer\AppGestaoLoja\LicenseAdminMobile"
npm install
npm run start
```

Depois:
- `a` para abrir no Android (emulador),
- ou escaneie QR no app Expo Go.

## Build Android local (APK)

Precisa Android Studio + SDK configurado.

```bash
npm run android
```

Para release local:

```bash
npm run build:apk:local
```

## Observacoes de seguranca

- A chave privada nunca deve ir para clientes.
- O app e offline, sem servidor.
- Mesmo com PIN/armazenamento seguro, APK pode ser extraido em caso de ataque.
- Para venda em escala, o ideal continua sendo assinatura no servidor.
