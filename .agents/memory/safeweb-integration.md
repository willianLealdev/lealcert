---
name: Safeweb integration
description: How the Safeweb provider is wired into the order flow alongside Gestão AR.
---

## Rule
`settings.activeProvider` ("gestaoar" | "safeweb") is read in `mp-webhook.ts` after payment confirmed. If "safeweb", calls `swAutoComprar(orderId)`; otherwise calls `garAutoComprar(orderId)`.

**Why:** The admin can switch providers from the settings UI without code changes.

**How to apply:** Any new post-payment automation must respect `activeProvider`. Always query the settings table inside the webhook/handler.

## Safeweb auto-buy (`sw-auto.ts`)
- Reads `cert.safewebIdProduto` (configured per-certificate in admin catálogo page)
- Calls `swAdicionarVideoconferencia` with order data
- Saves `safewebSolicitacaoId`, `safewebStatus`, `safewebSyncedAt` to orders table
- If cert has no `safewebIdProduto`, logs a warning and skips (admin must register manually)

## Status sync
- `POST /orders/:id/sync-provider` → if Safeweb active, calls `swSyncStatus(id)` (inferred endpoint: `GET /Service/Microservice/Shared/Partner/api/GetStatus/{id}`)
- For GAR, use existing `/gestaoar/sync-order/:orderId` route

## Safeweb API URLs (confirmed working)
- Produção: `https://pss.safewebpss.com.br`
- Homologação: `https://h-pss.safewebpss.com.br`
- The docs site (`h-acsafeweb.safewebpss.com.br`) is NOT the API server — never use it as URL base.
- The URL fields accept full URLs (path included) — `normalizeSwUrl()` in both `safeweb.ts` route and `sw-auto.ts` strips to origin automatically.
- Auth: `Identificador` + `Segredo` → Basic Auth → POST /Service/Microservice/Shared/HubAutenticacao/Autenticacoes/api/autorizacao/token

## DB columns added
- `certificates.safeweb_id_produto` (text, nullable)
- `orders.safeweb_solicitacao_id` (text, nullable)
- `orders.safeweb_status` (text, nullable)
- `orders.safeweb_synced_at` (timestamptz, nullable)
