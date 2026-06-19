import { Router } from "express";
import { eq, desc, ilike, or, sql } from "drizzle-orm";
import { db, ordersTable, usersTable, certificatesTable, settingsTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { notifyOrderStatus } from "../lib/notify";
import { logger } from "../lib/logger";
import { swConsultaCPF, swConsultaCNPJ, swBiometriaPSBioGlobal, type SafewebSettings } from "../lib/safeweb";
import { garPsBio } from "../lib/gestaoar";

const router = Router();

function orderRow(o: typeof ordersTable.$inferSelect, userName?: string | null, certName?: string | null) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    userId: o.userId,
    userName: userName ?? null,
    certificateId: o.certificateId,
    certificateName: certName ?? null,
    status: o.status,
    total: parseFloat(o.total),
    clientType: o.clientType,
    customerName: o.customerName,
    customerCpfCnpj: o.customerCpfCnpj,
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    customerBirthDate: o.customerBirthDate,
    hasPsbio: o.hasPsbio,
    companyName: o.companyName,
    inssNumber: o.inssNumber,
    cnhPath: o.cnhPath,
    chatDocuments: o.chatDocuments ?? null,
    scheduledAt: o.scheduledAt,
    protocolNumber: o.protocolNumber,
    extendedWarranty: o.extendedWarranty,
    addressZipcode: o.addressZipcode,
    addressStreet: o.addressStreet,
    addressNumber: o.addressNumber,
    addressNeighborhood: o.addressNeighborhood,
    addressCity: o.addressCity,
    addressState: o.addressState,
    mpPaymentId: o.mpPaymentId,
    // Gestão AR
    garPedido: o.garPedido,
    garProtocolo: o.garProtocolo,
    garHashVenda: o.garHashVenda,
    garStatus: o.garStatus,
    garAgendamentoLink: o.garAgendamentoLink,
    garSyncedAt: o.garSyncedAt,
    garAgendamentoLocalNome: o.garAgendamentoLocalNome,
    garAgendamentoLocalHash: o.garAgendamentoLocalHash,
    garAgendamentoSlotHash: o.garAgendamentoSlotHash,
    garAgendamentoDataHora: o.garAgendamentoDataHora,
    // Representante Legal
    representanteCpf: o.representanteCpf,
    representanteNascimento: o.representanteNascimento,
    // Safeweb
    safewebSolicitacaoId: o.safewebSolicitacaoId,
    safewebStatus: o.safewebStatus,
    safewebSyncedAt: o.safewebSyncedAt,
    safewebAgendamentoId: o.safewebAgendamentoId,
    safewebAgendamentoDataHora: o.safewebAgendamentoDataHora,
    safewebAgendamentoLocalNome: o.safewebAgendamentoLocalNome,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

// ── POST /orders/consulta-previa — valida CPF/CNPJ + PSBio antes de criar pedido ──
router.post("/orders/consulta-previa", requireAuth, async (req, res): Promise<void> => {
  const { cpf, cnpj, cpfResponsavel, dataNascimento } = req.body ?? {};

  if (!dataNascimento) {
    res.status(400).json({ error: "Data de nascimento obrigatória." });
    return;
  }
  if (!cpf && !cnpj) {
    res.status(400).json({ error: "CPF ou CNPJ obrigatório." });
    return;
  }

  const [s] = await db.select().from(settingsTable).limit(1);
  const activeProvider = s?.activeProvider ?? "gestaoar";

  try {
    if (activeProvider === "safeweb") {
      if (!s?.safewebUrl || !s?.safewebUsername || !s?.safewebPassword) {
        res.json({ ok: true, hasPsbio: true, mensagem: "Safeweb não configurado — validação ignorada", requiresPresencial: false });
        return;
      }

      const sw: SafewebSettings = {
        url: s.safewebUrl,
        username: s.safewebUsername,
        password: s.safewebPassword,
        cnpjAr: s.safewebCnpjAr ?? undefined,
      };

      // PSBio Global (principal — busca em todos os sistemas)
      const cpfParaPsbio = (cpf ?? cpfResponsavel ?? "").replace(/\D/g, "");
      if (!cpfParaPsbio) {
        res.status(400).json({ error: "CPF obrigatório para consulta PSBio." });
        return;
      }
      const psbioResult = await swBiometriaPSBioGlobal(sw, cpfParaPsbio);
      const hasPsbio = psbioResult.encontrado === true;

      // Consulta prévia (best-effort — para obter nome do titular)
      let customerName: string | undefined;
      try {
        let consultaResult;
        if (cnpj) {
          consultaResult = await swConsultaCNPJ(sw, cnpj.replace(/\D/g, ""), (cpfResponsavel ?? "").replace(/\D/g, ""), dataNascimento);
        } else {
          consultaResult = await swConsultaCPF(sw, cpf.replace(/\D/g, ""), dataNascimento);
        }
        if (consultaResult.Codigo === 0 && typeof consultaResult.Mensagem === "string" && consultaResult.Mensagem.length > 2) {
          customerName = consultaResult.Mensagem;
        }
        if (typeof consultaResult.NomeCompleto === "string") {
          customerName = consultaResult.NomeCompleto;
        }
      } catch {
        // ConsultaPrevia falhou — não é crítico, PSBio foi feito com sucesso
        logger.warn("ConsultaPrevia falhou (best-effort), PSBio OK");
      }

      res.json({
        ok: true,
        hasPsbio,
        customerName,
        mensagem: hasPsbio
          ? "CPF com biometria (PSBio) cadastrada — emissão por videoconferência disponível"
          : "CPF sem biometria (PSBio) — atendimento presencial necessário",
        requiresPresencial: !hasPsbio,
      });
    } else {
      // Gestão AR — verifica PSBio
      if (!s?.garApiKey) {
        res.json({ ok: true, hasPsbio: true, mensagem: "Gestão AR não configurada — validação ignorada", requiresPresencial: false });
        return;
      }
      const documento = (cpf ?? cnpj ?? "").replace(/\D/g, "");
      const psBioResult = await garPsBio(s.garApiKey, documento);
      const hasPsbio = psBioResult?.IsOk === true;
      res.json({
        ok: true,
        hasPsbio,
        mensagem: hasPsbio
          ? "PSBio disponível — emissão por videoconferência disponível"
          : "Sem PSBio — atendimento presencial necessário",
        requiresPresencial: !hasPsbio,
      });
    }
  } catch (err) {
    logger.error({ err }, "Consulta prévia error");
    const msg = err instanceof Error ? err.message : String(err);
    res.status(422).json({ ok: false, hasPsbio: false, mensagem: `Erro ao consultar: ${msg}`, requiresPresencial: true });
  }
});

router.get("/orders", requireAuth, async (req, res): Promise<void> => {
  const session = req.session;
  const userId = session.userId as number;
  const role = session.role as string;
  const { status, search } = req.query as Record<string, string>;

  const rows = await db
    .select({
      order: ordersTable,
      userName: usersTable.name,
      certName: certificatesTable.name,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
    .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
    .orderBy(desc(ordersTable.createdAt));

  let filtered = rows;
  if (role !== "admin") {
    filtered = filtered.filter(r => r.order.userId === userId);
  }
  if (status) {
    filtered = filtered.filter(r => r.order.status === status);
  }
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(r =>
      r.order.orderNumber.toLowerCase().includes(s) ||
      r.order.customerName.toLowerCase().includes(s) ||
      r.order.customerCpfCnpj.includes(s)
    );
  }

  res.json(filtered.map(r => orderRow(r.order, r.userName, r.certName)));
});

router.post("/orders", requireAuth, async (req, res): Promise<void> => {
  const session = req.session;
  const userId = session.userId as number;
  const {
    certificateId, clientType, customerName, customerCpfCnpj, customerEmail,
    customerPhone, customerBirthDate, hasPsbio, companyName, inssNumber, extendedWarranty,
    addressZipcode, addressStreet, addressNumber, addressNeighborhood, addressCity, addressState,
    representanteCpf, representanteNascimento,
  } = req.body ?? {};

  if (!certificateId || !customerName || !customerCpfCnpj || !clientType) {
    res.status(400).json({ error: "Campos obrigatórios faltando." });
    return;
  }

  const [cert] = await db.select().from(certificatesTable).where(eq(certificatesTable.id, certificateId)).limit(1);
  if (!cert) {
    res.status(400).json({ error: "Modelo de certificado não encontrado." });
    return;
  }
  const basePrice = parseFloat(cert.price);
  const total = basePrice + (extendedWarranty ? 15.0 : 0.0);

  // generate unique order number
  let orderNumber: string;
  do {
    const rand = Math.floor(1000 + Math.random() * 9000);
    orderNumber = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${rand}`;
    const [existing] = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.orderNumber, orderNumber)).limit(1);
    if (!existing) break;
  } while (true);

  const [order] = await db.insert(ordersTable).values({
    orderNumber,
    userId,
    certificateId,
    status: "pending_payment",
    total: String(total),
    clientType: clientType ?? "cpf",
    customerName,
    customerCpfCnpj: customerCpfCnpj.replace(/\D/g, ""),
    customerEmail: customerEmail || null,
    customerPhone: customerPhone || null,
    customerBirthDate: customerBirthDate || null,
    hasPsbio: hasPsbio !== undefined ? Boolean(hasPsbio) : null,
    companyName: companyName || null,
    inssNumber: inssNumber || null,
    extendedWarranty: !!extendedWarranty,
    addressZipcode: addressZipcode || null,
    addressStreet: addressStreet || null,
    addressNumber: addressNumber || null,
    addressNeighborhood: addressNeighborhood || null,
    addressCity: addressCity || null,
    addressState: addressState || null,
    representanteCpf: representanteCpf ? representanteCpf.replace(/\D/g, "") : null,
    representanteNascimento: representanteNascimento || null,
  }).returning();

  // Notify customer about new order
  if (order.customerEmail || order.customerPhone) {
    notifyOrderStatus({
      to: order.customerEmail,
      phone: order.customerPhone,
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      status: "pending_payment",
      total,
      certName: cert.name,
    }).catch((err: unknown) => logger.error({ err }, "Erro ao notificar criação de pedido"));
  }

  res.status(201).json(orderRow(order, null, cert.name));
});

router.get("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const session = req.session;
  const userId = session.userId as number;
  const role = session.role as string;

  const [row] = await db
    .select({ order: ordersTable, userName: usersTable.name, certName: certificatesTable.name })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
    .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
    .where(eq(ordersTable.id, id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }
  if (role !== "admin" && row.order.userId !== userId) {
    res.status(403).json({ error: "Acesso negado." });
    return;
  }
  res.json(orderRow(row.order, row.userName, row.certName));
});

router.patch("/orders/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { status, protocolNumber, scheduledAt, safewebSolicitacaoId } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (protocolNumber !== undefined) updates.protocolNumber = protocolNumber;
  if (scheduledAt !== undefined) updates.scheduledAt = new Date(scheduledAt);
  if (safewebSolicitacaoId !== undefined) updates.safewebSolicitacaoId = safewebSolicitacaoId || null;

  const [order] = await db
    .update(ordersTable)
    .set(updates as Parameters<typeof db.update>[0] extends infer T ? Record<string, unknown> : never)
    .where(eq(ordersTable.id, id))
    .returning();
  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }

  if (status !== undefined) {
    notifyOrderStatus({
      to: order.customerEmail,
      phone: order.customerPhone,
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      status: order.status,
    }).catch((err: unknown) => logger.error({ err }, "Erro ao notificar status do pedido"));
  }

  res.json(orderRow(order));
});

router.post("/orders/:id/payment", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [row] = await db
    .select({ order: ordersTable, certName: certificatesTable.name })
    .from(ordersTable)
    .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
    .where(eq(ordersTable.id, id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }

  const [settings] = await db.select().from(settingsTable).limit(1);
  const mpToken = settings?.mpAccessToken || process.env.MP_ACCESS_TOKEN || "";

  if (!mpToken) {
    res.status(400).json({ error: "Chaves do MercadoPago não configuradas. Acesse Configurações para inserir o MP Access Token." });
    return;
  }

  const siteUrl = settings?.siteUrl || process.env.SITE_URL || "https://example.com";

  const cpfDigits = row.order.customerCpfCnpj.replace(/\D/g, "");
  const payerEmail = row.order.customerEmail || "cliente@lealcert.com.br";
  const nameParts = (row.order.customerName || "Cliente").split(" ");
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ") || firstName;

  const pixPayload = {
    transaction_amount: parseFloat(row.order.total),
    description: row.certName ?? "Certificado Digital",
    payment_method_id: "pix",
    external_reference: row.order.orderNumber,
    notification_url: `${siteUrl}/api/mp/webhook`,
    payer: {
      email: payerEmail,
      first_name: firstName,
      last_name: lastName,
      identification: {
        type: cpfDigits.length === 14 ? "CNPJ" : "CPF",
        number: cpfDigits,
      },
    },
  };

  const resp = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${mpToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `${row.order.orderNumber}-${Date.now()}`,
    },
    body: JSON.stringify(pixPayload),
  });
  const data = await resp.json() as {
    id?: number;
    status?: string;
    point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
    message?: string;
    error?: string;
  };
  if (!resp.ok) {
    res.status(400).json({ error: data.message ?? data.error ?? "Erro ao criar pagamento PIX no MercadoPago." });
    return;
  }

  const txData = data.point_of_interaction?.transaction_data;
  if (!txData?.qr_code) {
    res.status(400).json({ error: "MercadoPago não retornou o QR Code PIX." });
    return;
  }

  await db.update(ordersTable)
    .set({ mpPreferenceId: String(data.id ?? ""), mpPaymentId: String(data.id ?? "") })
    .where(eq(ordersTable.id, id));

  res.json({
    paymentId: String(data.id ?? ""),
    pixQrCode: txData.qr_code,
    pixQrCodeBase64: txData.qr_code_base64 ?? "",
  });
});

router.post("/orders/:id/sync-payment", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [row] = await db
    .select({ order: ordersTable, certName: certificatesTable.name })
    .from(ordersTable)
    .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
    .where(eq(ordersTable.id, id))
    .limit(1);

  if (!row) { res.status(404).json({ ok: false, error: "Pedido não encontrado" }); return; }
  const order = row.order;

  // Só o admin ou o dono do pedido pode sincronizar
  const isAdmin = req.session.role === "admin" || req.session.userType === "admin";
  if (!isAdmin && req.session.userId !== order.userId) {
    res.status(403).json({ ok: false, error: "Acesso negado" }); return;
  }

  if (!order.mpPaymentId) {
    res.status(400).json({ ok: false, error: "Nenhum pagamento gerado para este pedido" }); return;
  }

  const [settings] = await db.select().from(settingsTable).limit(1);
  const mpToken = settings?.mpAccessToken || process.env.MP_ACCESS_TOKEN || "";
  if (!mpToken) { res.status(500).json({ ok: false, error: "MP Access Token não configurado" }); return; }

  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${order.mpPaymentId}`, {
    headers: { Authorization: `Bearer ${mpToken}` },
  });
  if (!mpRes.ok) {
    res.status(502).json({ ok: false, error: `Erro ao consultar MP: ${mpRes.status}` }); return;
  }

  const payment = await mpRes.json() as { status: string; id?: number };
  req.log.info({ orderId: id, mpPaymentId: order.mpPaymentId, mpStatus: payment.status }, "sync-payment: consultado");

  if (payment.status !== "approved") {
    res.json({ ok: true, status: payment.status }); return;
  }

  // Já estava pago — só responde
  if (order.status !== "pending_payment" && order.status !== "created") {
    res.json({ ok: true, status: order.status }); return;
  }

  // Marca como pago
  await db.update(ordersTable).set({ status: "paid" }).where(eq(ordersTable.id, id));
  req.log.info({ orderId: id }, "sync-payment: pedido marcado como PAGO");

  const { notifyOrderStatus } = await import("../lib/notify");
  notifyOrderStatus({
    to: order.customerEmail,
    phone: order.customerPhone,
    customerName: order.customerName,
    orderNumber: order.orderNumber,
    status: "paid",
    total: parseFloat(order.total),
    certName: row.certName ?? undefined,
  }).catch((err: unknown) => req.log.error({ err }, "sync-payment: erro ao notificar"));

  const activeProvider = settings?.activeProvider ?? "gestaoar";
  if (activeProvider === "safeweb") {
    const { swAutoComprar } = await import("../lib/sw-auto");
    swAutoComprar(id).catch((err: unknown) => req.log.error({ err }, "sync-payment: erro sw-auto"));
  } else {
    const { garAutoComprar } = await import("../lib/gar-auto");
    garAutoComprar(id).catch((err: unknown) => req.log.error({ err }, "sync-payment: erro gar-auto"));
  }

  res.json({ ok: true, status: "paid" });
});

router.post("/orders/:id/sync-provider", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [settings] = await db.select().from(settingsTable).limit(1);
  const activeProvider = settings?.activeProvider ?? "gestaoar";

  try {
    if (activeProvider === "safeweb") {
      const { swSyncStatus } = await import("../lib/sw-auto");
      const result = await swSyncStatus(id);
      if (!result.ok) { res.status(400).json({ ok: false, error: result.error }); return; }
      res.json({ ok: true, status: result.status });
    } else {
      res.json({ ok: false, error: "Para Gestão AR, use o botão 'Sincronizar com GAR' na seção Gestão AR." });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ── POST /orders/:id/safeweb-agendar — agenda atendimento via Safeweb ────────
router.post("/orders/:id/safeweb-agendar", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) { res.status(404).json({ error: "Pedido não encontrado" }); return; }

  const isAdmin = req.session.role === "admin" || req.session.userType === "admin";
  if (!isAdmin && req.session.userId !== order.userId) { res.status(403).json({ error: "Acesso negado" }); return; }

  if (!order.safewebSolicitacaoId) {
    res.status(400).json({ error: "Pedido ainda não registrado na Safeweb. Aguarde o processamento do pagamento." });
    return;
  }

  const { dataHora, localNome } = req.body ?? {};
  if (!dataHora) { res.status(400).json({ error: "dataHora obrigatório" }); return; }

  const [s] = await db.select().from(settingsTable).limit(1);
  const isHomol = s?.safewebAmbiente === "homologacao";
  const username = isHomol ? (s?.safewebUsernameHomologacao ?? s?.safewebUsername) : s?.safewebUsername;
  const password = isHomol ? (s?.safewebPasswordHomologacao ?? s?.safewebPassword) : s?.safewebPassword;
  const rawUrl = (isHomol ? s?.safewebUrlHomologacao : s?.safewebUrl) ?? s?.safewebUrl;
  const { swAgendaAgendar } = await import("../lib/safeweb");

  let agendamentoId: string | null = null;

  if (username && password && rawUrl) {
    try {
      const swUrl = (() => { try { return new URL(rawUrl).origin; } catch { return rawUrl.replace(/\/Service\/.+$/, "").replace(/\/$/, ""); } })();
      const sw = { url: swUrl, username, password, cnpjAr: s?.safewebCnpjAr ?? undefined, codigoParceiro: s?.safewebCodigoParceiro ?? undefined };
      const result = await swAgendaAgendar(sw, {
        idSolicitacao: Number(order.safewebSolicitacaoId),
        DataHora: dataHora,
        CnpjAR: sw.cnpjAr ?? "",
        ...(localNome ? { Local: localNome } : {}),
      });
      req.log.info({ orderId: id, result }, "safeweb-agendar: resposta da API");
      if (result.sucesso !== false) {
        agendamentoId = String(result.idAgendamento ?? result.IdAgendamento ?? result.id ?? result.Id ?? `sw-${Date.now()}`);
      }
    } catch (err) {
      req.log.warn({ orderId: id, err }, "safeweb-agendar: erro na API Safeweb, salvando agendamento manualmente");
      agendamentoId = `manual-${Date.now()}`;
    }
  } else {
    agendamentoId = `manual-${Date.now()}`;
  }

  const nomeLocal = localNome || "Videoconferência";
  await db.update(ordersTable).set({
    safewebAgendamentoId: agendamentoId,
    safewebAgendamentoDataHora: dataHora,
    safewebAgendamentoLocalNome: nomeLocal,
    scheduledAt: new Date(dataHora),
  }).where(eq(ordersTable.id, id));

  const { logEvent } = await import("../lib/order-events");
  await logEvent(id, "gar_status_updated", `Atendimento agendado: ${nomeLocal} — ${dataHora}`, { agendamentoId, dataHora });

  res.json({ ok: true, dataHora, localNome: nomeLocal, agendamentoId });
});

export default router;
