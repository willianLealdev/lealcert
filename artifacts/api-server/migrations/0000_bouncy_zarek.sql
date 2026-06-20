CREATE TYPE "public"."role" AS ENUM('admin', 'contador');--> statement-breakpoint
CREATE TYPE "public"."client_type" AS ENUM('cpf', 'cnpj');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('created', 'pending_payment', 'paid', 'protocol_assigned', 'aguardando_validacao', 'emitido', 'revogado', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'closed');--> statement-breakpoint
CREATE TYPE "public"."coupon_target" AS ENUM('all', 'cliente', 'contador');--> statement-breakpoint
CREATE TYPE "public"."coupon_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"cpf_cnpj" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'contador' NOT NULL,
	"user_type" text DEFAULT 'cliente' NOT NULL,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_verification_code" text,
	"email_verification_expires_at" timestamp with time zone,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"password_reset_token" text,
	"password_reset_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_cpf_cnpj_unique" UNIQUE("cpf_cnpj")
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"gar_hash_produto" text,
	"safeweb_id_produto" text,
	"price_contador" numeric(10, 2),
	"validity_months" integer DEFAULT 12 NOT NULL,
	"product" text,
	"issuance_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"slot_datetime" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slots_slot_datetime_unique" UNIQUE("slot_datetime")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"user_id" integer NOT NULL,
	"certificate_id" integer NOT NULL,
	"status" "order_status" DEFAULT 'created' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"client_type" "client_type" DEFAULT 'cpf' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_cpf_cnpj" text NOT NULL,
	"customer_email" text,
	"customer_phone" text,
	"customer_birth_date" text,
	"has_psbio" boolean,
	"company_name" text,
	"inss_number" text,
	"cnh_path" text,
	"cartao_cnpj_path" text,
	"ficha_cadastral_path" text,
	"scheduled_at" timestamp with time zone,
	"protocol_number" text,
	"extended_warranty" boolean DEFAULT false NOT NULL,
	"address_zipcode" text,
	"address_street" text,
	"address_number" text,
	"address_complement" text,
	"address_neighborhood" text,
	"address_city" text,
	"address_state" text,
	"representante_address_zipcode" text,
	"representante_address_street" text,
	"representante_address_number" text,
	"representante_address_complement" text,
	"representante_address_neighborhood" text,
	"representante_address_city" text,
	"representante_address_state" text,
	"chat_documents" text,
	"mp_preference_id" text,
	"mp_payment_id" text,
	"gar_pedido" text,
	"gar_protocolo" text,
	"gar_hash_venda" text,
	"gar_status" text,
	"gar_agendamento_link" text,
	"gar_synced_at" timestamp with time zone,
	"gar_agendamento_local_nome" text,
	"gar_agendamento_local_hash" text,
	"gar_agendamento_slot_hash" text,
	"gar_agendamento_data_hora" text,
	"representante_cpf" text,
	"representante_nascimento" text,
	"customer_cei" text,
	"customer_nis" text,
	"representante_doc_tipo" text,
	"representante_doc_numero" text,
	"representante_doc_emissor" text,
	"safeweb_solicitacao_id" text,
	"safeweb_status" text,
	"safeweb_synced_at" timestamp with time zone,
	"safeweb_agendamento_id" text,
	"safeweb_agendamento_data_hora" text,
	"safeweb_agendamento_local_nome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificate_renewals" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"customer_name" text NOT NULL,
	"customer_cpf_cnpj" text NOT NULL,
	"customer_email" text,
	"certificate_name" text NOT NULL,
	"gar_pedido" text,
	"gar_protocolo" text,
	"validity_months" integer DEFAULT 12 NOT NULL,
	"emitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"alert_sent_30d" boolean DEFAULT false NOT NULL,
	"alert_sent_7d" boolean DEFAULT false NOT NULL,
	"alert_sent_1d" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"subject" text NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"unread_admin" boolean DEFAULT true NOT NULL,
	"unread_client" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_name" text DEFAULT 'LealCert' NOT NULL,
	"mp_access_token" text,
	"mp_public_key" text,
	"webhook_secret" text,
	"mail_from" text,
	"site_url" text,
	"schedule_open_days" text DEFAULT '1,2,3,4,5',
	"schedule_open_hour" text DEFAULT '9',
	"schedule_close_hour" text DEFAULT '18',
	"schedule_step_min" text DEFAULT '60',
	"schedule_closed_dates" text DEFAULT '',
	"gar_api_key" text,
	"gar_hash_vendedor" text,
	"gar_hash_tabela" text,
	"gar_forma_pagamento" text DEFAULT '11',
	"gar_preferir_videoconferencia" text DEFAULT '1',
	"safeweb_url" text,
	"safeweb_url_homologacao" text,
	"safeweb_ambiente" text DEFAULT 'producao' NOT NULL,
	"safeweb_username" text,
	"safeweb_password" text,
	"safeweb_username_homologacao" text,
	"safeweb_password_homologacao" text,
	"safeweb_cnpj_ar" text,
	"safeweb_codigo_parceiro" text,
	"active_provider" text DEFAULT 'gestaoar',
	"evolution_url" text,
	"evolution_api_key" text,
	"evolution_instance" text,
	"logo_url" text,
	"primary_color" text DEFAULT '#2563eb',
	"contact_phone" text,
	"contact_whatsapp" text,
	"contact_email_support" text,
	"contact_address" text,
	"smtp_host_db" text,
	"smtp_port_db" text DEFAULT '587',
	"smtp_user_db" text,
	"smtp_pass_db" text,
	"vapid_subject" text,
	"vapid_public_key" text,
	"vapid_private_key" text,
	"ai_provider" text DEFAULT 'openai',
	"openai_api_key" text,
	"openai_model" text DEFAULT 'gpt-4o-mini',
	"deepseek_api_key" text,
	"deepseek_model" text DEFAULT 'deepseek-chat',
	"claude_api_key" text,
	"claude_model" text DEFAULT 'claude-3-5-haiku-20241022',
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" "coupon_type" DEFAULT 'percent' NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"target" "coupon_target" DEFAULT 'all' NOT NULL,
	"expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text,
	"from_name" text DEFAULT 'LealCert Marketing' NOT NULL,
	"from_email" text DEFAULT 'mkt@lealcert.com.br' NOT NULL,
	"reply_to" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_delivered" integer DEFAULT 0 NOT NULL,
	"total_opened" integer DEFAULT 0 NOT NULL,
	"total_clicked" integer DEFAULT 0 NOT NULL,
	"total_bounced" integer DEFAULT 0 NOT NULL,
	"total_replied" integer DEFAULT 0 NOT NULL,
	"filter_tags" text,
	"target_type" text DEFAULT 'all' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'cliente' NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"tags" text,
	"status" text DEFAULT 'active' NOT NULL,
	"email_status" text DEFAULT 'unknown' NOT NULL,
	"email_invalid_reason" text,
	"email_validated_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"bounced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_contacts_email_type_unique" UNIQUE("email","type")
);
--> statement-breakpoint
CREATE TABLE "marketing_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"send_id" integer,
	"contact_id" integer,
	"from_email" text NOT NULL,
	"from_name" text,
	"subject" text,
	"body_text" text,
	"body_html" text,
	"read_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"reply_body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"contact_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"opened_at" timestamp with time zone,
	"open_count" integer DEFAULT 0 NOT NULL,
	"clicked_at" timestamp with time zone,
	"click_count" integer DEFAULT 0 NOT NULL,
	"tracking_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_sends_tracking_token_unique" UNIQUE("tracking_token"),
	CONSTRAINT "marketing_sends_campaign_id_contact_id_unique" UNIQUE("campaign_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "marketing_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_renewals" ADD CONSTRAINT "certificate_renewals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_replies" ADD CONSTRAINT "marketing_replies_send_id_marketing_sends_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."marketing_sends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_replies" ADD CONSTRAINT "marketing_replies_contact_id_marketing_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."marketing_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_sends" ADD CONSTRAINT "marketing_sends_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_sends" ADD CONSTRAINT "marketing_sends_contact_id_marketing_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."marketing_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;