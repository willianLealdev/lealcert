-- ============================================================
-- LealCert — Schema completo PostgreSQL
-- Como executar no Docker da VPS:
--
--   docker exec -i NOME_DO_CONTAINER psql -U postgres -d lealcert < lealcert-schema.sql
--
-- Ou se quiser criar o banco antes:
--   docker exec NOME_DO_CONTAINER psql -U postgres -c "CREATE DATABASE lealcert;"
--   docker exec -i NOME_DO_CONTAINER psql -U postgres -d lealcert < lealcert-schema.sql
-- ============================================================

-- ── ENUMs ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE role AS ENUM ('admin', 'contador', 'agente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'created', 'pending_payment', 'paid', 'protocol_assigned',
    'aguardando_validacao', 'emitido', 'revogado', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE client_type AS ENUM ('cpf', 'cnpj');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE coupon_type AS ENUM ('percent', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE coupon_target AS ENUM ('all', 'cliente', 'contador');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                            SERIAL PRIMARY KEY,
  name                          TEXT NOT NULL,
  email                         TEXT UNIQUE,
  cpf_cnpj                      TEXT NOT NULL UNIQUE,
  password_hash                 TEXT NOT NULL,
  role                          role NOT NULL DEFAULT 'contador',
  user_type                     TEXT NOT NULL DEFAULT 'cliente',
  phone                         TEXT UNIQUE,
  is_active                     BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified                BOOLEAN NOT NULL DEFAULT FALSE,
  email_verification_code       TEXT,
  email_verification_expires_at TIMESTAMPTZ,
  must_change_password          BOOLEAN NOT NULL DEFAULT FALSE,
  password_reset_token          TEXT,
  password_reset_expires_at     TIMESTAMPTZ,
  crc_number                    TEXT,
  crc_verified                  BOOLEAN NOT NULL DEFAULT FALSE,
  person_type                   TEXT,
  company_cnpj                  TEXT,
  company_name                  TEXT,
  company_fantasy_name          TEXT,
  responsible_cpf               TEXT,
  responsible_name              TEXT,
  zip_code                      TEXT,
  street                        TEXT,
  address_number                TEXT,
  complement                    TEXT,
  neighborhood                  TEXT,
  city                          TEXT,
  address_state                 TEXT,
  registration_ip               TEXT,
  trusted_ips                   JSONB DEFAULT '[]',
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CERTIFICATES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT,
  price             NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  gar_hash_produto  TEXT,
  safeweb_id_produto TEXT,
  price_contador    NUMERIC(10,2),
  validity_months   INTEGER NOT NULL DEFAULT 12,
  product           TEXT,
  issuance_type     TEXT,
  model             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SLOTS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slots (
  id             SERIAL PRIMARY KEY,
  slot_datetime  TIMESTAMPTZ NOT NULL UNIQUE,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ORDERS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                              SERIAL PRIMARY KEY,
  order_number                    TEXT NOT NULL UNIQUE,
  user_id                         INTEGER NOT NULL REFERENCES users(id),
  certificate_id                  INTEGER REFERENCES certificates(id) ON DELETE SET NULL,
  status                          order_status NOT NULL DEFAULT 'created',
  total                           NUMERIC(10,2) NOT NULL,
  client_type                     client_type NOT NULL DEFAULT 'cpf',
  customer_name                   TEXT NOT NULL,
  customer_cpf_cnpj               TEXT NOT NULL,
  customer_email                  TEXT,
  customer_phone                  TEXT,
  customer_birth_date             TEXT,
  has_psbio                       BOOLEAN,
  company_name                    TEXT,
  inss_number                     TEXT,
  cnh_path                        TEXT,
  cnh_verso_path                  TEXT,
  cartao_cnpj_path                TEXT,
  ficha_cadastral_path            TEXT,
  outros_path                     TEXT,
  terms_accepted_at               TIMESTAMPTZ,
  scheduled_at                    TIMESTAMPTZ,
  protocol_number                 TEXT,
  extended_warranty               BOOLEAN NOT NULL DEFAULT FALSE,
  address_zipcode                 TEXT,
  address_street                  TEXT,
  address_number                  TEXT,
  address_complement              TEXT,
  address_neighborhood            TEXT,
  address_city                    TEXT,
  address_state                   TEXT,
  address_ibge                    TEXT,
  representante_address_zipcode   TEXT,
  representante_address_street    TEXT,
  representante_address_number    TEXT,
  representante_address_complement TEXT,
  representante_address_neighborhood TEXT,
  representante_address_city      TEXT,
  representante_address_state     TEXT,
  chat_documents                  TEXT,
  mp_preference_id                TEXT,
  mp_payment_id                   TEXT,
  gar_pedido                      TEXT,
  gar_protocolo                   TEXT,
  gar_hash_venda                  TEXT,
  gar_status                      TEXT,
  gar_agendamento_link            TEXT,
  gar_hope_upload_url             TEXT,
  gar_synced_at                   TIMESTAMPTZ,
  gar_agendamento_local_nome      TEXT,
  gar_agendamento_local_hash      TEXT,
  gar_agendamento_slot_hash       TEXT,
  gar_agendamento_data_hora       TEXT,
  representante_cpf               TEXT,
  representante_nascimento        TEXT,
  customer_cei                    TEXT,
  customer_nis                    TEXT,
  representante_doc_tipo          TEXT,
  representante_doc_numero        TEXT,
  representante_doc_emissor       TEXT,
  nf_cnpj                         TEXT,
  nf_nome                         TEXT,
  nf_zipcode                      TEXT,
  nf_street                       TEXT,
  nf_number                       TEXT,
  nf_complement                   TEXT,
  nf_neighborhood                 TEXT,
  nf_city                         TEXT,
  nf_state                        TEXT,
  cert_name_snapshot              TEXT,
  cert_product_snapshot           TEXT,
  safeweb_solicitacao_id          TEXT,
  safeweb_status                  TEXT,
  safeweb_synced_at               TIMESTAMPTZ,
  safeweb_agendamento_id          TEXT,
  safeweb_agendamento_data_hora   TEXT,
  safeweb_agendamento_local_nome  TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ORDER EVENTS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_events (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CERTIFICATE RENEWALS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificate_renewals (
  id                   SERIAL PRIMARY KEY,
  order_id             INTEGER REFERENCES orders(id),
  customer_name        TEXT NOT NULL,
  customer_cpf_cnpj    TEXT NOT NULL,
  customer_email       TEXT,
  certificate_name     TEXT NOT NULL,
  gar_pedido           TEXT,
  gar_protocolo        TEXT,
  validity_months      INTEGER NOT NULL DEFAULT 12,
  emitted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at           TIMESTAMPTZ NOT NULL,
  alert_sent_30d       BOOLEAN NOT NULL DEFAULT FALSE,
  alert_sent_7d        BOOLEAN NOT NULL DEFAULT FALSE,
  alert_sent_1d        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TICKETS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  subject        TEXT NOT NULL,
  status         ticket_status NOT NULL DEFAULT 'open',
  unread_admin   BOOLEAN NOT NULL DEFAULT TRUE,
  unread_client  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── MESSAGES (suporte) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id         SERIAL PRIMARY KEY,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SETTINGS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id                          SERIAL PRIMARY KEY,
  app_name                    TEXT NOT NULL DEFAULT 'LealCert',
  mp_access_token             TEXT,
  mp_public_key               TEXT,
  webhook_secret              TEXT,
  mail_from                   TEXT,
  site_url                    TEXT,
  schedule_open_days          TEXT DEFAULT '1,2,3,4,5',
  schedule_open_hour          TEXT DEFAULT '9',
  schedule_close_hour         TEXT DEFAULT '18',
  schedule_step_min           TEXT DEFAULT '60',
  schedule_closed_dates       TEXT DEFAULT '',
  gar_api_key                 TEXT,
  gar_documento               TEXT,
  gar_hash_vendedor           TEXT,
  gar_hash_parceiro           TEXT,
  gar_hash_tabela             TEXT,
  gar_forma_pagamento         TEXT DEFAULT '8',
  gar_preferir_videoconferencia TEXT DEFAULT '1',
  safeweb_url                 TEXT,
  safeweb_url_homologacao     TEXT,
  safeweb_ambiente            TEXT NOT NULL DEFAULT 'producao',
  safeweb_username            TEXT,
  safeweb_password            TEXT,
  safeweb_username_homologacao TEXT,
  safeweb_password_homologacao TEXT,
  safeweb_cnpj_ar             TEXT,
  safeweb_codigo_parceiro     TEXT,
  active_provider             TEXT DEFAULT 'gestaoar',
  evolution_url               TEXT,
  evolution_api_key           TEXT,
  evolution_instance          TEXT,
  logo_url                    TEXT,
  primary_color               TEXT DEFAULT '#2563eb',
  contact_phone               TEXT,
  contact_whatsapp            TEXT,
  contact_email_support       TEXT,
  contact_address             TEXT,
  smtp_host_db                TEXT,
  smtp_port_db                TEXT DEFAULT '587',
  smtp_user_db                TEXT,
  smtp_pass_db                TEXT,
  vapid_subject               TEXT,
  vapid_public_key            TEXT,
  vapid_private_key           TEXT,
  ai_provider                 TEXT DEFAULT 'openai',
  openai_api_key              TEXT,
  openai_model                TEXT DEFAULT 'gpt-4o-mini',
  deepseek_api_key            TEXT,
  deepseek_model              TEXT DEFAULT 'deepseek-chat',
  claude_api_key              TEXT,
  claude_model                TEXT DEFAULT 'claude-3-5-haiku-20241022',
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── COUPONS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id           SERIAL PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  type         coupon_type NOT NULL DEFAULT 'percent',
  value        NUMERIC(10,2) NOT NULL,
  target       coupon_target NOT NULL DEFAULT 'all',
  expires_at   TIMESTAMPTZ,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  usage_limit  INTEGER,
  usage_count  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── MARKETING CONTACTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_contacts (
  id                    SERIAL PRIMARY KEY,
  type                  TEXT NOT NULL DEFAULT 'cliente',
  name                  TEXT NOT NULL,
  email                 TEXT NOT NULL,
  phone                 TEXT,
  tags                  TEXT,
  status                TEXT NOT NULL DEFAULT 'active',
  email_status          TEXT NOT NULL DEFAULT 'unknown',
  email_invalid_reason  TEXT,
  email_validated_at    TIMESTAMPTZ,
  unsubscribed_at       TIMESTAMPTZ,
  bounced               BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email, type)
);

-- ── MARKETING CAMPAIGNS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id                          SERIAL PRIMARY KEY,
  name                        TEXT NOT NULL,
  subject                     TEXT NOT NULL,
  body_html                   TEXT NOT NULL,
  body_text                   TEXT,
  from_name                   TEXT NOT NULL DEFAULT 'LealCert Marketing',
  from_email                  TEXT NOT NULL DEFAULT 'mkt@lealcert.com.br',
  reply_to                    TEXT,
  status                      TEXT NOT NULL DEFAULT 'draft',
  scheduled_at                TIMESTAMPTZ,
  sent_at                     TIMESTAMPTZ,
  total_sent                  INTEGER NOT NULL DEFAULT 0,
  total_delivered             INTEGER NOT NULL DEFAULT 0,
  total_opened                INTEGER NOT NULL DEFAULT 0,
  total_clicked               INTEGER NOT NULL DEFAULT 0,
  total_bounced               INTEGER NOT NULL DEFAULT 0,
  total_replied               INTEGER NOT NULL DEFAULT 0,
  total_contacts              INTEGER NOT NULL DEFAULT 0,
  filter_tags                 TEXT,
  target_type                 TEXT NOT NULL DEFAULT 'all',
  scheduled_target_override   TEXT,
  scheduled_contact_ids       TEXT,
  scheduled_manual_recipients TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── MARKETING SENDS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_sends (
  id               SERIAL PRIMARY KEY,
  campaign_id      INTEGER NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  contact_id       INTEGER REFERENCES marketing_contacts(id) ON DELETE SET NULL,
  recipient_email  TEXT,
  recipient_name   TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  sent_at          TIMESTAMPTZ,
  error            TEXT,
  opened_at        TIMESTAMPTZ,
  open_count       INTEGER NOT NULL DEFAULT 0,
  clicked_at       TIMESTAMPTZ,
  click_count      INTEGER NOT NULL DEFAULT 0,
  tracking_token   TEXT NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, contact_id)
);

-- ── MARKETING REPLIES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_replies (
  id          SERIAL PRIMARY KEY,
  send_id     INTEGER REFERENCES marketing_sends(id),
  contact_id  INTEGER REFERENCES marketing_contacts(id),
  from_email  TEXT NOT NULL,
  from_name   TEXT,
  subject     TEXT,
  body_text   TEXT,
  body_html   TEXT,
  read_at     TIMESTAMPTZ,
  replied_at  TIMESTAMPTZ,
  reply_body  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── MARKETING TEMPLATES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_templates (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body_html  TEXT NOT NULL,
  body_text  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CONVERSATIONS (chat IA) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CHAT MESSAGES (chat IA) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PUSH SUBSCRIPTIONS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── IP LOGS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ip_logs (
  id           SERIAL PRIMARY KEY,
  ip           TEXT NOT NULL,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cpf_cnpj     TEXT,
  action       TEXT NOT NULL,
  country      TEXT,
  country_code TEXT,
  city         TEXT,
  is_brazil    BOOLEAN DEFAULT FALSE,
  success      BOOLEAN DEFAULT FALSE,
  blocked      BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── IP BLOCKS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ip_blocks (
  id           SERIAL PRIMARY KEY,
  ip           TEXT NOT NULL UNIQUE,
  attempts     INTEGER NOT NULL DEFAULT 0,
  is_banned    BOOLEAN NOT NULL DEFAULT FALSE,
  is_foreign   BOOLEAN NOT NULL DEFAULT FALSE,
  blocked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unblock_at   TIMESTAMPTZ,
  unblocked_at TIMESTAMPTZ,
  unblocked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  country      TEXT,
  country_code TEXT,
  city         TEXT,
  notes        TEXT
);

-- ── IP VERIFICATIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ip_verifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip         TEXT NOT NULL,
  code       TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── IP WHITELIST ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ip_whitelist (
  id           SERIAL PRIMARY KEY,
  ip           TEXT NOT NULL UNIQUE,
  added_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes        TEXT,
  country      TEXT,
  country_code TEXT,
  city         TEXT
);

-- ── REVIEWS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL,
  text       TEXT NOT NULL,
  stars      INTEGER NOT NULL DEFAULT 5,
  status     TEXT NOT NULL DEFAULT 'pending',
  user_id    INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SESSION (express-session / connect-pg-simple) ─────────────────────────────
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL COLLATE "default",
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
ALTER TABLE session DROP CONSTRAINT IF EXISTS session_pkey;
ALTER TABLE session ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

-- ── DRIZZLE MIGRATIONS (rastreamento interno) ─────────────────────────────────
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id          SERIAL PRIMARY KEY,
  hash        TEXT NOT NULL,
  created_at  BIGINT
);

-- ── ROW PADRÃO de settings (inserido apenas se não existir) ───────────────────
INSERT INTO settings (id, app_name)
VALUES (1, 'LealCert')
ON CONFLICT (id) DO NOTHING;

-- ── FIM ───────────────────────────────────────────────────────────────────────
-- Após criar o banco, crie o usuário admin via seed do projeto:
--   pnpm --filter @workspace/db run seed
-- ─────────────────────────────────────────────────────────────────────────────
