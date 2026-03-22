# Licenca para venda (com app separado)

## Estrutura recomendada

- `AppGestaoLoja` (PDV do cliente): valida token com **chave publica**.
- `LicenseAdmin` (seu app interno): gera token com **chave privada**.

## 1) Instalar e abrir o LicenseAdmin

```bash
cd LicenseAdmin
npm install
npm run dev
```

Ou instalar o setup:

- `LicenseAdmin/release/publicar/Hadassa License Admin Setup 1.0.0.exe`

## Opcional: emissor Android offline

Existe um app mobile em:

- `LicenseAdminMobile/`

Rodar:

```bash
cd LicenseAdminMobile
npm install
npm run start
```

## 2) Gerar chaves no LicenseAdmin

No app, em **Status do cofre**, clique em **Gerar chaves** com senha forte.

## 3) Exportar chave publica para o PDV

No app, em **Exportar chave publica para o PDV**, use:

`AppGestaoLoja/backend/src/config/license-public.pem`

## 4) Emitir licenca para cada cliente

No PDV do cliente, pegue o **Codigo do dispositivo** (ex.: `PDV-...`).

No LicenseAdmin:
- preencha cliente
- informe codigo do dispositivo
- escolha plano e validade
- informe senha da chave privada
- clique em **Gerar token de licenca**

Envie o token `HB1.payload.assinatura` para o cliente colar no PDV.

## Diagnostico rapido (assinatura invalida)

Use no projeto do PDV:

```bash
npm run license:verify -- --token="HB1...."
```

O comando mostra:
- fingerprint da chave publica carregada pelo PDV
- se a assinatura confere
- payload decodificado (device_id, expira_em, etc.)

## Regras de seguranca

- Nunca compartilhe `license-private.pem`.
- Mantenha o `LicenseAdmin` apenas no seu computador.
- Faça backup do cofre de chaves (`vault`).
