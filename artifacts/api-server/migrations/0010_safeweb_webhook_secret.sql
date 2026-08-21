-- Segredo exclusivo para autenticar callbacks da Safeweb.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS safeweb_webhook_secret TEXT;