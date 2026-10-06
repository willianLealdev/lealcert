---
name: PSBio sempre global (Safeweb) — decisão de produto
description: PSBio usa sempre swBiometriaPSBioGlobal, independente do provider ativo (GAR ou Safeweb)
---

## Regra

Independente do `activeProvider` (gestaoar ou safeweb), a consulta biométrica dos fluxos principais deve usar o endpoint PSBio **global** da Safeweb com as credenciais de produção.

Isso vale nos fluxos de pedido, checkout público e chat:
1. `orders.ts` — rota `POST /orders/consulta-previa`
2. `chat.ts` — handler `VERIFICAR_BIO`

**Why:** Em verificações anteriores, o endpoint GAR `GarAPIs/PsBio` retornou 404. Selecioná-lo pelo provedor de emissão causava falha; emissão e consulta biométrica são decisões independentes.

**How to apply:**
- Nunca usar `garPsBio` para consulta PSBio, mesmo com `activeProvider === "gestaoar"`
- Construir `SafewebSettings` com `safewebUrl` + `safewebUsername` + `safewebPassword` (produção, nunca `*Homologacao`)
