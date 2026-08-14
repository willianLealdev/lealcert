---
name: Git workflow — quem faz o push
description: O usuário faz o git push manualmente; o agente só commita, nunca faz push.
---

**Regra:** O agente NUNCA executa `git push`. Apenas faz `git add` + `git commit`.
O usuário roda `git push github main` no shell do Replit quando quiser.

**Why:** Preferência explícita do usuário. Ele não confia no push automático do agente.

**How to apply:** Após qualquer conjunto de alterações, commitar normalmente e avisar o usuário que pode rodar `git push github main`.
