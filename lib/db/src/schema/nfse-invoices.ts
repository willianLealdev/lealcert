import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";

export const nfseInvoicesTable = pgTable("nfse_invoices", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "cascade" }),
  rpsNumber: integer("rps_number"),
  ambiente: text("ambiente").notNull().default("homologacao"),
  numeroNfse: text("numero_nfse"),
  status: text("status").notNull().default("emitting"),
  errorMsg: text("error_msg"),
  pdfBase64: text("pdf_base64"),
  xmlBase64: text("xml_base64"),
  rawResponse: jsonb("raw_response"),
  valorServico: text("valor_servico"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type NfseInvoice = typeof nfseInvoicesTable.$inferSelect;
export type InsertNfseInvoice = typeof nfseInvoicesTable.$inferInsert;
