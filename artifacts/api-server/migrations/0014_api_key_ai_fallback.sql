ALTER TABLE "api_keys"
  ADD COLUMN IF NOT EXISTS "ai_fallback_enabled" boolean NOT NULL DEFAULT true;