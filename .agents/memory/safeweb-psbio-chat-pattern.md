---
name: PSBio sempre global (Safeweb) — decisão de produto
description: PSBio usa sempre swBiometriaPSBioGlobal, independente do provider ativo (GAR ou Safeweb)
---

## Regra

PSBio é um sistema **nacional** gerenciado pela Safeweb. Independente do `activeProvider` (gestaoar ou safeweb), a consulta biométrica deve **sempre** chamar `swBiometriaPSBioGlobal` com as credenciais Safeweb de produção.

Isso vale em dois pontos do código:
1. `orders.ts` — rota `POST /orders/consulta-previa`
2. `chat.ts` — handler `VERIFICAR_BIO`

**Why:** O endpoint GAR `GarAPIs/PsBio` retorna 404 (não existe). O PSBio nacional é mantido pela Safeweb, não pelo GAR. Usar `garPsBio` para o provider GAR causava falha com HTTP 404.

**How to apply:**
- Nunca usar `garPsBio` para consulta PSBio, mesmo com `activeProvider === "gestaoar"`
- Construir `SafewebSettings` com `safewebUrl` + `safewebUsername` + `safewebPassword` (produção, nunca `*Homologacao`)
- Se credenciais Safeweb não estiverem configuradas → retornar `hasPsbio: true` (ignorar validação)
