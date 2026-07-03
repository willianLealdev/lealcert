import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ipWhitelistTable = pgTable("ip_whitelist", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull().unique(),
  addedBy: integer("added_by").references(() => usersTable.id, { onDelete: "set null" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
  country: text("country"),
  countryCode: text("country_code"),
  city: text("city"),
});

export type IpWhitelist = typeof ipWhitelistTable.$inferSelect;
