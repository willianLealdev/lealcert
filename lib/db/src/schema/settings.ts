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
  garHashVendedor: text("gar_hash_vendedor"),
  garHashTabela: text("gar_hash_tabela"),
  garFormaPagamento: text("gar_forma_pagamento").default("11"),
  garPreferirVideoconferencia: text("gar_preferir_videoconferencia").default("1"),
  // Safeweb integration
  safewebUrl: text("safeweb_url"),
  safewebUsername: text("safeweb_username"),
  safewebPassword: text("safeweb_password"),
  safewebCnpjAr: text("safeweb_cnpj_ar"),
  // Active provider
  activeProvider: text("active_provider").default("gestaoar"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
