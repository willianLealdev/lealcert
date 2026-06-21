import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ipBlocksTable = pgTable("ip_blocks", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull().unique(),
  attempts: integer("attempts").notNull().default(0),
  isBanned: boolean("is_banned").notNull().default(false),
  isForeign: boolean("is_foreign").notNull().default(false),
  blockedAt: timestamp("blocked_at", { withTimezone: true }).notNull().defaultNow(),
  unblockAt: timestamp("unblock_at", { withTimezone: true }),
  unblockedAt: timestamp("unblocked_at", { withTimezone: true }),
  unblockedBy: integer("unblocked_by").references(() => usersTable.id, { onDelete: "set null" }),
  country: text("country"),
  countryCode: text("country_code"),
  city: text("city"),
  notes: text("notes"),
});

export type IpBlock = typeof ipBlocksTable.$inferSelect;
