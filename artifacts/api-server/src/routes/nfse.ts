import { Router } from "express";
import { db, settingsTable, nfseInvoicesTable, ordersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const BRASILNFE_BASE = "https://api.brasilnfe.com.br";

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
) {
  const res = await fetch(`${BRASILNFE_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Token": token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(json?.message as string ?? json?.error as string ?? `BrasilNFe HTTP ${res.status}`);
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

export async function emitNfseForOrder(orderId: number): Promise<void> {
  const s = await getSettings();
  if (!s) throw new Error("Configurações não encontradas.");

  const token = getActiveToken(s);
  if (!token) throw new Error("Token BrasilNFe não configurado.");
  if (!s.nfsePrestadorCnpj) throw new Error("CNPJ do prestador não configurado.");
  if (!s.nfsePrestadorIm) throw new Error("Inscrição Municipal não configurada.");

  const [orderRow] = await db
    .select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!orderRow) throw new Error("Pedido não encontrado.");

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
  const valorServico = parseFloat(String(orderRow.totalAmount ?? orderRow.price ?? 0));
  const aliquota = parseFloat(s.nfseServicoAliquota ?? "2");

  const [invoice] = await db.insert(nfseInvoicesTable).values({
    orderId,
    rpsNumber,
    ambiente,
    status: "emitting",
    valorServico: String(valorServico),
  }).returning();

  try {
    const tomadorCpfCnpj = (orderRow.customerCpfCnpj ?? orderRow.customerCpf ?? "").replace(/\D/g, "");
    const dataEmissao = new Date().toISOString().split("T")[0];

    const payload = {
      Prestador: {
        Cnpj: s.nfsePrestadorCnpj.replace(/\D/g, ""),
        InscricaoMunicipal: s.nfsePrestadorIm,
      },
      Tomador: {
        CpfCnpj: tomadorCpfCnpj,
        RazaoSocial: orderRow.customerName ?? "Cliente",
        Email: orderRow.customerEmail ?? "",
        Endereco: {
          Logradouro: orderRow.addressStreet ?? "",
          Numero: orderRow.addressNumber ?? "S/N",
          Bairro: orderRow.addressNeighborhood ?? "",
          CodigoMunicipio: 0,
          Uf: orderRow.addressState ?? "AC",
          Cep: (orderRow.addressZip ?? "").replace(/\D/g, ""),
        },
      },
      Servico: {
        Discriminacao: orderRow.certNameSnapshot ?? s.nfseDiscriminacao ?? "Emissão de Certificado Digital",
        CodigoServico: s.nfseServicoCodigo ?? "1.09",
        ValorServico: valorServico,
        Aliquota: aliquota,
        IssRetido: s.nfseIssRetido === "1",
      },
      NumeroRPS: rpsNumber,
      Serie: "RPS",
      DataEmissao: dataEmissao,
    };

    const response = await brasilNfeRequest("/v1/nfse", "POST", token, payload);

    const notas = response.Notas as Array<Record<string, unknown>> | undefined;
    const nota = notas?.[0] ?? {};
    const numeroNfse = nota.NumeroNFSe as string ?? response.NumeroNFSe as string ?? null;
    const pdfBase64 = nota.Base64File as string ?? response.Base64File as string ?? null;
    const xmlBase64 = nota.Base64Xml as string ?? response.Base64Xml as string ?? response.Base64XmlLote as string ?? null;

    await db.update(nfseInvoicesTable).set({
      status: "emitted",
      numeroNfse,
      pdfBase64,
      xmlBase64,
      rawResponse: response as Record<string, unknown>,
    }).where(eq(nfseInvoicesTable.id, invoice.id));

    logger.info({ orderId, rpsNumber, numeroNfse, ambiente }, "NFS-e emitida com sucesso");
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
  const orderId = parseInt(req.params.orderId, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "ID inválido." }); return; }
  try {
    await emitNfseForOrder(orderId);
    const [invoice] = await db
      .select()
      .from(nfseInvoicesTable)
      .where(and(eq(nfseInvoicesTable.orderId, orderId), eq(nfseInvoicesTable.status, "emitted")))
      .limit(1);
    res.json({ ok: true, invoice });
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
  const id = parseInt(req.params.id, 10);
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
  const id = parseInt(req.params.id, 10);
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
  const id = parseInt(req.params.id, 10);
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
  const id = parseInt(req.params.id, 10);
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
  const orderId = parseInt(req.params.orderId, 10);
  const invoices = await db
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
