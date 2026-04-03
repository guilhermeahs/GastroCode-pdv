# Sandbox API (teste antes da integracao)

API propria para testar fluxo de pedidos/entregas sem integrar no app principal.

## Rodar

```bash
npm run api:teste
```

Servidor padrao: `http://localhost:3210`

Header de seguranca padrao:

```text
x-api-key: gastrocode-teste-123
```

Voce pode trocar por variavel de ambiente:

```bash
setx SANDBOX_API_KEY "sua-chave-forte"
setx SANDBOX_API_PORT "3210"
```

## Endpoints principais

- `GET /health` (sem auth)
- `POST /auth/token` (x-api-key) -> gera Bearer token temporario
- `POST /orders` -> cria pedido
- `GET /orders` -> lista pedidos com filtros
- `PATCH /orders/:id/status` -> atualiza status
- `POST /motoboy/pedidos/lote` -> adiciona codigos em lote para um motoboy
- `GET /integrations` -> status das integracoes iFood/99
- `PATCH /integrations/:provider/config` -> configurar iFood/99
- `POST /integrations/:provider/import` -> importar pedidos de API externa
- `POST /integrations/:provider/webhook` -> receber webhook (publico)
- `POST /webhooks/subscriptions` -> cadastra webhook
- `GET /events` -> lista eventos gerados
- `POST /sandbox/reset` (x-api-key) -> limpa base de teste

`provider` pode ser: `ifood`, `ninenine` ou `99`.

## Exemplo rapido (PowerShell)

```powershell
$base = "http://localhost:3210"
$headers = @{ "x-api-key" = "gastrocode-teste-123"; "content-type" = "application/json" }

# criar pedido de teste
$pedido = @{
  external_id = "IFD-1001"
  source = "IFOOD"
  customer_name = "Cliente Teste"
  motoboy = "Andre"
  items = @(
    @{ name = "X-Burger"; qty = 2; price = 28.5 },
    @{ name = "Refri"; qty = 1; price = 8.0 }
  )
  payments = @(
    @{ method = "PIX"; amount = 65.0 }
  )
} | ConvertTo-Json -Depth 6

Invoke-RestMethod -Uri "$base/orders" -Method Post -Headers $headers -Body $pedido
Invoke-RestMethod -Uri "$base/orders" -Method Get -Headers @{ "x-api-key" = "gastrocode-teste-123" }
```

## Integracao iFood / 99 (teste rapido)

```powershell
$base = "http://localhost:3210"
$key = "gastrocode-teste-123"
$headers = @{ "x-api-key" = $key; "content-type" = "application/json" }

# 1) Configura iFood (usa a propria sandbox para simular origem externa)
$cfgIfood = @{
  enabled = $true
  base_url = $base
  import_path = "/orders"
  import_query = "source=IFOOD"
  api_key = $key
  default_payment = "PIX"
  motoboy_fallback = "Andre"
} | ConvertTo-Json -Depth 6

Invoke-RestMethod -Uri "$base/integrations/ifood/config" -Method Patch -Headers $headers -Body $cfgIfood

# 2) Importa iFood
Invoke-RestMethod -Uri "$base/integrations/ifood/import" -Method Post -Headers $headers -Body '{"limit":100}'

# 3) Webhook 99 (sem auth por header x-api-key)
$body99 = @{
  order = @{
    id = "NINE-1001"
    status = "OUT_FOR_DELIVERY"
    customer = @{ name = "Cliente 99" }
    items = @(@{ description = "Pizza"; quantity = 1; unitPrice = 59.9 })
    payments = @(@{ type = "DINHEIRO"; amount = 59.9 })
  }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Uri "$base/integrations/99/webhook" -Method Post -ContentType "application/json" -Body $body99
```

## Filtros em `GET /orders`

- `status=RECEBIDO|EM_PREPARO|SAIU_PARA_ENTREGA|ENTREGUE|CANCELADO`
- `source=IFOOD|ANOTA_AI|NINENINE|MANUAL`
- `motoboy=nome`
- `from=2026-03-27T00:00:00.000Z`
- `to=2026-03-27T23:59:59.999Z`

## Lote para motoboy

`POST /motoboy/pedidos/lote`

Body:

```json
{
  "motoboy": "Andre",
  "codigos": "5432 7777 654321",
  "payment": "PIX",
  "source": "IFOOD"
}
```

## Armazenamento

Os dados ficam em:

`sandbox-api/data/sandbox-store.json`

Assim voce consegue testar persistencia local entre reinicios.
