ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "registration_ip" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trusted_ips" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ip_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "ip" text NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "cpf_cnpj" text,
  "action" text NOT NULL,
  "country" text,
  "country_code" text,
  "city" text,
  "is_brazil" boolean DEFAULT false,
  "success" boolean DEFAULT false,
  "blocked" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ip_blocks" (
  "id" serial PRIMARY KEY NOT NULL,
  "ip" text NOT NULL UNIQUE,
  "attempts" integer NOT NULL DEFAULT 0,
  "is_banned" boolean NOT NULL DEFAULT false,
  "is_foreign" boolean NOT NULL DEFAULT false,
  "blocked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "unblock_at" timestamp with time zone,
  "unblocked_at" timestamp with time zone,
  "unblocked_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "country" text,
  "country_code" text,
  "city" text,
  "notes" text
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ip_verifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "ip" text NOT NULL,
  "code" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ip_logs_ip_idx" ON "ip_logs" ("ip");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ip_logs_created_at_idx" ON "ip_logs" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ip_logs_user_id_idx" ON "ip_logs" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ip_verifications_user_id_idx" ON "ip_verifications" ("user_id");
