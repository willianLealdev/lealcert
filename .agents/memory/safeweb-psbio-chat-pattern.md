---
name: PSBio no chat — padrão correto
description: Como o handler VERIFICAR_BIO no chat deve chamar o PSBio, espelhando orders.ts
---

## Regra

O handler `VERIFICAR_BIO` em `chat.ts` deve espelhar **exatamente** a lógica de `orders.ts /consulta-previa`:

1. Ler `activeProvider` da tabela settings
2. Se `safeweb`: construir `SafewebSettings` com `s.safewebUrl + s.safewebUsername + s.safewebPassword` (campos de produção, **não** os campos `*Homologacao`)
3. Se `gestaoar`: chamar `garPsBio(s.garApiKey, cpf)`

**Why:** O PSBio é a mesma base nacional independente de `safewebAmbiente`. O campo `safewebUrlHomologacao` existe apenas para o fluxo de criação de certificados (Add), não para consulta PSBio. Usar as credenciais de homologação para PSBio causava falha silenciosa (retornava `encontrado: false` ou auth 404).

**How to apply:** Nunca usar `getSwSettings()` (que respeita `isHomol`) para PSBio no chat. Construir `SafewebSettings` inline lendo `safewebUrl` diretamente, como `orders.ts` faz.
