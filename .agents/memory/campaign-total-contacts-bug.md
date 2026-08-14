---
name: Bug totalContacts campanha ao retomar
description: Ao retomar campanha após restart, totalContacts era sobrescrito com os restantes em vez de enviados+restantes.
---

**Regra:** `filteredTotal` no `dispatchCampaign` é calculado a partir de `allRemaining` (contatos não enviados). Ao salvar no banco, usar `alreadySentCount + remainingTotal` como `totalContacts`, nunca só `remainingTotal`.

**Why:** A cada restart do servidor o scheduler retoma a campanha e recalcula o total. Se usar só os restantes, o display mostra ex. "17.256 / 20.441" quando o total real é 38k.

**Fix aplicado em:** `artifacts/api-server/src/routes/marketing.ts` linha ~1656-1663:
```
const remainingTotal = buckets.outros.length + ...;
const filteredTotal = alreadySentCount + remainingTotal;
```

**Cuidado com SQL manual:** nunca usar UPDATE genérico de total_contacts sem filtrar pelo provedor/tipo correto da campanha — causou total virar 100k ao contar todos os contatos independente do filtro.
