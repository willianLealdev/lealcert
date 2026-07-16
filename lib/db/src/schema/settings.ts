import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  appName: text("app_name").notNull().default("LealCert"),
  mpAccessToken: text("mp_access_token"),
  mpPublicKey: text("mp_public_key"),
  webhookSecret: text("webhook_secret"),
  mailFrom: text("mail_from"),
  siteUrl: text("site_url"),
  scheduleOpenDays: text("schedule_open_days").default("1,2,3,4,5"),
  scheduleOpenHour: text("schedule_open_hour").default("9"),
  scheduleCloseHour: text("schedule_close_hour").default("18"),
  scheduleStepMin: text("schedule_step_min").default("60"),
  scheduleClosedDates: text("schedule_closed_dates").default(""),
  // Gestão AR integration
  garApiKey: text("gar_api_key"),
  garDocumento: text("gar_documento"),
  garHashVendedor: text("gar_hash_vendedor"),
  garHashParceiro: text("gar_hash_parceiro"),
  garHashTabela: text("gar_hash_tabela"),
  garFormaPagamento: text("gar_forma_pagamento").default("8"),
  garPreferirVideoconferencia: text("gar_preferir_videoconferencia").default("1"),
  // Safeweb integration
  safewebUrl: text("safeweb_url"),
  safewebUrlHomologacao: text("safeweb_url_homologacao"),
  safewebAmbiente: text("safeweb_ambiente").notNull().default("producao"),
  safewebUsername: text("safeweb_username"),
  safewebPassword: text("safeweb_password"),
  safewebUsernameHomologacao: text("safeweb_username_homologacao"),
  safewebPasswordHomologacao: text("safeweb_password_homologacao"),
  safewebCnpjAr: text("safeweb_cnpj_ar"),
  safewebCodigoParceiro: text("safeweb_codigo_parceiro"),
  // Active provider
  activeProvider: text("active_provider").default("gestaoar"),
  // Evolution API (WhatsApp)
  evolutionUrl: text("evolution_url"),
  evolutionApiKey: text("evolution_api_key"),
  evolutionInstance: text("evolution_instance"),
  // White-label branding
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").default("#2563eb"),
  // Contact info (shown on login page / "fale conosco")
  contactPhone: text("contact_phone"),
  contactWhatsapp: text("contact_whatsapp"),
  contactEmailSupport: text("contact_email_support"),
  contactAddress: text("contact_address"),
  // SMTP (per-installation email config — overrides env vars when set)
  smtpHostDb: text("smtp_host_db"),
  smtpPortDb: text("smtp_port_db").default("587"),
  smtpUserDb: text("smtp_user_db"),
  smtpPassDb: text("smtp_pass_db"),
  // SMTP exclusivo para e-mails de marketing (subdomínio dedicado)
  mktSmtpHostDb: text("mkt_smtp_host_db"),
  mktSmtpPortDb: text("mkt_smtp_port_db").default("587"),
  mktSmtpUserDb: text("mkt_smtp_user_db"),
  mktSmtpPassDb: text("mkt_smtp_pass_db"),
  mktMailFrom: text("mkt_mail_from"),
  // VAPID (Web Push notifications)
  vapidSubject: text("vapid_subject"),
  vapidPublicKey: text("vapid_public_key"),
  vapidPrivateKey: text("vapid_private_key"),
  // IA — assistente de vendas (provedor configurável)
  aiProvider: text("ai_provider").default("openai"),   // openai | deepseek | claude
  openaiApiKey: text("openai_api_key"),
  openaiModel: text("openai_model").default("gpt-4o-mini"),
  deepseekApiKey: text("deepseek_api_key"),
  deepseekModel: text("deepseek_model").default("deepseek-chat"),
  claudeApiKey: text("claude_api_key"),
  claudeModel: text("claude_model").default("claude-3-5-haiku-20241022"),
  // ZeroBounce — validação de emails de marketing
  zeroBounceApiKey: text("zero_bounce_api_key"),
  // NFS-e (Nota Fiscal de Serviço Eletrônica) — BrasilNFe
  nfseAmbiente: text("nfse_ambiente").default("homologacao"),          // homologacao | producao
  nfseAutoEmit: text("nfse_auto_emit").default("0"),                   // 0 = manual | 1 = automático
  nfseTokenTest: text("nfse_token_test"),                              // token API homologação
  nfseTokenProd: text("nfse_token_prod"),                              // token API produção
  nfsePrestadorCnpj: text("nfse_prestador_cnpj"),                      // CNPJ do prestador
  nfsePrestadorIm: text("nfse_prestador_im"),                          // Inscrição Municipal
  nfseServicoCodigo: text("nfse_servico_codigo").default("1.09"),      // código LC116
  nfseServicoAliquota: text("nfse_servico_aliquota").default("2"),     // alíquota ISS %
  nfseDiscriminacao: text("nfse_discriminacao").default("Emissão de Certificado Digital"),
  nfseIssRetido: text("nfse_iss_retido").default("0"),                 // 0 = não retido | 1 = retido
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
