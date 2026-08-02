import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ordersTable } from "./orders";

/** Garante idempotência: 1 slot por orderId */
export const loyaltySlotEventsTable = pgTable("loyalty_slot_events", {
  id:        serial("id").primaryKey(),
  orderId:   integer("order_id").notNull().unique().references(() => ordersTable.id),
  userId:    integer("user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LoyaltySlotEvent = typeof loyaltySlotEventsTable.$inferSelect;
