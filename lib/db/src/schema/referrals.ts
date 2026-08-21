import { pgTable, serial, integer, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ordersTable } from "./orders";

/**
 * Crédito gerado por um certificado concluído de um contador indicado.
 * A restrição única no pedido torna o lançamento idempotente.
 */
export const referralCreditCommissionsTable = pgTable("referral_credit_commissions", {
  id: serial("id").primaryKey(),
  referrerUserId: integer("referrer_user_id").notNull().references(() => usersTable.id),
  referredUserId: integer("referred_user_id").notNull().references(() => usersTable.id),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  oneCreditPerCompletedOrder: uniqueIndex("referral_credit_commissions_order_unique").on(table.orderId),
}));

/** Registro imutável de cada uso de saldo de indicação em um certificado. */
export const referralCreditUsagesTable = pgTable("referral_credit_usages", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  oneUsePerOrder: uniqueIndex("referral_credit_usages_order_unique").on(table.orderId),
}));

export type ReferralCreditCommission = typeof referralCreditCommissionsTable.$inferSelect;
export type ReferralCreditUsage = typeof referralCreditUsagesTable.$inferSelect;