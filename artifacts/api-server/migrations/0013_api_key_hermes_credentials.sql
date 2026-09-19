ALTER TABLE "api_keys"
  ADD COLUMN IF NOT EXISTS "ai_webhook_key" text,
  ADD COLUMN IF NOT EXISTS "ai_webhook_secret_encrypted" text;