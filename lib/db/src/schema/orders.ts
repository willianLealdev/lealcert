import { pgTable, text, serial, timestamp, boolean, numeric, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { certificatesTable } from "./certificates";
import { couponsTable } from "./coupons";

export const orderStatusEnum = pgEnum("order_status", [
  "created",
  "pending_payment",
  "paid",
  "protocol_assigned",
  "aguardando_validacao",
  "emitido",
  "revogado",
  "completed",
  "cancelled",
]);

export const clientTypeEnum = pgEnum("client_type", ["cpf", "cnpj"]);

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  /** Operador que efetuou a compra em nome da conta do contador. */
  operatorId: integer("operator_id").references(() => usersTable.id, { onDelete: "set null" }),
  certificateId: integer("certificate_id").references(() => certificatesTable.id, { onDelete: "set null" }),
  status: orderStatusEnum("status").notNull().default("created"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  clientType: clientTypeEnum("client_type").notNull().default("cpf"),
  customerName: text("customer_name").notNull(),
  customerCpfCnpj: text("customer_cpf_cnpj").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  customerBirthDate: text("customer_birth_date"),
  hasPsbio: boolean("has_psbio"),
  companyName: text("company_name"),
  inssNumber: text("inss_number"),
  cnhPath: text("cnh_path"),
  cnhVersoPath: text("cnh_verso_path"),
  cartaoCnpjPath: text("cartao_cnpj_path"),
  fichaCadastralPath: text("ficha_cadastral_path"),
  outrosPath: text("outros_path"),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  protocolNumber: text("protocol_number"),
  extendedWarranty: boolean("extended_warranty").notNull().default(false),
  lealPlusPrice: text("leal_plus_price"),
  addressZipcode: text("address_zipcode"),
  addressStreet: text("address_street"),
  addressNumber: text("address_number"),
  addressComplement: text("address_complement"),
  addressNeighborhood: text("address_neighborhood"),
  addressCity: text("address_city"),
  addressState: text("address_state"),
  addressIbge: text("address_ibge"),
  // Endereço do representante legal / titular (obrigatório para Safeweb Titular_*)
  representanteAddressZipcode: text("representante_address_zipcode"),
  representanteAddressStreet: text("representante_address_street"),
  representanteAddressNumber: text("representante_address_number"),
  representanteAddressComplement: text("representante_address_complement"),
  representanteAddressNeighborhood: text("representante_address_neighborhood"),
  representanteAddressCity: text("representante_address_city"),
  representanteAddressState: text("representante_address_state"),
  chatDocuments: text("chat_documents"),
  mpPreferenceId: text("mp_preference_id"),
  mpPaymentId: text("mp_payment_id"),
  mpBoletoUrl: text("mp_boleto_url"),
  mpBoletoBarcode: text("mp_boleto_barcode"),
  // Gestão AR integration fields
  garPedido: text("gar_pedido"),
  garProtocolo: text("gar_protocolo"),
  garHashVenda: text("gar_hash_venda"),
  garStatus: text("gar_status"),
  garAgendamentoLink: text("gar_agendamento_link"),
  garHopeUploadUrl: text("gar_hope_upload_url"),
  garDocsConfirmed: boolean("gar_docs_confirmed").default(false),
  garSyncedAt: timestamp("gar_synced_at", { withTimezone: true }),
  // GAR scheduling (booked inside the panel)
  garAgendamentoLocalNome: text("gar_agendamento_local_nome"),
  garAgendamentoLocalHash: text("gar_agendamento_local_hash"),
  garAgendamentoSlotHash: text("gar_agendamento_slot_hash"),
  garAgendamentoDataHora: text("gar_agendamento_data_hora"),
  // Representante Legal (obrigatório para e-CNPJ na Safeweb)
  representanteCpf: text("representante_cpf"),
  representanteNascimento: text("representante_nascimento"),
  // CEI e NIS do titular (opcional — e-CPF max 12/11 chars; e-CNPJ max 11/9 chars)
  customerCei: text("customer_cei"),
  customerNis: text("customer_nis"),
  // Documento de identificação do representante (0=Não Informado, 1=RG, 2=RNE, 3=Passaporte, 4=CNH)
  representanteDocTipo: text("representante_doc_tipo"),
  representanteDocNumero: text("representante_doc_numero"),
  representanteDocEmissor: text("representante_doc_emissor"),
  // Nota Fiscal
  nfCnpj: text("nf_cnpj"),
  nfNome: text("nf_nome"),
  nfZipcode: text("nf_zipcode"),
  nfStreet: text("nf_street"),
  nfNumber: text("nf_number"),
  nfComplement: text("nf_complement"),
  nfNeighborhood: text("nf_neighborhood"),
  nfCity: text("nf_city"),
  nfState: text("nf_state"),
  // Snapshot do certificado no momento da criação do pedido
  // Garante que nome e tipo fiquem preservados mesmo se o catálogo for alterado/excluído
  couponId: integer("coupon_id").references(() => couponsTable.id, { onDelete: "set null" }),
  certNameSnapshot: text("cert_name_snapshot"),
  certProductSnapshot: text("cert_product_snapshot"),
  // Safeweb integration fields
  safewebSolicitacaoId: text("safeweb_solicitacao_id"),
  safewebStatus: text("safeweb_status"),
  safewebSyncedAt: timestamp("safeweb_synced_at", { withTimezone: true }),
  // Safeweb scheduling (booked inside the panel)
  safewebAgendamentoId: text("safeweb_agendamento_id"),
  safewebAgendamentoDataHora: text("safeweb_agendamento_data_hora"),
  safewebAgendamentoLocalNome: text("safeweb_agendamento_local_nome"),
  // Método de pagamento utilizado (pix | boleto | cartao | cortesia)
  paymentMethod: text("payment_method"),
  /** Créditos de indicação consumidos neste pedido (mantém total do produto para auditoria). */
  referralCreditUsed: numeric("referral_credit_used", { precision: 10, scale: 2 }).notNull().default("0.00"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
