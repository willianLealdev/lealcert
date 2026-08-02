import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const loyaltyCartelasTable = pgTable("loyalty_cartelas", {
  id:              serial("id").primaryKey(),
  userId:          integer("user_id").notNull().references(() => usersTable.id),
  /** 0–10: quantos slots estão preenchidos */
  slots:           integer("slots").notNull().default(0),
  /** active | completed | used */
  status:          text("status").notNull().default("active"),
  createdAt:       timestamp("created_at",    { withTimezone: true }).notNull().defaultNow(),
  completedAt:     timestamp("completed_at",  { withTimezone: true }),
  usedAt:          timestamp("used_at",       { withTimezone: true }),
  /** id do pedido que utilizou esta cortesia */
  usedForOrderId:  integer("used_for_order_id"),
});

export type LoyaltyCartela = typeof loyaltyCartelasTable.$inferSelect;
