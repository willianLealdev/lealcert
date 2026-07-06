ALTER TABLE "marketing_campaigns" ADD COLUMN IF NOT EXISTS "total_contacts" integer NOT NULL DEFAULT 0;
