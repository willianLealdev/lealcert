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
Etapas da Safeweb chegam principalmente pelos webhooks. A consulta de informações da agenda é auxiliar; não presumir um endpoint de status da solicitação nem transformar resposta sem etapa em sincronização bem-sucedida.

**Why:** A referência anterior a GetStatus era inferida, não confirmada. A documentação de Informações retorna dados de agendamento, não uma enumeração documentada de todas as fases de emissão.

**How to apply:** Preservar o último status quando a consulta não informar fase. O tipo de evento “validação” sozinho não comprova aprovação nem atendimento; considerar o conteúdo recebido e mostrar fases desconhecidas sem inventá-las.

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
