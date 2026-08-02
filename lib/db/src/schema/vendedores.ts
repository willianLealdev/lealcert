import { pgTable, serial, integer, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const vendedoresTable = pgTable("vendedores", {
  id:              serial("id").primaryKey(),
  userId:          integer("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  /** Valor pago ao vendedor por certificado emitido pelos seus contadores */
  valorPorCert:    numeric("valor_por_cert", { precision: 10, scale: 2 }).notNull().default("5.00"),
  /** Valor do bônus fixo quando a meta de certificados é atingida */
  valorBonus:      numeric("valor_bonus", { precision: 10, scale: 2 }).notNull().default("1000.00"),
  /** Quantidade de certificados para acionar o bônus */
  qtdCertsBonus:   integer("qtd_certs_bonus").notNull().default(1000),
  /** Código de afiliado único para link de indicação */
  affiliateCode:   text("affiliate_code").notNull().unique(),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Vendedor = typeof vendedoresTable.$inferSelect;

/** Registra pagamentos de comissão realizados ao vendedor */
export const vendedorPagamentosTable = pgTable("vendedor_pagamentos", {
  id:               serial("id").primaryKey(),
  vendedorId:       integer("vendedor_id").notNull().references(() => vendedoresTable.id, { onDelete: "cascade" }),
  valor:            numeric("valor", { precision: 10, scale: 2 }).notNull(),
  dataPagamento:    timestamp("data_pagamento", { withTimezone: true }).notNull().defaultNow(),
  observacao:       text("observacao"),
  criadoPorUserId:  integer("criado_por_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VendedorPagamento = typeof vendedorPagamentosTable.$inferSelect;
