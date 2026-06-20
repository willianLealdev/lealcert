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
    cartaoCnpjPath: o.cartaoCnpjPath,
    fichaCadastralPath: o.fichaCadastralPath,
    chatDocuments: o.chatDocuments ?? null,
    scheduledAt: o.scheduledAt,
    protocolNumber: o.protocolNumber,
    extendedWarranty: o.extendedWarranty,
    addressZipcode: o.addressZipcode,
    addressStreet: o.addressStreet,
    addressNumber: o.addressNumber,
    addressComplement: o.addressComplement,
    addressNeighborhood: o.addressNeighborhood,
    addressCity: o.addressCity,
    addressState: o.addressState,
    representanteAddressZipcode: o.representanteAddressZipcode,
    representanteAddressStreet: o.representanteAddressStreet,
    representanteAddressNumber: o.representanteAddressNumber,
    representanteAddressComplement: o.representanteAddressComplement,
    representanteAddressNeighborhood: o.representanteAddressNeighborhood,
    representanteAddressCity: o.representanteAddressCity,
    representanteAddressState: o.representanteAddressState,
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
    res.status(422).json({ ok: false, hasPsbio: false, mensagem: "Não foi possível consultar os dados. Tente novamente.", requiresPresencial: true });
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
    customerCei, customerNis,
    representanteCpf, representanteNascimento,
    representanteDocTipo, representanteDocNumero, representanteDocEmissor,
    cnhPath, cartaoCnpjPath, fichaCadastralPath,
    addressComplement,
    representanteAddressZipcode, representanteAddressStreet, representanteAddressNumber,
    representanteAddressComplement, representanteAddressNeighborhood, representanteAddressCity, representanteAddressState,
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
    addressComplement: addressComplement || null,
    addressNeighborhood: addressNeighborhood || null,
    addressCity: addressCity || null,
    addressState: addressState || null,
    representanteAddressZipcode: representanteAddressZipcode || null,
    representanteAddressStreet: representanteAddressStreet || null,
    representanteAddressNumber: representanteAddressNumber || null,
    representanteAddressComplement: representanteAddressComplement || null,
    representanteAddressNeighborhood: representanteAddressNeighborhood || null,
    representanteAddressCity: representanteAddressCity || null,
    representanteAddressState: representanteAddressState || null,
    customerCei: customerCei || null,
    customerNis: customerNis || null,
    representanteCpf: representanteCpf ? representanteCpf.replace(/\D/g, "") : null,
    representanteNascimento: representanteNascimento || null,
    representanteDocTipo: representanteDocTipo || null,
    representanteDocNumero: representanteDocNumero || null,
    representanteDocEmissor: representanteDocEmissor || null,
    cnhPath: cnhPath || null,
    cartaoCnpjPath: cartaoCnpjPath || null,
    fichaCadastralPath: fichaCadastralPath || null,
  }).returning();

  // Log order creation
  const { logEvent } = await import("../lib/order-events");
  await logEvent(order.id, "order_created", `Pedido criado — ${cert.name}${extendedWarranty ? " (+ garantia estendida)" : ""} — R$ ${total.toFixed(2).replace(".", ",")}`, { certificateId, total });

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

  // Log admin actions
  const { logEvent: logEv } = await import("../lib/order-events");
  const changes: string[] = [];
  if (status !== undefined) changes.push(`Status → ${status}`);
  if (protocolNumber !== undefined) changes.push(`Protocolo → ${protocolNumber}`);
  if (scheduledAt !== undefined) changes.push(`Agendamento → ${new Date(scheduledAt).toLocaleString("pt-BR")}`);
  if (safewebSolicitacaoId !== undefined) changes.push(`ID Safeweb → ${safewebSolicitacaoId || "(removido)"}`);
  if (changes.length > 0) {
    await logEv(id, "admin_action", `Admin atualizou pedido: ${changes.join("; ")}`, { updates });
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
  const mpToken = settings?.mpAccessToken || "";

  if (!mpToken) {
    res.status(400).json({ error: "Chaves do MercadoPago não configuradas. Acesse Configurações para inserir o MP Access Token." });
    return;
  }

  const siteUrl = settings?.siteUrl || "https://lealcert.com.br";

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

  const { logEvent: logPayEv } = await import("../lib/order-events");
  await logPayEv(id, "payment_initiated", `Pagamento PIX gerado via MercadoPago — R$ ${parseFloat(row.order.total).toFixed(2).replace(".", ",")}`, { mpPaymentId: data.id });

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
  const mpToken = settings?.mpAccessToken || "";
  if (!mpToken) { res.status(500).json({ ok: false, error: "MP Access Token não configurado. Configure em Configurações → MercadoPago." }); return; }

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
  const { logEvent: logPaidEv } = await import("../lib/order-events");
  await logPaidEv(id, "payment_confirmed", `Pagamento confirmado via MercadoPago — R$ ${parseFloat(order.total).toFixed(2).replace(".", ",")}`, { mpPaymentId: order.mpPaymentId });

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

// ── POST /orders/:id/safeweb-cancelar — cancela solicitação na Safeweb ───────
router.post("/orders/:id/safeweb-cancelar", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) { res.status(404).json({ error: "Pedido não encontrado" }); return; }

  if (!order.safewebSolicitacaoId) {
    res.status(400).json({ error: "Pedido não possui solicitação Safeweb registrada" }); return;
  }

  // Só pode cancelar se status for aguardando_validacao
  if (order.status !== "aguardando_validacao") {
    res.status(400).json({
      error: `Cancelamento não permitido: o pedido está com status "${order.status}". Só é possível cancelar solicitações com status "Aguardando Validação".`,
    }); return;
  }

  const [s] = await db.select().from(settingsTable).limit(1);
  const isHomol = s?.safewebAmbiente === "homologacao";
  const username = isHomol ? (s?.safewebUsernameHomologacao ?? s?.safewebUsername) : s?.safewebUsername;
  const password = isHomol ? (s?.safewebPasswordHomologacao ?? s?.safewebPassword) : s?.safewebPassword;
  const rawUrl = (isHomol ? s?.safewebUrlHomologacao : s?.safewebUrl) ?? s?.safewebUrl;

  if (!username || !password || !rawUrl) {
    res.status(503).json({ error: "Credenciais Safeweb não configuradas" }); return;
  }

  const swUrl = (() => { try { return new URL(rawUrl).origin; } catch { return rawUrl.replace(/\/Service\/.+$/, "").replace(/\/$/, ""); } })();
  const sw = { url: swUrl, username, password, cnpjAr: s?.safewebCnpjAr ?? undefined };
  const { motivo } = req.body ?? {};

  try {
    const { swCancelarSolicitacao } = await import("../lib/safeweb");
    const result = await swCancelarSolicitacao(sw, Number(order.safewebSolicitacaoId), motivo ?? "Cancelado pelo administrador");
    req.log.info({ orderId: id, result }, "safeweb-cancelar: resposta da API");

    // Atualiza status do pedido para cancelled
    await db.update(ordersTable).set({
      status: "cancelled",
      safewebStatus: "Cancelada",
      safewebSyncedAt: new Date(),
    }).where(eq(ordersTable.id, id));

    const { logEvent } = await import("../lib/order-events");
    await logEvent(id, "gar_status_updated", `Solicitação Safeweb cancelada. Motivo: ${motivo ?? "Cancelado pelo administrador"}`, { result });

    res.json({ ok: true, message: "Solicitação cancelada com sucesso" });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    req.log.error({ err, orderId: id }, "safeweb-cancelar: erro ao cancelar solicitação");
    res.status(502).json({ error: `Erro ao cancelar na Safeweb: ${msg}` });
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

  const { dataHora, localNome, idLocal } = req.body ?? {};
  if (!dataHora) { res.status(400).json({ error: "dataHora obrigatório" }); return; }

  const isReagendar = !!order.safewebAgendamentoId;

  const [s] = await db.select().from(settingsTable).limit(1);
  const isHomol = s?.safewebAmbiente === "homologacao";
  const username = isHomol ? (s?.safewebUsernameHomologacao ?? s?.safewebUsername) : s?.safewebUsername;
  const password = isHomol ? (s?.safewebPasswordHomologacao ?? s?.safewebPassword) : s?.safewebPassword;
  const rawUrl = (isHomol ? s?.safewebUrlHomologacao : s?.safewebUrl) ?? s?.safewebUrl;
  const { swAgendaAgendar, swAgendaCancelar } = await import("../lib/safeweb");

  let agendamentoId: string | null = null;

  if (username && password && rawUrl) {
    const swUrl = (() => { try { return new URL(rawUrl).origin; } catch { return rawUrl.replace(/\/Service\/.+$/, "").replace(/\/$/, ""); } })();
    const sw = { url: swUrl, username, password, cnpjAr: s?.safewebCnpjAr ?? undefined, codigoParceiro: s?.safewebCodigoParceiro ?? undefined };

    // Se já há agendamento anterior e é um ID numérico real (não "manual-..."), cancela antes de reagendar
    if (isReagendar && order.safewebAgendamentoId && !order.safewebAgendamentoId.startsWith("manual-") && !order.safewebAgendamentoId.startsWith("sw-")) {
      const oldId = parseInt(order.safewebAgendamentoId, 10);
      if (!isNaN(oldId)) {
        try {
          await swAgendaCancelar(sw, oldId);
          req.log.info({ orderId: id, oldAgendamentoId: oldId }, "safeweb-agendar: agendamento anterior cancelado na Safeweb");
        } catch (err) {
          req.log.warn({ orderId: id, err }, "safeweb-agendar: não foi possível cancelar agendamento anterior, prosseguindo mesmo assim");
        }
      }
    }

    try {
      const result = await swAgendaAgendar(sw, {
        idSolicitacao: Number(order.safewebSolicitacaoId),
        DataHora: dataHora,
        CnpjAR: sw.cnpjAr ?? "",
        ...(idLocal ? { IdLocal: idLocal } : {}),
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
    status: "aguardando_validacao",
  }).where(eq(ordersTable.id, id));

  const { logEvent } = await import("../lib/order-events");
  const acao = isReagendar ? "Agendamento alterado" : "Atendimento agendado";
  await logEvent(id, "scheduling_confirmed", `${acao}: ${nomeLocal} — ${new Date(dataHora).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`, { agendamentoId, dataHora, isReagendar });

  res.json({ ok: true, dataHora, localNome: nomeLocal, agendamentoId });
});

// ── GET /orders/:id/safeweb-locais — locais de atendimento na Safeweb ─────────
router.get("/orders/:id/safeweb-locais", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const isAdmin = req.session.role === "admin" || req.session.userType === "admin";
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) { res.status(404).json({ error: "Pedido não encontrado" }); return; }
  if (!isAdmin && req.session.userId !== order.userId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [s] = await db.select().from(settingsTable).limit(1);
  const isHomol = s?.safewebAmbiente === "homologacao";
  const username = isHomol ? (s?.safewebUsernameHomologacao ?? s?.safewebUsername) : s?.safewebUsername;
  const password = isHomol ? (s?.safewebPasswordHomologacao ?? s?.safewebPassword) : s?.safewebPassword;
  const rawUrl = (isHomol ? s?.safewebUrlHomologacao : s?.safewebUrl) ?? s?.safewebUrl;

  if (!username || !password || !rawUrl) {
    res.status(503).json({ error: "Credenciais Safeweb não configuradas" }); return;
  }

  try {
    const swUrl = (() => { try { return new URL(rawUrl).origin; } catch { return rawUrl.replace(/\/Service\/.+$/, "").replace(/\/$/, ""); } })();
    const sw = { url: swUrl, username, password, cnpjAr: s?.safewebCnpjAr ?? undefined };
    const { swLocaisPorCnpjAr } = await import("../lib/safeweb");
    const result = await swLocaisPorCnpjAr(sw, sw.cnpjAr, 1);

    // A API retorna um array direto ou null
    const rawList = Array.isArray(result) ? result : [];
    const locais = rawList.map((l) => ({
      id: l.idLocalAtendimento,
      titulo: l.Nome ?? l.RazaoSocial ?? `Local ${l.idLocalAtendimento}`,
      endereco: [l.Endereco?.Logradouro, l.Endereco?.Numero, l.Endereco?.Complemento].filter(Boolean).join(", "),
      bairro: l.Endereco?.Bairro ?? "",
      cidade: l.Endereco?.Municipio?.Nome ?? "",
      uf: l.Endereco?.Municipio?.UF?.Sigla ?? "",
      cep: l.Endereco?.CEP ?? "",
    }));

    res.json({ locais });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    req.log.error({ err, orderId: id }, "safeweb-locais: erro");
    res.status(502).json({ error: `Erro ao consultar locais: ${msg}` });
  }
});

// ── GET /orders/:id/safeweb-slots — lista horários disponíveis na Safeweb ────
router.get("/orders/:id/safeweb-slots", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [row] = await db
    .select({ order: ordersTable, cert: certificatesTable })
    .from(ordersTable)
    .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
    .where(eq(ordersTable.id, id))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Pedido não encontrado" }); return; }

  const isAdmin = req.session.role === "admin" || req.session.userType === "admin";
  if (!isAdmin && req.session.userId !== row.order.userId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }

  const [s] = await db.select().from(settingsTable).limit(1);
  const isHomol = s?.safewebAmbiente === "homologacao";
  const username = isHomol ? (s?.safewebUsernameHomologacao ?? s?.safewebUsername) : s?.safewebUsername;
  const password = isHomol ? (s?.safewebPasswordHomologacao ?? s?.safewebPassword) : s?.safewebPassword;
  const rawUrl = (isHomol ? s?.safewebUrlHomologacao : s?.safewebUrl) ?? s?.safewebUrl;

  if (!username || !password || !rawUrl) {
    res.status(503).json({ error: "Credenciais Safeweb não configuradas" }); return;
  }

  const idLocalParam = req.query.idLocal ? parseInt(String(req.query.idLocal), 10) : null;

  try {
    const swUrl = (() => { try { return new URL(rawUrl).origin; } catch { return rawUrl.replace(/\/Service\/.+$/, "").replace(/\/$/, ""); } })();
    const sw = { url: swUrl, username, password, cnpjAr: s?.safewebCnpjAr ?? undefined };
    const { swGetToken } = await import("../lib/safeweb");
    const token = await swGetToken(sw);
    const H: Record<string, string> = { Authorization: token, "Content-Type": "application/json" };

    // Tenta os caminhos mais prováveis para obter horários disponíveis
    // O path correto será confirmado pela Safeweb — adaptar quando documentação chegar
    const candidatePaths: string[] = [];
    if (idLocalParam) {
      candidatePaths.push(
        `/Service/Microservice/Shared/Schedule/api/GetAvailableSchedules/${idLocalParam}`,
        `/Service/Microservice/Shared/Schedule/api/GetList/${idLocalParam}`,
        `/Service/Microservice/Shared/Schedule/api/GetByAttendancePlace/${idLocalParam}`,
      );
    }
    if (sw.cnpjAr) {
      candidatePaths.push(
        `/Service/Microservice/Shared/Schedule/api/GetAvailableSchedules/${sw.cnpjAr}`,
        `/Service/Microservice/Shared/Schedule/api/GetListByAR/${sw.cnpjAr}`,
      );
    }

    let rawResult: unknown = null;
    for (const path of candidatePaths) {
      const r = await fetch(`${sw.url}${path}`, { headers: H });
      if (r.ok) {
        rawResult = await r.json();
        req.log.info({ orderId: id, path }, "safeweb-slots: endpoint de horários encontrado");
        break;
      }
      req.log.debug({ orderId: id, path, status: r.status }, "safeweb-slots: path sem resposta");
    }

    // Normaliza resposta — pode ser array direto ou objeto com chave de lista
    const rawList = Array.isArray(rawResult)
      ? rawResult
      : ((rawResult as Record<string, unknown> | null)?.horarios
        ?? (rawResult as Record<string, unknown> | null)?.slots
        ?? (rawResult as Record<string, unknown> | null)?.schedules
        ?? []) as unknown[];

    const slots = (rawList as Record<string, unknown>[]).map((sl) => ({
      idAgendamento: sl.IdAgendamento ?? sl.idAgendamento ?? sl.id,
      dataHora: sl.DataHora ?? sl.dataHora ?? sl.Data ?? sl.data,
      local: String(sl.Local ?? sl.local ?? sl.NomeLocal ?? sl.nomeLocal ?? ""),
      disponivel: sl.Disponivel ?? sl.disponivel ?? true,
    })).filter(sl => sl.dataHora);

    res.json({ slots });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    req.log.warn({ orderId: id, err }, "safeweb-slots: erro ao listar horários, retornando lista vazia");
    res.json({ slots: [] });
  }
});

export default router;
