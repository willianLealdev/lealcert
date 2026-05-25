import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";

export const orderEventsTable = pgTable("order_events", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  description: text("description").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrderEvent = typeof orderEventsTable.$inferSelect;
