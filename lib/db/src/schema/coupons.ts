import { pgTable, text, serial, timestamp, boolean, numeric, integer, pgEnum } from "drizzle-orm/pg-core";

export const couponTypeEnum = pgEnum("coupon_type", ["percent", "fixed"]);
export const couponTargetEnum = pgEnum("coupon_target", ["all", "cliente", "contador"]);

export const couponsTable = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: couponTypeEnum("type").notNull().default("percent"),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  target: couponTargetEnum("target").notNull().default("all"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  usageLimit: integer("usage_limit"),
  perUserLimit: integer("per_user_limit"),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Coupon = typeof couponsTable.$inferSelect;
