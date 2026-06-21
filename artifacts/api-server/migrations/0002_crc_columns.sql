ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "crc_number" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "crc_verified" boolean DEFAULT false NOT NULL;
