---
name: Production database access
description: Docker container name, DB name, and command pattern to run SQL against production (EasyPanel VPS).
---

## Production PostgreSQL — EasyPanel VPS

- **Docker container:** `lealcert_cert-db-1`
- **Database name:** `lealcert`
- **User:** `postgres`

### Comando para qualquer ALTER/UPDATE no banco de produção

```bash
docker exec lealcert_cert-db-1 psql -U postgres -d lealcert -c "SQL AQUI;"
```

**Why:** O nome do container é gerado pelo EasyPanel mas o banco dentro do PostgreSQL chama `lealcert`. O host do Docker expõe pela socket Unix, então não precisa de `-h`.

**How to apply:** Sempre que precisar alterar schema ou dados em produção, dar esse comando na VPS (root@vmi2764919).
