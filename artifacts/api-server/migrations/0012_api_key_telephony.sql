ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS telephony_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_webhook_url text;

UPDATE api_keys
SET telephony_capabilities = '["analyze","brain","command"]'::jsonb
WHERE scopes @> '["discagem"]'::jsonb
  AND telephony_capabilities = '[]'::jsonb;

ALTER TABLE discagem_calls
  ADD COLUMN IF NOT EXISTS system_prompt_used text,
  ADD COLUMN IF NOT EXISTS ai_source text,
  ADD COLUMN IF NOT EXISTS interest_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS end_reason text,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS callback_at timestamptz,
  ADD COLUMN IF NOT EXISTS human_task text;