---
name: Regra de autorização para alterações
description: Nunca alterar, remover ou refatorar nada sem autorização explícita do usuário. Apenas acrescentar o que for pedido.
---

## Regra

**Nunca** modificar, remover, substituir ou refatorar código, telas, rotas, regras ou fluxos existentes sem pedido explícito do usuário.
Novas funcionalidades devem ser **aditivas, isoladas e registradas ao lado do que já existe**, preservando integralmente o comportamento atual.

Reforço do usuário: “não mexe mais em nada, e não exclua o que está funcionando”. Em correções pontuais, alterar somente a parte solicitada.

**Why:** Instrução direta do usuário, reforçada em 25/08/2026 — o sistema já está em produção e qualquer alteração não autorizada pode quebrar fluxos existentes.

**How to apply:** Antes de qualquer edição, verificar: "o usuário pediu explicitamente para alterar isso?" Se não, criar arquivos/módulos separados e fazer somente os registros mínimos necessários. Remover ou mudar comportamento existente só com autorização clara.
