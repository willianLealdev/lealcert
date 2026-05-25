import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";

export const certificateRenewalsTable = pgTable("certificate_renewals", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => ordersTable.id),
  customerName: text("customer_name").notNull(),
  customerCpfCnpj: text("customer_cpf_cnpj").notNull(),
  customerEmail: text("customer_email"),
  certificateName: text("certificate_name").notNull(),
  garPedido: text("gar_pedido"),
  garProtocolo: text("gar_protocolo"),
  validityMonths: integer("validity_months").notNull().default(12),
  emittedAt: timestamp("emitted_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  alertSent30d: boolean("alert_sent_30d").notNull().default(false),
  alertSent7d: boolean("alert_sent_7d").notNull().default(false),
  alertSent1d: boolean("alert_sent_1d").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CertificateRenewal = typeof certificateRenewalsTable.$inferSelect;
