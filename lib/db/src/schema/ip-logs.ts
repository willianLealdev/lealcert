import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ipLogsTable = pgTable("ip_logs", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  cpfCnpj: text("cpf_cnpj"),
  action: text("action").notNull(),
  country: text("country"),
  countryCode: text("country_code"),
  city: text("city"),
  isBrazil: boolean("is_brazil").default(false),
  success: boolean("success").default(false),
  blocked: boolean("blocked").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type IpLog = typeof ipLogsTable.$inferSelect;
