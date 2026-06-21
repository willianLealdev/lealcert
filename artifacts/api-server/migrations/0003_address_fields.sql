ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "person_type" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "company_cnpj" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "company_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "company_fantasy_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "responsible_cpf" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "responsible_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "zip_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "street" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_number" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "complement" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "neighborhood" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "city" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_state" text;
