import { pgTable, text, serial, timestamp, boolean, numeric, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { certificatesTable } from "./certificates";

export const orderStatusEnum = pgEnum("order_status", [
  "created",
  "pending_payment",
  "paid",
  "protocol_assigned",
  "completed",
  "cancelled",
]);

export const clientTypeEnum = pgEnum("client_type", ["cpf", "cnpj"]);

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  certificateId: integer("certificate_id").notNull().references(() => certificatesTable.id),
  status: orderStatusEnum("status").notNull().default("created"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  clientType: clientTypeEnum("client_type").notNull().default("cpf"),
  customerName: text("customer_name").notNull(),
  customerCpfCnpj: text("customer_cpf_cnpj").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  companyName: text("company_name"),
  inssNumber: text("inss_number"),
  cnhPath: text("cnh_path"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  protocolNumber: text("protocol_number"),
  extendedWarranty: boolean("extended_warranty").notNull().default(false),
  addressZipcode: text("address_zipcode"),
  addressStreet: text("address_street"),
  addressNumber: text("address_number"),
  addressNeighborhood: text("address_neighborhood"),
  addressCity: text("address_city"),
  addressState: text("address_state"),
  mpPreferenceId: text("mp_preference_id"),
  mpPaymentId: text("mp_payment_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
