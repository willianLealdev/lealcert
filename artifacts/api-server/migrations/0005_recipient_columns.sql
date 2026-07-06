ALTER TABLE marketing_sends ADD COLUMN IF NOT EXISTS recipient_email text;
ALTER TABLE marketing_sends ADD COLUMN IF NOT EXISTS recipient_name text;
