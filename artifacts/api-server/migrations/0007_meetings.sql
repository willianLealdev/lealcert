-- Migração: Agenda de Reuniões LealCert
-- Execute na VPS:
-- docker exec -i lealcert_cert-db-1 psql -U postgres -d lealcert < artifacts/api-server/migrations/0007_meetings.sql

ALTER TABLE settings ADD COLUMN IF NOT EXISTS jitsi_app_id TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS jitsi_app_secret TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS jitsi_domain TEXT DEFAULT 'meet.lealcert.com.br';

CREATE TABLE IF NOT EXISTS meetings (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'scheduled',
  room_slug TEXT NOT NULL UNIQUE,
  meeting_url TEXT NOT NULL,
  organizer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_participants (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  invitation_status TEXT NOT NULL DEFAULT 'pending',
  last_invited_at TIMESTAMPTZ,
  invitation_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, email)
);

CREATE INDEX IF NOT EXISTS meetings_organizer_idx ON meetings(organizer_user_id);
CREATE INDEX IF NOT EXISTS meetings_scheduled_at_idx ON meetings(scheduled_at);
CREATE INDEX IF NOT EXISTS meetings_status_idx ON meetings(status);
CREATE INDEX IF NOT EXISTS meeting_participants_meeting_idx ON meeting_participants(meeting_id);