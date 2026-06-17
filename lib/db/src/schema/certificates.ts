import { pgTable, text, serial, timestamp, boolean, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const certificatesTable = pgTable("certificates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0.00"),
  active: boolean("active").notNull().default(true),
  garHashProduto: text("gar_hash_produto"),
  safewebIdProduto: text("safeweb_id_produto"),
  priceContador: numeric("price_contador", { precision: 10, scale: 2 }),
  validityMonths: integer("validity_months").notNull().default(12),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCertificateSchema = createInsertSchema(certificatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCertificate = z.infer<typeof insertCertificateSchema>;
export type Certificate = typeof certificatesTable.$inferSelect;
