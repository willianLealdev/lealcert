import { Router } from "express";
import { db, settingsTable, nfseInvoicesTable, ordersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const BRASILNFE_BASE = "https://api.brasilnfe.com.br";
const BRASILNFE_EMIT_PATH = "/services/Fiscal/EnviarNotaFiscalServico";
const BRASILNFE_STATUS_PATH = "/services/Fiscal/BuscarNotaFiscalServico";

type BrasilNfeResponse = Record<string, unknown>;
type NfseEmissionStatus = "emitting" | "emitted" | "failed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(response: BrasilNfeResponse, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = response[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function getLoteStatus(response: BrasilNfeResponse): number | null {
  const value = response.StatusLote;
  const status = typeof value === "number" ? value : Number(value);
  return Number.isFinite(status) ? status : null;
}

function getProviderError(response: BrasilNfeResponse): string | null {
  return getString(response, "Error", "error", "Mensagem", "message", "Message");
}

function getNfseFiles(response: BrasilNfeResponse) {
  const notas = Array.isArray(response.Notas) ? response.Notas : [];
  const nota = notas.find(isRecord) ?? {};
  return {
    numeroNfse: getString(nota, "NumeroNFSe", "NumeroNfse") ?? getString(response, "NumeroNFSe", "NumeroNfse"),
    pdfBase64: getString(nota, "Base64File") ?? getString(response, "Base64File"),
    xmlBase64: getString(nota, "Base64Xml") ?? getString(response, "Base64Xml", "Base64XmlLote"),
  };
}

async function getSettings() {
  const rows = await db.select().from(settingsTable).limit(1);
  return rows[0] ?? null;
}

function getActiveToken(s: NonNullable<Awaited<ReturnType<typeof getSettings>>>) {
  return s.nfseAmbiente === "producao" ? (s.nfseTokenProd ?? "") : (s.nfseTokenTest ?? "");
}

async function brasilNfeRequest(
  path: string,
  method: "GET" | "POST" | "DELETE",
  token: string,
  body?: unknown,
): Promise<BrasilNfeResponse> {
  const res = await fetch(`${BRASILNFE_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Token": token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const rawBody = await res.text();
  const responseBody = rawBody.trim();

  if (!responseBody) {
    throw new Error(
      res.ok
        ? `BrasilNFe retornou uma resposta vazia (HTTP ${res.status}).`
        : `BrasilNFe HTTP ${res.status}: resposta vazia.`,
    );
  }

  let json: BrasilNfeResponse;
  try {
    const parsed: unknown = JSON.parse(responseBody);
    if (!isRecord(parsed)) throw new Error("Formato de resposta inválido");
    json = parsed;
  } catch {
    const detail = responseBody.replace(/\s+/g, " ").slice(0, 500);
    throw new Error(
      res.ok
        ? `BrasilNFe retornou uma resposta inválida (HTTP ${res.status}): ${detail}`
        : `BrasilNFe HTTP ${res.status}: ${detail}`,
    );
  }

  if (!res.ok) {
    throw new Error(getProviderError(json) ?? `BrasilNFe HTTP ${res.status}`);
  }
  return json;
}

async function getNextRpsNumber(): Promise<number> {
  const [last] = await db
    .select({ rps: nfseInvoicesTable.rpsNumber })
    .from(nfseInvoicesTable)
    .orderBy(desc(nfseInvoicesTable.rpsNumber))
    .limit(1);
  return (last?.rps ?? 0) + 1;
}

async function applyBrasilNfeResponse(
  invoiceId: number,
  response: BrasilNfeResponse,
): Promise<{ status: NfseEmissionStatus; error?: string }> {
  const statusLote = getLoteStatus(response);
  const providerError = getProviderError(response);

  if (statusLote === 3 || statusLote === 4) {
    const error = providerError ?? "A BrasilNFe rejeitou o lote de NFS-e.";
    await db.update(nfseInvoicesTable).set({
      status: "failed",
      errorMsg: error,
      rawResponse: response,
    }).where(eq(nfseInvoicesTable.id, invoiceId));
    return { status: "failed", error };
  }

  if (statusLote === 2) {
    await db.update(nfseInvoicesTable).set({
      status: "emitting",
      errorMsg: null,
      rawResponse: response,
    }).where(eq(nfseInvoicesTable.id, invoiceId));
    return { status: "emitting" };
  }

  const { numeroNfse, pdfBase64, xmlBase64 } = getNfseFiles(response);
  if (!numeroNfse) {
    const error = statusLote === 1
      ? "A BrasilNFe informou lote processado, mas não retornou o número da NFS-e."
      : providerError ?? "A BrasilNFe retornou uma resposta sem o status ou número da NFS-e.";
    await db.update(nfseInvoicesTable).set({
      status: "failed",
      errorMsg: error,
      rawResponse: response,
    }).where(eq(nfseInvoicesTable.id, invoiceId));
    return { status: "failed", error };
  }

  await db.update(nfseInvoicesTable).set({
    status: "emitted",
    numeroNfse,
    pdfBase64,
    xmlBase64,
    errorMsg: null,
    rawResponse: response,
  }).where(eq(nfseInvoicesTable.id, invoiceId));
  return { status: "emitted" };
}

async function syncPendingNfseInvoice(invoice: {
  id: number;
  status: string;
  rpsNumber: number | null;
  rawResponse: unknown;
}) {
  if (invoice.status !== "emitting" || !isRecord(invoice.rawResponse)) return;

  const codLote = getString(invoice.rawResponse, "CodLote", "codLote");
  if (!codLote) return;

  const s = await getSettings();
  if (!s) return;
  const token = getActiveToken(s);
  if (!token) return;

  try {
    const response = await brasilNfeRequest(BRASILNFE_STATUS_PATH, "POST", token, {
      codLote,
      Rps: invoice.rpsNumber ? [String(invoice.rpsNumber)] : [],
    });
    const outcome = await applyBrasilNfeResponse(invoice.id, response);
    logger.info({ invoiceId: invoice.id, codLote, status: outcome.status }, "Status da NFS-e sincronizado");
  } catch (err) {
    logger.warn({ err, invoiceId: invoice.id, codLote }, "Não foi possível sincronizar NFS-e pendente");
  }
}

export async function emitNfseForOrder(
  orderId: number,
): Promise<{ invoiceId: number; status: Exclude<NfseEmissionStatus, "failed"> }> {
  const s = await getSettings();
  if (!s) throw new Error("Configurações não encontradas.");

  const token = getActiveToken(s);
  if (!token) throw new Error("Token BrasilNFe não configurado.");
  if (!s.nfsePrestadorCnpj) throw new Error("CNPJ do prestador não configurado.");
  if (!s.nfsePrestadorIm) throw new Error("Inscrição Municipal não configurada.");

  const [orderRow] = await db
    .select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!orderRow) throw new Error("Pedido não encontrado.");
  if (orderRow.status !== "completed") {
    throw new Error("Pedido não concluído. A nota será emitida assim que o certificado estiver como concluído.");
  }

  const existing = await db
    .select().from(nfseInvoicesTable)
    .where(and(
      eq(nfseInvoicesTable.orderId, orderId),
      eq(nfseInvoicesTable.status, "emitted"),
    ))
    .limit(1);
  if (existing.length > 0) throw new Error("Nota fiscal já emitida para este pedido.");

  const rpsNumber = await getNextRpsNumber();
  const ambiente = s.nfseAmbiente ?? "homologacao";
  const valorServico = parseFloat(String(orderRow.total ?? 0));
  const aliquota = parseFloat(s.nfseServicoAliquota ?? "2");

  const [invoice] = await db.insert(nfseInvoicesTable).values({
    orderId,
    rpsNumber,
    ambiente,
    status: "emitting",
    valorServico: String(valorServico),
  }).returning();

  try {
    const tomadorCpfCnpj = (orderRow.customerCpfCnpj ?? "").replace(/\D/g, "");
    const dataEmissao = new Date().toISOString().split("T")[0];

    const payload = {
      TipoAmbiente: ambiente === "producao" ? 1 : 2,
      Lote: rpsNumber,
      nFSInfo: [{
        NumeroRps: rpsNumber,
        DataCompetencia: dataEmissao,
        Tomador: {
          CpfCnpj: tomadorCpfCnpj,
          RazaoSocial: orderRow.customerName ?? "Cliente",
          Email: orderRow.customerEmail ?? "",
        },
        Servico: {
          Descricao: orderRow.certNameSnapshot ?? s.nfseDiscriminacao ?? "Emissão de Certificado Digital",
          CodServico: s.nfseServicoCodigo ?? "1.09",
          Valores: {
            ValorServico: valorServico,
            Aliquota: aliquota,
            IssRetido: s.nfseIssRetido === "1",
          },
        },
      }],
    };

    const response = await brasilNfeRequest(BRASILNFE_EMIT_PATH, "POST", token, payload);
    const outcome = await applyBrasilNfeResponse(invoice.id, response);
    if (outcome.status === "failed") throw new Error(outcome.error);

    logger.info({ orderId, rpsNumber, ambiente, status: outcome.status }, "NFS-e enviada à BrasilNFe");
    return { invoiceId: invoice.id, status: outcome.status };
  } catch (err) {
    const errorMsg = (err as Error).message;
    await db.update(nfseInvoicesTable).set({
      status: "failed",
      errorMsg,
    }).where(eq(nfseInvoicesTable.id, invoice.id));
    logger.error({ err, orderId, rpsNumber }, "NFS-e falhou");
    throw err;
  }
}

router.post("/nfse/emit/:orderId", requireAdmin, async (req, res): Promise<void> => {
  const orderId = parseInt(String(req.params["orderId"]), 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "ID inválido." }); return; }
  try {
    const result = await emitNfseForOrder(orderId);
    const [invoice] = await db
      .select()
      .from(nfseInvoicesTable)
      .where(eq(nfseInvoicesTable.id, result.invoiceId))
      .limit(1);
    res.json({ ok: true, invoice, processing: result.status === "emitting" });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get("/nfse", requireAdmin, async (req, res): Promise<void> => {
  const { status, orderId } = req.query as Record<string, string>;
  let rows = await db
    .select()
    .from(nfseInvoicesTable)
    .orderBy(desc(nfseInvoicesTable.createdAt));

  if (status) rows = rows.filter(r => r.status === status);
  if (orderId) rows = rows.filter(r => r.orderId === parseInt(orderId, 10));

  res.json(rows.map(r => ({
    id: r.id,
    orderId: r.orderId,
    rpsNumber: r.rpsNumber,
    ambiente: r.ambiente,
    numeroNfse: r.numeroNfse,
    status: r.status,
    errorMsg: r.errorMsg,
    valorServico: r.valorServico,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    hasPdf: !!r.pdfBase64,
    hasXml: !!r.xmlBase64,
  })));
});

router.get("/nfse/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  const [invoice] = await db.select().from(nfseInvoicesTable).where(eq(nfseInvoicesTable.id, id)).limit(1);
  if (!invoice) { res.status(404).json({ error: "Nota não encontrada." }); return; }
  res.json({
    id: invoice.id,
    orderId: invoice.orderId,
    rpsNumber: invoice.rpsNumber,
    ambiente: invoice.ambiente,
    numeroNfse: invoice.numeroNfse,
    status: invoice.status,
    errorMsg: invoice.errorMsg,
    valorServico: invoice.valorServico,
    rawResponse: invoice.rawResponse,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
    hasPdf: !!invoice.pdfBase64,
    hasXml: !!invoice.xmlBase64,
  });
});

router.get("/nfse/:id/pdf", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  const [invoice] = await db.select({ pdfBase64: nfseInvoicesTable.pdfBase64, orderId: nfseInvoicesTable.orderId, numeroNfse: nfseInvoicesTable.numeroNfse })
    .from(nfseInvoicesTable).where(eq(nfseInvoicesTable.id, id)).limit(1);
  if (!invoice) { res.status(404).json({ error: "Nota não encontrada." }); return; }
  if (!invoice.pdfBase64) { res.status(404).json({ error: "PDF não disponível." }); return; }
  const buf = Buffer.from(invoice.pdfBase64, "base64");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="nfse-${invoice.numeroNfse ?? id}.pdf"`);
  res.send(buf);
});

router.get("/nfse/:id/xml", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  const [invoice] = await db.select({ xmlBase64: nfseInvoicesTable.xmlBase64, orderId: nfseInvoicesTable.orderId, numeroNfse: nfseInvoicesTable.numeroNfse })
    .from(nfseInvoicesTable).where(eq(nfseInvoicesTable.id, id)).limit(1);
  if (!invoice) { res.status(404).json({ error: "Nota não encontrada." }); return; }
  if (!invoice.xmlBase64) { res.status(404).json({ error: "XML não disponível." }); return; }
  const buf = Buffer.from(invoice.xmlBase64, "base64");
  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Content-Disposition", `attachment; filename="nfse-${invoice.numeroNfse ?? id}.xml"`);
  res.send(buf);
});

router.delete("/nfse/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  const [invoice] = await db.select().from(nfseInvoicesTable).where(eq(nfseInvoicesTable.id, id)).limit(1);
  if (!invoice) { res.status(404).json({ error: "Nota não encontrada." }); return; }
  if (invoice.status !== "emitted") { res.status(400).json({ error: "Apenas notas emitidas podem ser canceladas." }); return; }

  const s = await getSettings();
  if (!s) { res.status(500).json({ error: "Configurações não encontradas." }); return; }
  const token = getActiveToken(s);

  try {
    await brasilNfeRequest("/v1/nfse/cancelar", "POST", token, {
      NumeroNFSe: invoice.numeroNfse,
      Motivo: (req.body as { motivo?: string })?.motivo ?? "Cancelamento solicitado pelo emissor",
    });
    await db.update(nfseInvoicesTable).set({ status: "cancelled" }).where(eq(nfseInvoicesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get("/nfse/order/:orderId", requireAuth, async (req, res): Promise<void> => {
  const orderId = parseInt(String(req.params["orderId"]), 10);
  let invoices = await db
    .select()
    .from(nfseInvoicesTable)
    .where(eq(nfseInvoicesTable.orderId, orderId))
    .orderBy(desc(nfseInvoicesTable.createdAt));

  await Promise.all(invoices.map(syncPendingNfseInvoice));
  invoices = await db
    .select()
    .from(nfseInvoicesTable)
    .where(eq(nfseInvoicesTable.orderId, orderId))
    .orderBy(desc(nfseInvoicesTable.createdAt));

  res.json(invoices.map(r => ({
    id: r.id,
    orderId: r.orderId,
    rpsNumber: r.rpsNumber,
    ambiente: r.ambiente,
    numeroNfse: r.numeroNfse,
    status: r.status,
    errorMsg: r.errorMsg,
    valorServico: r.valorServico,
    createdAt: r.createdAt,
    hasPdf: !!r.pdfBase64,
    hasXml: !!r.xmlBase64,
  })));
});

export default router;
