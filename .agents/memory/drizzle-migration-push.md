---
name: Drizzle migration when schema bootstrapped via push
description: How to handle the case where the DB schema was created via drizzle-kit push (no tracking table), so subsequent drizzle migrate fails with "already exists" for ENUMs.
---

## The problem
When `drizzle-kit push` is used to bootstrap the schema, the `drizzle.__drizzle_migrations` table is never created. Calling `drizzle migrate()` later will try to re-run migration 0000 which fails with `"type 'role' already exists"`.

## The fix (applied in artifacts/api-server/src/index.ts)
Before calling `migrate()`:
1. `CREATE SCHEMA IF NOT EXISTS drizzle`
2. `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial, hash text, created_at bigint)`
3. If the table is empty AND the `role` pg_type already exists → insert the 0000 migration hash so Drizzle skips it
4. Then call `migrate()` normally — it only runs migrations with `folderMillis` > last `created_at`

**Why:** The `drizzle.migrate()` function checks `lastDbMigration.created_at < migration.folderMillis` to decide whether to run a migration. If we seed the 0000 record, all newer migrations (0001, 0002...) still run.

**How to apply:** Any time a new migration is added, update `meta/_journal.json` with the new entry's `when` timestamp. The migration hash is `sha256(sqlFileContent)`. The hash for 0000 is `bfa8f0711944c5051e127a100a8abbbceffe8b68e6361c7536b6e126251f9574`.
