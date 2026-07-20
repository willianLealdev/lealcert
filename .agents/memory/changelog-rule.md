---
name: Changelog obrigatório
description: Regra do usuário — toda alteração deve ser adicionada ao log de novidades antes do push.
---

## Regra

Antes de finalizar qualquer tarefa, adicionar uma entrada no array `CHANGELOG` em:

```
artifacts/lealcert/src/components/changelog.tsx
```

## Formato

```ts
{
  date: "DD/MM/AAAA",
  version: "X.Y",          // incrementar minor a cada sessão de trabalho
  changes: [
    { type: "fix" | "novo" | "melhoria" | "segurança", text: "Descrição em português" },
  ],
}
```

**Why:** O usuário usa o painel de Novidades (visível só para admin) para acompanhar o histórico de todas as alterações feitas no sistema. Sem atualizar esse arquivo, o painel fica desatualizado.

**How to apply:** Ao finalizar cada task/sessão, inserir um novo objeto no TOPO do array `CHANGELOG` com a data atual e as mudanças realizadas. Incrementar a versão em 0.1 a cada sessão.
