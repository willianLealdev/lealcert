import { pgTable, text, serial, timestamp, boolean, pgEnum, jsonb, integer, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type UserType = "contador" | "cliente";

export const roleEnum = pgEnum("role", ["admin", "contador", "agente", "vendedor", "operador"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique(),
  cpfCnpj: text("cpf_cnpj").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("contador"),
  userType: text("user_type").notNull().default("cliente"),
  phone: text("phone").unique(),
  isActive: boolean("is_active").notNull().default(true),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationCode: text("email_verification_code"),
  emailVerificationExpiresAt: timestamp("email_verification_expires_at", { withTimezone: true }),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpiresAt: timestamp("password_reset_expires_at", { withTimezone: true }),
  crcNumber: text("crc_number"),
  crcVerified: boolean("crc_verified").notNull().default(false),
  // Pessoa física ou jurídica
  personType: text("person_type"),
  // Campos pessoa jurídica
  companyCnpj: text("company_cnpj"),
  companyName: text("company_name"),
  companyFantasyName: text("company_fantasy_name"),
  // Responsável técnico (contador PJ)
  responsibleCpf: text("responsible_cpf"),
  responsibleName: text("responsible_name"),
  // Endereço
  zipCode: text("zip_code"),
  street: text("street"),
  addressNumber: text("address_number"),
  complement: text("complement"),
  neighborhood: text("neighborhood"),
  city: text("city"),
  addressState: text("address_state"),
  registrationIp: text("registration_ip"),
  trustedIps: jsonb("trusted_ips").$type<string[]>().default([]),
  /** ID do vendedor que cadastrou este contador (null = cadastro direto) */
  vendedorId: integer("vendedor_id"),
  /** Conta de contador responsável por este operador (null para demais perfis) */
  contadorId: integer("contador_id").references((): AnyPgColumn => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
