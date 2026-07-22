---
name: Docker schema migrations
description: Regra obrigatória — sempre que criar ou alterar tabela/coluna, gerar e entregar o SQL Docker para o usuário subir na VPS.
---

## Regra

**Toda vez que criar ou alterar qualquer tabela ou coluna no banco, obrigatoriamente:**
1. Gerar o SQL exato da alteração
2. Entregar o comando `docker exec` completo pronto para o usuário rodar na VPS

Padrão do ambiente de produção:
```bash
docker exec lealcert_cert-db-1 psql -U postgres -d lealcert -c "SQL AQUI"
```

**Why:** O banco de produção roda em VPS própria (EasyPanel). As migrações do dev (`drizzle-kit push` ou `ALTER TABLE IF NOT EXISTS` no startup) NÃO chegam automaticamente na produção. O usuário precisa aplicar manualmente via Docker.

## Histórico de migrações entregues

### 2026-07-22 — Filtro de provedor + pausa manual + faixa de contatos
```sql
ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS scheduled_included_providers text,
  ADD COLUMN IF NOT EXISTS manual_pause boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_dispatch_from integer,
  ADD COLUMN IF NOT EXISTS scheduled_dispatch_to integer;
```
```bash
docker exec lealcert_cert-db-1 psql -U postgres -d lealcert -c "
ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS scheduled_included_providers text,
  ADD COLUMN IF NOT EXISTS manual_pause boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_dispatch_from integer,
  ADD COLUMN IF NOT EXISTS scheduled_dispatch_to integer;
"
```

### 2026-07-22 — Countdown de próximo envio WhatsApp
```sql
ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS next_send_at timestamptz;
```
```bash
docker exec lealcert_cert-db-1 psql -U postgres -d lealcert -c "ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS next_send_at timestamptz;"
```
