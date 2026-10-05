import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const selectResults: Row[][] = [];
const updates: Array<Record<string, unknown>> = [];
const creditReferralForCompletedOrder = vi.fn();
const logEvent = vi.fn();
const notifyOrderStatus = vi.fn().mockResolvedValue(undefined);

function selectChain(result: Row[] = []) {
  const value: Record<string, unknown> & PromiseLike<Row[]> = {
    from: () => value,
    innerJoin: () => value,
    leftJoin: () => value,
    where: () => value,
    limit: (count: number) => Promise.resolve(result.slice(0, count)),
    then: <TResult1 = Row[], TResult2 = never>(
      resolve?: ((rows: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(resolve, reject ?? undefined) as PromiseLike<TResult1 | TResult2>,
  };
  return value;
}

const db = {
  select: vi.fn(() => selectChain(selectResults.shift() ?? [])),
  update: vi.fn(() => ({
    set: (values: Record<string, unknown>) => {
      updates.push(values);
      return { where: vi.fn().mockResolvedValue(undefined) };
    },
  })),
  insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) })) })),
};

vi.mock("@workspace/db", () => ({
  db,
  settingsTable: {},
  marketingCampaignsTable: { id: "campaigns.id", status: "campaigns.status", scheduledAt: "campaigns.scheduled_at" },
  ordersTable: {
    id: "orders.id", userId: "orders.user_id", status: "orders.status",
    certificateId: "orders.certificate_id", safewebSolicitacaoId: "orders.safeweb_solicitacao_id",
    garPedido: "orders.gar_pedido", garProtocolo: "orders.gar_protocolo",
  },
  certificatesTable: { id: "certificates.id", name: "certificates.name", validityMonths: "certificates.validity_months" },
  usersTable: { id: "users.id" },
  certificateRenewalsTable: {},
}));

vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../lib/referrals", () => ({ creditReferralForCompletedOrder }));
vi.mock("../lib/order-events", () => ({
  logEvent,
  isGarStatusEmitido: (status: string) => status.toLowerCase() === "emitido",
}));
vi.mock("../lib/notify", () => ({ notifyOrderStatus }));
vi.mock("../lib/loyalty", () => ({ incrementLoyaltySlot: vi.fn() }));
vi.mock("../lib/gestaoar", () => ({
  garConsultarStatus: vi.fn().mockResolvedValue({ StatusPedido: "Emitido", Protocolo: "GAR-900" }),
}));
vi.mock("../lib/gar-auto", () => ({ emitirProtocoloEHope: vi.fn() }));
vi.mock("../routes/marketing", () => ({ dispatchCampaign: vi.fn() }));
vi.mock("../lib/email", () => ({ sendDailySalesReport: vi.fn() }));
vi.mock("../lib/imap-poller", () => ({ startImapPoller: vi.fn() }));

async function webhook(path: string, body: Record<string, unknown>, expectedStatus = 200) {
  const { default: safewebRouter } = await import("../routes/safeweb");
  const app = express();
  app.use(express.json());
  app.use(safewebRouter);
  return request(app).post(path).send(body).expect(expectedStatus);
}

describe("certificate completion referral integrations", () => {
  beforeEach(() => {
    selectResults.length = 0;
    updates.length = 0;
    vi.clearAllMocks();
  });

  it("concludes a GAR-issued order and creates its referral credit", async () => {
    selectResults.push(
      [{ garApiKey: "homologation-key", activeProvider: "gestaoar" }],
      [{
        id: 900,
        status: "protocol_assigned",
        garPedido: "PED-900",
        garProtocolo: "GAR-900",
        customerEmail: null,
        customerPhone: null,
        customerName: "Conta de homologação",
        orderNumber: "LC-900",
        userId: null,
        paymentMethod: "pix",
      }],
      [],
    );
    const { syncGarProtocols } = await import("../lib/scheduler");

    await syncGarProtocols();

    expect(updates).toContainEqual(expect.objectContaining({ status: "completed", garProtocolo: "GAR-900" }));
    expect(creditReferralForCompletedOrder).toHaveBeenCalledTimes(1);
    expect(creditReferralForCompletedOrder).toHaveBeenCalledWith(900);
  });

  it("concludes an order from the typed Safeweb event URL and creates one credit", async () => {
    selectResults.push(
      [{ safewebWebhookSecret: "safeweb-homologation-secret" }],
      [{
      order: {
        id: 701, status: "paid", safewebSolicitacaoId: "SW-701",
        total: "100.00", customerEmail: null, customerPhone: null,
        customerName: "Conta de homologação", orderNumber: "LC-701",
        userId: null, paymentMethod: "pix",
      },
      certName: "e-CNPJ A1",
      }],
    );

    await webhook("/safeweb/eventos/emissao?secret=safeweb-homologation-secret", { IdSolicitacao: "SW-701", Status: "Emitido" });

    await vi.waitFor(() => expect(creditReferralForCompletedOrder).toHaveBeenCalledWith(701));
    expect(updates).toContainEqual(expect.objectContaining({ status: "completed" }));
  });

  it("concludes an order from the UrlSolicitacao webhook and creates one credit", async () => {
    selectResults.push(
      [{ safewebWebhookSecret: "safeweb-homologation-secret" }],
      [{
      order: {
        id: 702, status: "paid", safewebSolicitacaoId: "SW-702",
        total: "100.00", customerEmail: null, customerPhone: null,
        customerName: "Conta de homologação", orderNumber: "LC-702",
        userId: null, paymentMethod: "pix",
      },
      certName: "e-CNPJ A1",
      }],
    );

    await webhook("/safeweb/eventos/webhook?secret=safeweb-homologation-secret", { IdSolicitacao: "SW-702", Tipo: "emissao", Status: "Emitido" });

    await vi.waitFor(() => expect(creditReferralForCompletedOrder).toHaveBeenCalledWith(702));
    expect(creditReferralForCompletedOrder).toHaveBeenCalledTimes(1);
    expect(updates).toContainEqual(expect.objectContaining({ status: "completed" }));
  });

  it("rejects an unsigned Safeweb callback before it can complete or credit an order", async () => {
    selectResults.push([{ safewebWebhookSecret: "safeweb-homologation-secret" }]);

    await webhook("/safeweb/eventos/webhook", { IdSolicitacao: "SW-703", Tipo: "emissao" }, 401);

    expect(updates).toHaveLength(0);
    expect(creditReferralForCompletedOrder).not.toHaveBeenCalled();
  });
});