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
    certificateName: certName ?? o.certNameSnapshot ?? null,
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
    customerCei: o.customerCei,
    customerNis: o.customerNis,
    cnhPath: o.cnhPath,
    cartaoCnpjPath: o.cartaoCnpjPath,
    fichaCadastralPath: o.fichaCadastralPath,
    outrosPath: o.outrosPath,
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
    representanteDocTipo: o.representanteDocTipo,
    representanteDocNumero: o.representanteDocNumero,
    representanteDocEmissor: o.representanteDocEmissor,
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
    // PSBio Global — sempre usa Safeweb (sistema nacional, independente do provider ativo)
    if (!s?.safewebUrl || !s?.safewebUsername || !s?.safewebPassword) {
      res.json({ ok: true, hasPsbio: true, mensagem: "PSBio não configurado — validação ignorada", requiresPresencial: false });
      return;
    }

    const sw: SafewebSettings = {
      url: s.safewebUrl,
      username: s.safewebUsername,
      password: s.safewebPassword,
      cnpjAr: s.safewebCnpjAr ?? undefined,
    };

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
  } catch (err) {
    logger.error({ err }, "Consulta prévia error");
    res.status(422).json({ ok: false, hasPsbio: false, mensagem: "Não foi possível consultar os dados. Tente novamente.", requiresPresencial: true });
  }
});

// ── POST /orders/cnpj-rfb — consulta RFB CNPJ via Safeweb (separado do PSBio) ──
router.post("/orders/cnpj-rfb", requireAuth, async (req, res): Promise<void> => {
  const { cnpj, cpf, dataNascimento } = req.body ?? {};
  if (!cnpj || !cpf || !dataNascimento) {
    res.status(400).json({ ok: false, mensagem: "CNPJ, CPF e data de nascimento são obrigatórios." });
    return;
  }
  const [s] = await db.select().from(settingsTable).limit(1);
  if (!s?.safewebUrl || !s?.safewebUsername || !s?.safewebPassword) {
    res.status(503).json({ ok: false, mensagem: "Safeweb não configurado." });
    return;
  }
  const sw: SafewebSettings = {
    url: s.safewebUrl,
    username: s.safewebUsername,
    password: s.safewebPassword,
    cnpjAr: s.safewebCnpjAr ?? undefined,
  };
  try {
    const result = await swConsultaCNPJ(
      sw,
      String(cnpj).replace(/\D/g, ""),
      String(cpf).replace(/\D/g, ""),
      String(dataNascimento),
    );
    if (result.Codigo === 0) {
      const nomeCompleto = typeof result.NomeCompleto === "string" && result.NomeCompleto.length > 2 ? result.NomeCompleto : "";
      const mensagem = typeof result.Mensagem === "string" && result.Mensagem.length > 2 ? result.Mensagem : "";
      const razaoSocial = nomeCompleto || mensagem;
      const repName = mensagem || nomeCompleto;
      res.json({ ok: true, razaoSocial, repName });
    } else {
      res.json({ ok: false, codigo: result.Codigo, mensagem: result.Mensagem ?? "CPF do responsável não confere com a Receita Federal." });
    }
  } catch (err) {
    req.log.error({ err }, "cnpj-rfb error");
    res.status(502).json({ ok: false, mensagem: (err as Error).message || "Erro ao consultar Safeweb." });
  }
});

// ── POST /orders/consulta-cpf — consulta nome do titular via Safeweb ──────────
router.post("/orders/consulta-cpf", requireAuth, async (req, res): Promise<void> => {
  const { cpf, dataNascimento } = req.body ?? {};
  if (!cpf || !dataNascimento) {
    res.status(400).json({ ok: false, mensagem: "CPF e data de nascimento são obrigatórios." });
    return;
  }
  const [s] = await db.select().from(settingsTable).limit(1);
  if (!s?.safewebUrl || !s?.safewebUsername || !s?.safewebPassword) {
    res.status(503).json({ ok: false, mensagem: "Safeweb não configurado." });
    return;
  }
  const sw: SafewebSettings = {
    url: s.safewebUrl,
    username: s.safewebUsername,
    password: s.safewebPassword,
    cnpjAr: s.safewebCnpjAr ?? undefined,
  };
  try {
    const result = await swConsultaCPF(sw, String(cpf).replace(/\D/g, ""), String(dataNascimento));
    if (result.Codigo === 0) {
      const nome =
        (typeof result.Mensagem === "string" && result.Mensagem.length > 2 ? result.Mensagem : "") ||
        (typeof result.NomeCompleto === "string" && result.NomeCompleto.length > 2 ? result.NomeCompleto : "");
      if (nome) {
        res.json({ ok: true, nome });
      } else {
        res.json({ ok: false, mensagem: "Nome não encontrado na RFB." });
      }
    } else {
      res.json({ ok: false, mensagem: result.Mensagem ?? "CPF ou data de nascimento incorretos." });
    }
  } catch (err) {
    req.log.error({ err }, "consulta-cpf error");
    res.status(502).json({ ok: false, mensagem: (err as Error).message || "Erro ao consultar Safeweb." });
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
    cnhPath, cartaoCnpjPath, fichaCadastralPath, outrosPath,
    addressComplement,
    representanteAddressZipcode, representanteAddressStreet, representanteAddressNumber,
    representanteAddressComplement, representanteAddressNeighborhood, representanteAddressCity, representanteAddressState,
    nfCnpj, nfNome, nfZipcode, nfStreet, nfNumber, nfComplement, nfNeighborhood, nfCity, nfState,
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
    outrosPath: outrosPath || null,
    nfCnpj: nfCnpj ? String(nfCnpj).replace(/\D/g, "") || null : null,
    nfNome: nfNome || null,
    nfZipcode: nfZipcode ? String(nfZipcode).replace(/\D/g, "") || null : null,
    nfStreet: nfStreet || null,
    nfNumber: nfNumber || null,
    nfComplement: nfComplement || null,
    nfNeighborhood: nfNeighborhood || null,
    nfCity: nfCity || null,
    nfState: nfState || null,
    certNameSnapshot: cert.name,
    certProductSnapshot: cert.product || null,
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

  // Não pode cancelar se já emitido, concluído ou cancelado
  const nonCancellableStatuses = ["emitido", "completed", "cancelled", "revogado"];
  if (nonCancellableStatuses.includes(order.status)) {
    res.status(400).json({
      error: `Cancelamento não permitido: o pedido está com status "${order.status}".`,
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
    const result = await swCancelarSolicitacao(sw, String(order.safewebSolicitacaoId));
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

// ── POST /orders/:id/agendar — confirma agendamento na Gestão AR ─────────────
router.post("/orders/:id/agendar", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) { res.status(404).json({ error: "Pedido não encontrado" }); return; }

  const isAdmin = req.session.role === "admin" || req.session.userType === "admin";
  if (!isAdmin && req.session.userId !== order.userId) { res.status(403).json({ error: "Acesso negado" }); return; }

  if (!order.garProtocolo) {
    res.status(400).json({ error: "Protocolo GAR não emitido. Aguarde o processamento do pagamento." });
    return;
  }

  const { hashLocal, localNome, dataInicial, dataFinal } = req.body ?? {};
  if (!hashLocal) { res.status(400).json({ error: "hashLocal obrigatório" }); return; }
  if (!dataInicial) { res.status(400).json({ error: "dataInicial obrigatório (formato: YYYY-MM-DD HH:mm)" }); return; }
  if (!dataFinal) { res.status(400).json({ error: "dataFinal obrigatório (formato: YYYY-MM-DD HH:mm)" }); return; }

  const [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings?.garApiKey) { res.status(503).json({ error: "GAR API Key não configurada" }); return; }

  const hashVenda = order.garHashVenda;
  if (!hashVenda) {
    res.status(400).json({ error: "HashVenda GAR indisponível — pedido pode não ter sido registrado corretamente na GAR." });
    return;
  }

  const isReagendar = !!order.garAgendamentoDataHora;

  try {
    const { garAgendar } = await import("../lib/gestaoar");
    const result = await garAgendar(settings.garApiKey, hashVenda, hashLocal, dataInicial, dataFinal);
    req.log.info({ orderId: id, result }, "agendar-gar: resposta da API");

    if (result.Erros?.length) {
      req.log.warn({ orderId: id, erros: result.Erros }, "agendar-gar: erros retornados pela GAR");
      res.status(400).json({ error: result.Erros.map(e => e.Ocorrencia).join("; ") }); return;
    }

    const nomeLocal = localNome || result.NomeLocalAgendamento || "Videoconferência";
    const dataHoraStr = result.DataHoraAgendamento || dataInicial;
    const scheduledDate = (() => { try { return new Date(dataInicial.replace(" ", "T") + ":00"); } catch { return new Date(); } })();

    await db.update(ordersTable).set({
      garAgendamentoLocalHash: hashLocal,
      garAgendamentoLocalNome: nomeLocal,
      garAgendamentoDataHora: dataHoraStr,
      scheduledAt: scheduledDate,
      status: "aguardando_validacao",
    }).where(eq(ordersTable.id, id));

    const { logEvent } = await import("../lib/order-events");
    const acao = isReagendar ? "Agendamento alterado (GAR)" : "Atendimento agendado (GAR)";
    await logEvent(id, "scheduling_confirmed", `${acao}: ${nomeLocal} — ${dataInicial}`, { hashLocal, dataInicial, dataFinal, isReagendar });

    req.log.info({ orderId: id, dataInicial, nomeLocal }, "agendar-gar: agendamento confirmado");
    res.json({ ok: true, dataHora: dataHoraStr, localNome: nomeLocal });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    req.log.error({ err, orderId: id }, "agendar-gar: erro");
    res.status(502).json({ error: `Erro ao agendar na Gestão AR: ${msg}` });
  }
});

// ── GET /orders/:id/gar-disponibilidade — horários disponíveis na GAR ─────────
router.get("/orders/:id/gar-disponibilidade", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) { res.status(404).json({ error: "Pedido não encontrado" }); return; }

  const isAdmin = req.session.role === "admin" || req.session.userType === "admin";
  if (!isAdmin && req.session.userId !== order.userId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const hashLocal = String(req.query.hashLocal ?? "");
  const dataInicial = String(req.query.dataInicial ?? "");
  const dataFinal = String(req.query.dataFinal ?? "");

  if (!hashLocal || !dataInicial || !dataFinal) {
    res.status(400).json({ error: "hashLocal, dataInicial e dataFinal são obrigatórios" }); return;
  }

  const [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings?.garApiKey) { res.status(503).json({ error: "GAR API Key não configurada" }); return; }

  try {
    const { garDisponibilidadeAgenda } = await import("../lib/gestaoar");
    const result = await garDisponibilidadeAgenda(settings.garApiKey, dataInicial, dataFinal, hashLocal);
    req.log.info({ orderId: id, hashLocal, dataInicial, dataFinal, datas: result?.Datas?.length ?? 0 }, "gar-disponibilidade: resposta");
    res.json(result ?? { Datas: [] });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    req.log.error({ err, orderId: id }, "gar-disponibilidade: erro");
    res.status(502).json({ error: `Erro ao consultar disponibilidade na GAR: ${msg}` });
  }
});

// ── POST /orders/:id/gar-cancelar-agendamento — cancela agendamento na GAR ────
router.post("/orders/:id/gar-cancelar-agendamento", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) { res.status(404).json({ error: "Pedido não encontrado" }); return; }

  const isAdmin = req.session.role === "admin" || req.session.userType === "admin";
  if (!isAdmin && req.session.userId !== order.userId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const hashVenda = order.garHashVenda;
  if (!hashVenda) { res.status(400).json({ error: "HashVenda GAR indisponível neste pedido" }); return; }

  const [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings?.garApiKey) { res.status(503).json({ error: "GAR API Key não configurada" }); return; }

  try {
    const { garExcluirAgendamento } = await import("../lib/gestaoar");
    await garExcluirAgendamento(settings.garApiKey, hashVenda);

    await db.update(ordersTable).set({
      garAgendamentoDataHora: null,
      garAgendamentoLocalNome: null,
      garAgendamentoLocalHash: null,
      scheduledAt: null,
    }).where(eq(ordersTable.id, id));

    const { logEvent } = await import("../lib/order-events");
    await logEvent(id, "scheduling_confirmed", "Agendamento GAR cancelado", {});

    req.log.info({ orderId: id }, "gar-cancelar-agendamento: agendamento cancelado com sucesso");
    res.json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    req.log.error({ err, orderId: id }, "gar-cancelar-agendamento: erro");
    res.status(502).json({ error: `Erro ao cancelar agendamento na GAR: ${msg}` });
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

  // Endpoint oficial Safeweb: POST /agendamento
  // Body: { localAtendimentoId, protocolo, data, catalogoProdutoId }
  // Ref: https://h-acsafeweb.safewebpss.com.br/hotsite/documentacao-safeweb/home/#/docs/integracao-agenda/agendar
  const { idLocal, localNome, data: dataAgenda, horarioInicio, horarioFim } = req.body ?? {};
  if (!idLocal) { res.status(400).json({ error: "idLocal obrigatório" }); return; }
  if (!dataAgenda) { res.status(400).json({ error: "data obrigatório (YYYY-MM-DD)" }); return; }
  if (!horarioInicio) { res.status(400).json({ error: "horarioInicio obrigatório" }); return; }

  // Monta dataHora para salvar no pedido (ex: "2024-07-23T08:00:00")
  const dataHora = `${dataAgenda}T${horarioInicio}:00`;

  const isReagendar = !!order.safewebAgendamentoId;

  const [s] = await db.select().from(settingsTable).limit(1);
  const isHomol = s?.safewebAmbiente === "homologacao";
  const username = isHomol ? (s?.safewebUsernameHomologacao ?? s?.safewebUsername) : s?.safewebUsername;
  const password = isHomol ? (s?.safewebPasswordHomologacao ?? s?.safewebPassword) : s?.safewebPassword;
  const rawUrl = (isHomol ? s?.safewebUrlHomologacao : s?.safewebUrl) ?? s?.safewebUrl;
  const { swAgendaAgendar, swAgendaCancelar } = await import("../lib/safeweb");

  // Busca catalogoProdutoId (safewebIdProduto) do certificado — docs Safeweb: Int
  const [certRow] = await db
    .select({ safewebIdProduto: certificatesTable.safewebIdProduto })
    .from(certificatesTable)
    .where(eq(certificatesTable.id, order.certificateId!))
    .limit(1);
  const catalogoProdutoId = certRow?.safewebIdProduto
    ? (typeof certRow.safewebIdProduto === "number" ? certRow.safewebIdProduto : parseInt(String(certRow.safewebIdProduto), 10) || undefined)
    : undefined;

  let agendamentoId: string | null = null;

  if (username && password && rawUrl && order.safewebSolicitacaoId) {
    const swUrl = (() => { try { return new URL(rawUrl).origin; } catch { return rawUrl.replace(/\/Service\/.+$/, "").replace(/\/$/, ""); } })();
    const sw = { url: swUrl, username, password, cnpjAr: s?.safewebCnpjAr ?? undefined };

    // Se já há agendamento anterior, cancela antes de reagendar
    // DELETE /agendamento/{protocolo}/{catalogoProdutoId}
    if (isReagendar && order.safewebAgendamentoId && !order.safewebAgendamentoId.startsWith("manual-")) {
      try {
        await swAgendaCancelar(sw, order.safewebSolicitacaoId, catalogoProdutoId);
        req.log.info({ orderId: id }, "safeweb-agendar: agendamento anterior cancelado na Safeweb");
      } catch (err) {
        req.log.warn({ orderId: id, err }, "safeweb-agendar: não foi possível cancelar agendamento anterior, prosseguindo mesmo assim");
      }
    }

    try {
      // Docs oficiais: campo "data" deve ser datetime ISO completo (ex: "2024-07-24T11:00:00")
      const result = await swAgendaAgendar(sw, {
        localAtendimentoId: Number(idLocal),
        protocolo: order.safewebSolicitacaoId,
        data: dataHora,  // datetime completo "YYYY-MM-DDTHH:mm:ss"
        ...(catalogoProdutoId ? { catalogoProdutoId } : {}),
      });
      req.log.info({ orderId: id, result }, "safeweb-agendar: resposta da API");
      if (result.sucesso !== false) {
        agendamentoId = String(result.id ?? result.Id ?? result.idAgendamento ?? result.IdAgendamento ?? `sw-${Date.now()}`);
      } else {
        agendamentoId = `manual-${Date.now()}`;
      }
    } catch (err) {
      req.log.warn({ orderId: id, err }, "safeweb-agendar: erro na API Safeweb, salvando agendamento manualmente");
      agendamentoId = `manual-${Date.now()}`;
    }
  } else {
    agendamentoId = `manual-${Date.now()}`;
  }

  const nomeLocal = localNome || "Videoconferência";
  const horarioLabel = horarioFim ? `${horarioInicio} – ${horarioFim}` : horarioInicio;
  await db.update(ordersTable).set({
    safewebAgendamentoId: agendamentoId,
    safewebAgendamentoDataHora: dataHora,
    safewebAgendamentoLocalNome: nomeLocal,
    scheduledAt: new Date(dataHora),
    status: "aguardando_validacao",
  }).where(eq(ordersTable.id, id));

  const { logEvent } = await import("../lib/order-events");
  const acao = isReagendar ? "Agendamento alterado" : "Atendimento agendado";
  await logEvent(id, "scheduling_confirmed", `${acao}: ${nomeLocal} — ${dataAgenda} ${horarioLabel}`, { agendamentoId, dataHora, isReagendar });

  res.json({ ok: true, dataHora, localNome: nomeLocal, agendamentoId });
});

// ── GET /orders/:id/safeweb-config — configuração de agenda do local Safeweb ──
router.get("/orders/:id/safeweb-config", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const idLocal = parseInt(String(req.query.idLocal ?? ""), 10);
  if (isNaN(idLocal)) { res.status(400).json({ error: "idLocal obrigatório" }); return; }

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
    const { swAgendaConfiguracao } = await import("../lib/safeweb");
    const result = await swAgendaConfiguracao(sw, idLocal);
    req.log.info({ orderId: id, idLocal, result }, "safeweb-config: resposta da API");
    res.json(result ?? {});
  } catch (err) {
    const msg = (err as Error).message ?? "";
    req.log.error({ err, orderId: id, idLocal }, "safeweb-config: erro");
    res.status(502).json({ error: `Erro ao consultar configuração: ${msg}` });
  }
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
    const locais = rawList.map((l) => {
      // Tipos de atendimento: tenta vários campos que a Safeweb pode retornar
      const tiposAtendimento: string[] = [];
      if (Array.isArray(l.TiposAtendimento)) {
        for (const t of l.TiposAtendimento) {
          if (typeof t === "string") tiposAtendimento.push(t);
          else if (t && typeof t.Nome === "string") tiposAtendimento.push(t.Nome);
        }
      } else if (typeof l.TipoAtendimento === "string") {
        tiposAtendimento.push(l.TipoAtendimento);
      } else if (Array.isArray(l.Modalidades)) {
        tiposAtendimento.push(...(l.Modalidades as string[]));
      }

      return {
        id: l.idLocalAtendimento,
        titulo: l.Nome ?? l.RazaoSocial ?? `Local ${l.idLocalAtendimento}`,
        cnpj: l.CNPJ ?? "",
        endereco: [l.Endereco?.Logradouro, l.Endereco?.Numero, l.Endereco?.Complemento].filter(Boolean).join(", "),
        bairro: l.Endereco?.Bairro ?? "",
        cidade: l.Endereco?.Municipio?.Nome ?? "",
        uf: l.Endereco?.Municipio?.UF?.Sigla ?? "",
        cep: l.Endereco?.CEP ?? "",
        tiposAtendimento,
        // Dados brutos para diagnóstico no frontend (quais campos a Safeweb realmente retornou)
        rawData: l,
      };
    });

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
    const { getAgendaBaseUrl, swGetToken } = await import("../lib/safeweb");

    // Endpoint oficial Safeweb: GET /horarios/{localAtendimentoId}/{data}
    // Ref: https://h-acsafeweb.safewebpss.com.br/hotsite/documentacao-safeweb/home/#/docs/integracao-agenda/listar
    if (!idLocalParam) {
      res.status(400).json({ error: "idLocal obrigatório para buscar horários" }); return;
    }

    // Endpoint oficial: GET /horarios/{localAtendimentoId}/{data}
    // A data é parte do PATH (não query). Se omitida, Safeweb retorna horários de HOJE.
    // Resposta: { localAtendimentoId, data, atendimentos:[{horarioInicio,horarioFim,bloqueado,agendado,tipoIdentificacaoId}] }
    const dateParam = req.query.date ? String(req.query.date) : new Date().toISOString().split("T")[0];

    // IMPORTANTE: agenda usa host diferente do da API principal (pss vs acsafeweb)
    const agendaBase = getAgendaBaseUrl(swUrl);
    const slotsUrl = `${agendaBase}/Service/MicroService/Agenda/Agendamentos/api/Integracao/horarios/${idLocalParam}/${dateParam}`;

    req.log.info({ orderId: id, url: slotsUrl, agendaBase, date: dateParam }, "safeweb-slots: chamando API");

    const sw = { url: swUrl, username, password, cnpjAr: s?.safewebCnpjAr ?? undefined };
    const token = await swGetToken(sw);
    const H: Record<string, string> = { Authorization: token, "Content-Type": "application/json" };

    const r = await fetch(slotsUrl, { headers: H });
    const bodyText = await r.text();
    req.log.info({ orderId: id, status: r.status, body: bodyText.slice(0, 1000) }, "safeweb-slots: resposta");

    if (!r.ok) {
      req.log.warn({ orderId: id, status: r.status, body: bodyText }, "safeweb-slots: API retornou erro");
      res.json({ slots: [] }); return;
    }

    let raw: Record<string, unknown> = {};
    try { raw = JSON.parse(bodyText) as Record<string, unknown>; } catch { /* ignore */ }

    // Resposta: { localAtendimentoId, data, atendimentos:[{horarioInicio,horarioFim,bloqueado,agendado,tipoIdentificacaoId}] }
    const atendimentos = (Array.isArray(raw?.atendimentos) ? raw.atendimentos : []) as Record<string, unknown>[];
    const slots = atendimentos
      .filter(a => !a.bloqueado && !a.agendado)
      .map(a => ({
        data: dateParam,
        horarioInicio: String(a.horarioInicio ?? ""),
        horarioFim: String(a.horarioFim ?? ""),
        bloqueado: Boolean(a.bloqueado),
        agendado: Boolean(a.agendado),
        tipoIdentificacaoId: a.tipoIdentificacaoId as number | undefined,
      }))
      .filter(s => s.horarioInicio);

    req.log.info({ orderId: id, totalSlots: slots.length, date: dateParam }, "safeweb-slots: horários disponíveis");
    res.json({ slots });
  } catch (err) {
    req.log.warn({ orderId: id, err }, "safeweb-slots: erro ao listar horários");
    res.json({ slots: [] });
  }
});

export default router;
