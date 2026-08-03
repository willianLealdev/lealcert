-- Migração: Sistema de Discagem Automática com IA
-- Execute no VPS: docker exec lealcert_cert-db-1 psql -U postgres -d lealcert -f /tmp/0006_discagem_tables.sql

CREATE TABLE IF NOT EXISTS discagem_campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  pause_reason TEXT,
  paused_api TEXT,
  target_type TEXT NOT NULL DEFAULT 'all',
  target_contact_ids TEXT,
  manual_number TEXT,
  ai_model TEXT NOT NULL DEFAULT 'claude',
  tts_provider TEXT NOT NULL DEFAULT 'cartesia',
  tts_voice_id TEXT,
  window_morning_start INTEGER NOT NULL DEFAULT 9,
  window_morning_end INTEGER NOT NULL DEFAULT 12,
  window_afternoon_start INTEGER NOT NULL DEFAULT 13,
  window_afternoon_end INTEGER NOT NULL DEFAULT 16,
  window_days TEXT NOT NULL DEFAULT '["mon","tue","wed","thu"]',
  max_concurrent_calls INTEGER NOT NULL DEFAULT 3,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  total_called INTEGER NOT NULL DEFAULT 0,
  total_answered INTEGER NOT NULL DEFAULT 0,
  total_voicemail INTEGER NOT NULL DEFAULT 0,
  total_optout INTEGER NOT NULL DEFAULT 0,
  total_no_answer INTEGER NOT NULL DEFAULT 0,
  total_failed INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discagem_calls (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES discagem_campaigns(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES marketing_contacts(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  contact_name TEXT,
  twilio_call_sid TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued',
  outcome TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  retry_after TIMESTAMPTZ,
  transcript TEXT,
  recording_url TEXT,
  duration_seconds INTEGER,
  ai_model_used TEXT,
  tts_provider_used TEXT,
  error TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discagem_calls_campaign ON discagem_calls(campaign_id);
CREATE INDEX IF NOT EXISTS idx_discagem_calls_status ON discagem_calls(status);
CREATE INDEX IF NOT EXISTS idx_discagem_campaigns_status ON discagem_campaigns(status);
