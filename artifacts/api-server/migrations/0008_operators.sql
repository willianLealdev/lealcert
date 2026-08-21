-- Migração: Operadores vinculados a contadores
-- Execute na VPS:
-- docker exec -i lealcert_cert-db-1 psql -U postgres -d lealcert < artifacts/api-server/migrations/0008_operators.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'operador'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'role')
  ) THEN
    ALTER TYPE role ADD VALUE 'operador';
  END IF;
END
$$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS contador_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS operator_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_contador_id_idx ON users (contador_id);
CREATE INDEX IF NOT EXISTS orders_operator_id_idx ON orders (operator_id);