# iFood - Preparacao para Homologacao (GastroCode PDV)

## Objetivo
Este fluxo deixa o modulo de entregas pronto para operar com iFood em homologacao e, apos aprovacao, em producao.

## O que foi implementado
- Polling de eventos com `x-polling-merchants`.
- Suporte a `excludeHeartbeat=true`.
- Intervalo de polling configurado para operacao homologada (30s).
- ACK automatico dos eventos (incluindo eventos repetidos).
- Consulta de detalhes do pedido por `orderId`.
- Cache local de pedido iFood para evitar consultas repetidas desnecessarias.
- Log de eventos iFood com status (`RECEIVED`, `PROCESSED`, `ACKED`, `ACK_FAILED`, `ERROR`).
- Validacao opcional de assinatura de webhook (`x-ifood-signature`).
- Renovacao de token OAuth (tentativa padrao + fallback com Basic Auth).
- Checklist de prontidao + metricas (ACK rate total e ultimas 24h) na tela de Entregas.
- Checklist de cenarios de fluxo com evidencias tecnicas:
  - Cenario 1: pedido agendado com voucher.
  - Cenario 2: pedido manual com cancelamento.
  - Cenario 3: pedido para retirada no local.
  - Cenario 4: cancelamento iniciado pela plataforma.
  - Cenario 5: pagamento em dinheiro com troco.
  - Cliente com documento (CPF/CNPJ) presente no payload.

## Campos para configuracao no app
Na tela `Entregas > Integracoes > iFood > Opcoes avancadas`:
- Ativar modo homologacao.
- Base URL iFood.
- Token URL.
- Polling path.
- ACK path.
- Order details path (+ fallback).
- Merchant IDs (separados por `;` ou `,`).
- Intervalo de polling (30s).
- excludeHeartbeat habilitado.
- Grant type OAuth.
- Client ID.
- Client Secret.
- Scope (quando aplicavel).
- Authorization code / Refresh token (quando aplicavel).
- Webhook secret e exigencia de assinatura (se exigido pela estrategia de webhook).

## Endpoints internos do PDV
- `POST /api/entregas/integracoes/ifood/webhook`
- `GET /api/entregas/integracoes/ifood/homologacao/status`
- `PATCH /api/entregas/integracoes/ifood/homologacao`
- `POST /api/entregas/integracoes/ifood/homologacao/sincronizar`
- `GET /api/entregas/integracoes/ifood/homologacao/eventos`
- `POST /api/entregas/integracoes/ifood/homologacao/token`

## Arquivos principais para apresentar ao iFood
- Backend de homologacao iFood: `backend/src/services/ifoodHomologacaoService.js`
- Integrador geral de entregas: `backend/src/services/entregasIntegracaoService.js`
- Persistencia de pedidos/motoboys: `backend/src/models/Entrega.js`
- Endpoints HTTP de entregas: `backend/src/routes/entregasRoutes.js`
- Controller de entregas: `backend/src/controllers/EntregasController.js`
- Estrutura de banco (tabelas/migracoes): `backend/src/config/db.js`
- Tela operacional (Online / Pedidos / Motoboy): `frontend/src/pages/Entregas.jsx`
- Cliente HTTP frontend para entregas: `frontend/src/services/api.js`

## Validacao rapida antes da homologacao
1. Preencher credenciais e merchants.
2. Salvar homologacao iFood.
3. Clicar em `Renovar token agora`.
4. Clicar em `Sincronizar pedidos`.
5. Verificar:
   - Checklist em `PRONTO`.
   - ACK 24h >= 95%.
   - Eventos recentes com status `ACKED`/`PROCESSED`.
