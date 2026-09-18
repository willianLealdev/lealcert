CREATE TABLE IF NOT EXISTS api_keys (
  id serial PRIMARY KEY,
  name text NOT NULL,
  token_prefix text NOT NULL UNIQUE,
  token_hash text NOT NULL,
  access_level text NOT NULL CHECK (access_level IN ('read', 'write', 'full')),
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_ips jsonb NOT NULL DEFAULT '[]'::jsonb,
  rate_limit_per_minute integer NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute BETWEEN 1 AND 10000),
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_created_by_idx ON api_keys(created_by_user_id);

CREATE TABLE IF NOT EXISTS api_key_audit_logs (
  id serial PRIMARY KEY,
  api_key_id integer REFERENCES api_keys(id) ON DELETE SET NULL,
  token_prefix text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  scope text,
  status_code integer NOT NULL,
  duration_ms integer NOT NULL,
  source_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_key_audit_key_created_idx
  ON api_key_audit_logs(api_key_id, created_at DESC);