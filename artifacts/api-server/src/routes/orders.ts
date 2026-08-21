import { Router } from "express";
import { eq, desc, ilike, or, sql } from "drizzle-orm";
import { db, ordersTable, usersTable, certificatesTable, settingsTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { notifyOrderStatus, notifyScheduling, sendWaText } from "../lib/notify";
import { logger } from "../lib/logger";
import { swConsultaCPF, swConsultaCNPJ, swBiometriaPSBioGlobal, swHasPsbio, swHopeSolicitation, type SafewebSettings } from "../lib/safeweb";
import { garPsBio } from "../lib/gestaoar";

const router = Router();

function certificatePriceForUser(
  certificate: { price: unknown; priceContador: unknown },
  userType?: string | null,
): number {
  const standardPrice = Number.parseFloat(String(certificate.price)) || 0;
  if (userType !== "contador" || certificate.priceContador == null) return standardPrice;

  const contadorPrice = Number.parseFloat(String(certificate.priceContador));
  return Number.isFinite(contadorPrice) ? contadorPrice : standardPrice;
}

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
    cnhVersoPath: o.cnhVersoPath,
    cartaoCnpjPath: o.cartaoCnpjPath,
    fichaCadastralPath: o.fichaCadastralPath,
    outrosPath: o.outrosPath,
    termsAcceptedAt: o.termsAcceptedAt,
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
    mpBoletoUrl: o.mpBoletoUrl ?? null,
    mpBoletoBarcode: o.mpBoletoBarcode ?? null,
    // Gestão AR
    garPedido: o.garPedido,
    garProtocolo: o.garProtocolo,
    garHashVenda: o.garHashVenda,
    garStatus: o.garStatus,
    garAgendamentoLink: o.garAgendamentoLink,
    garHopeUploadUrl: o.garHopeUploadUrl,
    garDocsConfirmed: o.garDocsConfirmed,
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
    paymentMethod: o.paymentMethod ?? null,
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
    const psbioResult = await swBiometriaPSBioGlobal(sw, cpfParaPsbio, dataNascimento);
    const hasPsbio = swHasPsbio(psbioResult);

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
    addressZipcode, addressStreet, addressNumber, addressNeighborhood, addressCity, addressState, addressIbge,
    customerCei, customerNis,
    representanteCpf, representanteNascimento,
    representanteDocTipo, representanteDocNumero, representanteDocEmissor,
    cnhPath, cnhVersoPath, cartaoCnpjPath, fichaCadastralPath, outrosPath, termsAccepted,
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
  const [buyer] = await db
    .select({ userType: usersTable.userType })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const basePrice = certificatePriceForUser(cert, buyer?.userType);
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
    addressIbge: addressIbge || null,
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
    cnhVersoPath: cnhVersoPath || null,
    cartaoCnpjPath: cartaoCnpjPath || null,
    fichaCadastralPath: fichaCadastralPath || null,
    outrosPath: outrosPath || null,
    termsAcceptedAt: termsAccepted ? new Date() : null,
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
      status: "created",
      total,
      certName: cert.name,
    }).catch((err: unknown) => logger.error({ err }, "Erro ao notificar criação de pedido"));
  }

  res.status(201).json(orderRow(order, null, cert.name));
});

router.get("/orders/pre-fill", requireAuth, async (req, res): Promise<void> => {
  const cpf = String(req.query.cpf ?? "").replace(/\D/g, "");
  if (cpf.length !== 11) {
    res.status(400).json({ error: "CPF inválido." });
    return;
  }

  const rows = await db
    .select({ order: ordersTable })
    .from(ordersTable)
    .where(eq(ordersTable.representanteCpf, cpf))
    .orderBy(desc(ordersTable.createdAt));

  if (rows.length === 0) {
    res.json({ responsavel: null, cpfPessoal: null, empresas: [], notaFiscal: null });
    return;
  }

  const withAddr = rows.find(r => r.order.representanteAddressStreet) ?? rows[0];
  const responsavel = withAddr.order.representanteNascimento ? {
    nome: withAddr.order.customerName,
    nascimento: withAddr.order.representanteNascimento,
    docTipo: withAddr.order.representanteDocTipo,
    docNumero: withAddr.order.representanteDocNumero,
    addressZipcode: withAddr.order.representanteAddressZipcode,
    addressStreet: withAddr.order.representanteAddressStreet,
    addressNumber: withAddr.order.representanteAddressNumber,
    addressComplement: withAddr.order.representanteAddressComplement,
    addressNeighborhood: withAddr.order.representanteAddressNeighborhood,
    addressCity: withAddr.order.representanteAddressCity,
    addressState: withAddr.order.representanteAddressState,
  } : null;

  const seen = new Set<string>();
  const empresas = rows
    .filter(r => r.order.clientType === "cnpj" && r.order.companyName)
    .filter(r => {
      const k = r.order.customerCpfCnpj;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(r => ({
      cnpj: r.order.customerCpfCnpj,
      nome: r.order.companyName!,
      email: r.order.customerEmail,
      phone: r.order.customerPhone,
    }));

  const cpfRow = rows.find(r => r.order.clientType === "cpf");
  const cpfPessoal = cpfRow
    ? { email: cpfRow.order.customerEmail, phone: cpfRow.order.customerPhone }
    : null;

  const nfRow = rows.find(r => r.order.nfNome);
  const notaFiscal = nfRow ? {
    cpfCnpj: nfRow.order.nfCnpj,
    nome: nfRow.order.nfNome,
    zipcode: nfRow.order.nfZipcode,
    street: nfRow.order.nfStreet,
    number: nfRow.order.nfNumber,
    complement: nfRow.order.nfComplement,
    neighborhood: nfRow.order.nfNeighborhood,
    city: nfRow.order.nfCity,
    state: nfRow.order.nfState,
  } : null;

  res.json({ responsavel, cpfPessoal, empresas, notaFiscal });
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

// ── DELETE /orders/:id — exclui pedido aguardando pagamento ──────────────────
// Disponível para o próprio dono (pending_payment) ou admin (qualquer status pendente)
router.delete("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const userId = req.session.userId as number;
  const role   = req.session.role as string;

  const [order] = await db
    .select({ id: ordersTable.id, status: ordersTable.status, userId: ordersTable.userId, orderNumber: ordersTable.orderNumber })
    .from(ordersTable)
    .where(eq(ordersTable.id, id))
    .limit(1);

  if (!order) { res.status(404).json({ error: "Pedido não encontrado." }); return; }

  // Usuário comum: só pode excluir o próprio pedido em pending_payment
  if (role !== "admin") {
    if (order.userId !== userId) { res.status(403).json({ error: "Acesso negado." }); return; }
    if (order.status !== "pending_payment") {
      res.status(400).json({ error: "Apenas pedidos aguardando pagamento podem ser excluídos." });
      return;
    }
  } else {
    // Admin: pode excluir pending_payment, created ou cancelled
    const allowedStatuses = ["pending_payment", "created", "cancelled"];
    if (!allowedStatuses.includes(order.status)) {
      res.status(400).json({ error: "Pedido não pode ser excluído neste status." });
      return;
    }
  }

  // Confirmar: últimos 4 dígitos do número do pedido
  const { confirmDigits } = req.body ?? {};
  const last4 = String(order.orderNumber).slice(-4);
  if (String(confirmDigits) !== last4) {
    res.status(400).json({ error: "Os últimos 4 dígitos do número do pedido estão incorretos." });
    return;
  }

  await db.delete(ordersTable).where(eq(ordersTable.id, id));

  req.log.info({ orderId: id, deletedBy: userId, role }, "Pedido excluído");
  res.json({ ok: true });
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
    const responsiblePhone = order.userId
      ? await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, order.userId)).limit(1).then(r => r[0]?.phone ?? null)
      : null;
    notifyOrderStatus({
      to: order.customerEmail,
      phone: order.customerPhone,
      responsiblePhone,
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      status: order.status,
    }).catch((err: unknown) => logger.error({ err }, "Erro ao notificar status do pedido"));

    // Auto-emit NFS-e when order status changes to "emitido"
    if (status === "emitido") {
      import("./nfse").then(({ emitNfseForOrder }) => {
        db.select({ autoEmit: settingsTable.nfseAutoEmit })
          .from(settingsTable).limit(1)
          .then(rows => {
            if (rows[0]?.autoEmit === "1") {
              return emitNfseForOrder(id);
            }
            return;
          })
          .catch((err: unknown) => logger.error({ err, orderId: id }, "Auto-emit NFS-e falhou"));
      }).catch(() => { /* ignore */ });
    }
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
  if (!row) { res.status(404).json({ error: "Pedido não encontrado." }); return; }

  const [settings] = await db.select().from(settingsTable).limit(1);
  const mpToken = settings?.mpAccessToken || "";
  if (!mpToken) {
    res.status(400).json({ error: "Chaves do MercadoPago não configuradas." }); return;
  }

  const siteUrl = settings?.siteUrl || "https://lealcert.com.br";
  const total = parseFloat(row.order.total);
  const cpfDigits = row.order.customerCpfCnpj.replace(/\D/g, "");
  const payerEmail = "naorespondamp@lealcert.com.br";
  const nameParts = (row.order.customerName || "Cliente").split(" ");
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ") || firstName;
  const descricao = row.certName ?? "Certificado Digital";
  const orderNumber = row.order.orderNumber;

  const { logEvent: logPayEv } = await import("../lib/order-events");

  // Método padrão: pix (retrocompatibilidade com detalhe do pedido que não envia body)
  const method: string = (req.body?.method as string) ?? "pix";

  // Regras de valor mínimo por método
  if (method === "cartao" && total < 150) {
    res.status(400).json({ error: "Cartão de crédito disponível apenas para valores acima de R$ 150,00." }); return;
  }
  if (method === "boleto" && total < 90) {
    res.status(400).json({ error: "Boleto disponível apenas para valores a partir de R$ 90,00." }); return;
  }
  if (!["pix", "boleto", "cartao"].includes(method)) {
    res.status(400).json({ error: "Método de pagamento inválido." }); return;
  }

  const payer = {
    email: payerEmail, first_name: firstName, last_name: lastName,
    identification: { type: cpfDigits.length === 14 ? "CNPJ" : "CPF", number: cpfDigits },
  };

  try {
    if (method === "pix") {
      const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json", "X-Idempotency-Key": `${orderNumber}-pix-${Date.now()}` },
        body: JSON.stringify({ transaction_amount: total, description: descricao, payment_method_id: "pix", external_reference: orderNumber, notification_url: `${siteUrl}/api/mp/webhook`, payer }),
      });
      const data = await mpRes.json() as { id?: number; status?: string; point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } }; message?: string; error?: string };
      if (!mpRes.ok) {
        await logPayEv(id, "payment_failed", `Erro ao gerar PIX: ${data.message ?? data.error ?? "resposta inválida do MP"}`, { mpError: data.message ?? data.error });
        res.status(400).json({ error: data.message ?? data.error ?? "Erro ao gerar PIX." }); return;
      }
      const txData = data.point_of_interaction?.transaction_data;
      if (!txData?.qr_code) { res.status(400).json({ error: "MercadoPago não retornou o QR Code PIX." }); return; }
      await db.update(ordersTable).set({ mpPreferenceId: String(data.id ?? ""), mpPaymentId: String(data.id ?? "") }).where(eq(ordersTable.id, id));
      await logPayEv(id, "payment_initiated", `Pagamento PIX gerado — R$ ${total.toFixed(2).replace(".", ",")}`, { mpPaymentId: data.id });
      res.json({ paymentId: String(data.id ?? ""), method: "pix", pixQrCode: txData.qr_code, pixQrCodeBase64: txData.qr_code_base64 ?? "" });

    } else if (method === "boleto") {
      const boletoPayer = {
        ...payer,
        address: {
          zip_code: String(row.order.addressZipcode ?? row.order.representanteAddressZipcode ?? "").replace(/\D/g, ""),
          street_name: String(row.order.addressStreet ?? ""),
          street_number: String(row.order.addressNumber ?? ""),
          neighborhood: String(row.order.addressNeighborhood ?? ""),
          city: String(row.order.addressCity ?? ""),
          federal_unit: String(row.order.addressState ?? "").slice(0, 2).toUpperCase(),
        },
      };
      const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json", "X-Idempotency-Key": `${orderNumber}-boleto-${Date.now()}` },
        body: JSON.stringify({ transaction_amount: total, description: descricao, payment_method_id: "bolbradesco", external_reference: orderNumber, notification_url: `${siteUrl}/api/mp/webhook`, payer: boletoPayer }),
      });
      const data = await mpRes.json() as { id?: number; status?: string; barcode?: { content?: string }; transaction_details?: { external_resource_url?: string }; message?: string; error?: string };
      if (!mpRes.ok) {
        await logPayEv(id, "payment_failed", `Erro ao gerar boleto: ${data.message ?? data.error ?? "resposta inválida do MP"}`, { mpError: data.message ?? data.error });
        res.status(400).json({ error: data.message ?? data.error ?? "Erro ao gerar boleto." }); return;
      }
      const boletoUrl = data.transaction_details?.external_resource_url ?? null;
      const boletoBarcode = data.barcode?.content ?? null;
      req.log.info({ mpId: data.id, mpStatus: data.status, boletoUrl, boletoBarcode }, "MP boleto response");
      await db.update(ordersTable).set({ mpPreferenceId: String(data.id ?? ""), mpPaymentId: String(data.id ?? ""), mpBoletoUrl: boletoUrl, mpBoletoBarcode: boletoBarcode }).where(eq(ordersTable.id, id));
      await logPayEv(id, "payment_initiated", `Boleto gerado — R$ ${total.toFixed(2).replace(".", ",")}`, { mpPaymentId: data.id, boletoUrl, boletoBarcode });
      res.json({ paymentId: String(data.id ?? ""), method: "boleto", boletoUrl, boletoBarcode });

    } else {
      // Cartão: tokenização server-side via MP
      const { cardNumber = "", cardName = "", cardExpiry = "", cardCvv = "", installments = 1 } = req.body ?? {};
      const cleanCard = String(cardNumber).replace(/\D/g, "");
      const [expMonth, expYear] = String(cardExpiry).split("/");
      if (cleanCard.length < 13) { res.status(400).json({ error: "Número do cartão inválido." }); return; }
      if (!cardName?.trim()) { res.status(400).json({ error: "Nome no cartão obrigatório." }); return; }
      if (!expMonth || !expYear) { res.status(400).json({ error: "Validade do cartão inválida." }); return; }
      if (String(cardCvv).length < 3) { res.status(400).json({ error: "CVV inválido." }); return; }

      // 1. Criar card token via MP
      const tokenRes = await fetch("https://api.mercadopago.com/v1/card_tokens", {
        method: "POST",
        headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          card_number: cleanCard,
          expiration_month: parseInt(expMonth, 10),
          expiration_year: parseInt(expYear.length === 2 ? `20${expYear}` : expYear, 10),
          security_code: String(cardCvv),
          cardholder: { name: String(cardName).toUpperCase() },
        }),
      });
      const tokenData = await tokenRes.json() as { id?: string; first_six_digits?: string; payment_method_id?: string; message?: string; error?: string };
      if (!tokenRes.ok || !tokenData.id) {
        const { mapMpError } = await import("../lib/mp-utils");
        res.status(400).json({ error: mapMpError(tokenData.message ?? tokenData.error) }); return;
      }

      const { getMpPaymentMethodId } = await import("../lib/mp-utils");
      const paymentMethodId = tokenData.payment_method_id || await getMpPaymentMethodId(cleanCard, mpToken);

      // 2. Cobrar com o token
      const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json", "X-Idempotency-Key": `${orderNumber}-card-${Date.now()}` },
        body: JSON.stringify({
          transaction_amount: total,
          token: tokenData.id,
          description: descricao,
          installments: Number(installments ?? 1),
          payment_method_id: paymentMethodId,
          external_reference: orderNumber,
          notification_url: `${siteUrl}/api/mp/webhook`,
          payer: { email: payerEmail, identification: { type: cpfDigits.length === 14 ? "CNPJ" : "CPF", number: cpfDigits } },
        }),
      });
      const data = await mpRes.json() as { id?: number; status?: string; status_detail?: string; message?: string; error?: string };
      if (!mpRes.ok) {
        const { mapMpError } = await import("../lib/mp-utils");
        res.status(400).json({ error: mapMpError(data.message ?? data.error) }); return;
      }
      await db.update(ordersTable).set({ mpPreferenceId: String(data.id ?? ""), mpPaymentId: String(data.id ?? "") }).where(eq(ordersTable.id, id));
      await logPayEv(id, "payment_initiated", `Pagamento por cartão gerado — R$ ${total.toFixed(2).replace(".", ",")}`, { mpPaymentId: data.id });

      const approved = data.status === "approved";
      const inProcess = data.status === "in_process" || data.status === "authorized";
      const rejected = data.status === "rejected" || data.status === "cancelled";

      if (approved) {
        await db.update(ordersTable).set({ status: "paid" }).where(eq(ordersTable.id, id));
        await logPayEv(id, "payment_confirmed", `Pagamento por cartão aprovado — R$ ${total.toFixed(2).replace(".", ",")}`, { mpPaymentId: data.id });
        const activeProvider = settings?.activeProvider ?? "gestaoar";
        const { garAutoComprar } = await import("../lib/gar-auto");
        const { swAutoComprar } = await import("../lib/sw-auto");
        if (activeProvider === "safeweb") swAutoComprar(id).catch(() => {});
        else garAutoComprar(id).catch(() => {});
      } else if (rejected) {
        await logPayEv(id, "payment_failed", `Pagamento por cartão recusado — ${data.status_detail ?? data.status}`, { mpPaymentId: data.id });
      } else if (inProcess) {
        await logPayEv(id, "payment_in_process", `Pagamento por cartão em análise — R$ ${total.toFixed(2).replace(".", ",")}`, { mpPaymentId: data.id });
      }

      res.json({ paymentId: String(data.id ?? ""), method: "cartao", approved, inProcess, rejected, mpStatusDetail: data.status_detail ?? null });
    }
  } catch (err) {
    req.log.error({ err }, "orders/:id/payment error");
    res.status(500).json({ error: "Erro interno ao processar pagamento." });
  }
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
  const syncResponsiblePhone = order.userId
    ? await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, order.userId)).limit(1).then(r => r[0]?.phone ?? null)
    : null;
  notifyOrderStatus({
    to: order.customerEmail,
    phone: order.customerPhone,
    responsiblePhone: syncResponsiblePhone,
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

    notifyOrderStatus({
      to: order.customerEmail,
      phone: order.customerPhone,
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      status: "cancelled",
    }).catch((err: unknown) => req.log.error({ err }, "Erro ao notificar cancelamento Safeweb"));

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
    const { garAgendar, garExcluirAgendamento } = await import("../lib/gestaoar");

    // Se já existe agendamento ativo, cancela na GAR antes de criar o novo
    if (isReagendar) {
      try {
        await garExcluirAgendamento(settings.garApiKey, hashVenda, order.garPedido);
        req.log.info({ orderId: id }, "agendar-gar: agendamento anterior cancelado na GAR antes de reagendar");
      } catch (cancelErr) {
        req.log.warn({ err: cancelErr, orderId: id }, "agendar-gar: não foi possível cancelar agendamento anterior (continuando mesmo assim)");
      }
    }

    const result = await garAgendar(settings.garApiKey, hashVenda, hashLocal, dataInicial, dataFinal);
    req.log.info({ orderId: id, result }, "agendar-gar: resposta da API");

    // API retorna [] em sucesso, ou array/objeto de erros
    const erros = Array.isArray(result)
      ? (result as Array<{ Ocorrencia?: string; ErrorDescription?: string }>).filter(e => e.Ocorrencia || e.ErrorDescription)
      : (result.Erros ?? []);
    if (erros.length) {
      const msg = erros.map((e: { Ocorrencia?: string; ErrorDescription?: string }) => e.Ocorrencia ?? e.ErrorDescription ?? "Erro").join("; ");
      req.log.warn({ orderId: id, erros }, "agendar-gar: erros retornados pela GAR");
      res.status(400).json({ error: msg }); return;
    }

    const garResult = Array.isArray(result) ? null : result;
    const nomeLocal = localNome || garResult?.NomeLocalAgendamento || "Videoconferência";
    const dataHoraStr = garResult?.DataHoraAgendamento || dataInicial;
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

    const garResponsiblePhone = order.userId
      ? await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, order.userId)).limit(1).then(r => r[0]?.phone ?? null)
      : null;
    notifyScheduling({
      to: order.customerEmail,
      phone: order.customerPhone,
      responsiblePhone: garResponsiblePhone,
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      protocolo: order.garProtocolo ?? order.garHashVenda ?? String(id),
      localNome: nomeLocal,
      dataHora: dataHoraStr,
    }).catch((err: unknown) => req.log.error({ err }, "agendar-gar: erro ao notificar agendamento"));

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

  // GAR deve confirmar o cancelamento antes de remover do nosso sistema.
  // Se a GAR rejeitar, retorna erro e NÃO altera o banco.
  try {
    const { garExcluirAgendamento } = await import("../lib/gestaoar");
    const garResult = await garExcluirAgendamento(settings.garApiKey, hashVenda, order.garPedido);
    req.log.info({ orderId: id, hashVenda, garResult }, "gar-cancelar-agendamento: cancelado na GAR");
  } catch (garErr) {
    req.log.warn({ err: garErr, orderId: id, hashVenda, garPedido: order.garPedido }, "gar-cancelar-agendamento: GAR rejeitou — agendamento NÃO removido do sistema");
    res.status(502).json({
      error: `Não foi possível cancelar o agendamento na Gestão AR: ${(garErr as Error).message ?? ""}. O agendamento permanece ativo no sistema. Cancele diretamente no portal da AR e tente novamente.`,
    });
    return;
  }

  // GAR confirmou com sucesso — agora remove do nosso banco
  try {
    await db.update(ordersTable).set({
      garAgendamentoDataHora: null,
      garAgendamentoLocalNome: null,
      garAgendamentoLocalHash: null,
      garAgendamentoSlotHash: null,
      scheduledAt: null,
    }).where(eq(ordersTable.id, id));

    const { logEvent } = await import("../lib/order-events");
    await logEvent(id, "scheduling_confirmed", "Agendamento GAR cancelado com sucesso", {});

    const cancelResponsiblePhone = order.userId
      ? await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, order.userId)).limit(1).then(r => r[0]?.phone ?? null)
      : null;
    sendWaText(
      order.customerPhone,
      `*LealCert — Agendamento Cancelado* ❌\n\nOlá, *${order.customerName}*!\n\nSeu agendamento do pedido *#${order.orderNumber}* foi cancelado.\n\nEntre em contato conosco para reagendar seu atendimento. 📅`,
    ).catch((err: unknown) => req.log.error({ err }, "gar-cancelar-agendamento: erro ao notificar cliente"));
    if (cancelResponsiblePhone) {
      sendWaText(
        cancelResponsiblePhone,
        `*LealCert — Agendamento cancelado* ❌\n\nO agendamento de *${order.customerName}* (Pedido #${order.orderNumber}) foi cancelado.\n\nAcesse o painel para reagendar.`,
      ).catch((err: unknown) => req.log.error({ err }, "gar-cancelar-agendamento: erro ao notificar responsável"));
    }

    req.log.info({ orderId: id }, "gar-cancelar-agendamento: concluído");
    res.json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    req.log.error({ err, orderId: id }, "gar-cancelar-agendamento: erro ao atualizar banco após cancelar na GAR");
    res.status(500).json({ error: `Agendamento cancelado na GAR mas erro interno ao atualizar sistema: ${msg}` });
  }
});

// ── POST /orders/:id/confirm-docs — marca documentos como enviados ────────────
router.post("/orders/:id/confirm-docs", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [order] = await db.select({ id: ordersTable.id, userId: ordersTable.userId }).from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) { res.status(404).json({ error: "Pedido não encontrado" }); return; }

  // Permite o próprio cliente ou admin confirmar
  const isAdmin = req.session.role === "admin" || req.session.userType === "admin";
  const isOwner = req.session.userId && order.userId === req.session.userId;
  if (!isAdmin && !isOwner) { res.status(403).json({ error: "Acesso negado" }); return; }

  await db.update(ordersTable).set({ garDocsConfirmed: true }).where(eq(ordersTable.id, id));
  res.json({ ok: true });
});

// ── POST /orders/:id/hope-solicitation — gera URL de envio de documentos via Hope ──
router.post("/orders/:id/hope-solicitation", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) { res.status(404).json({ error: "Pedido não encontrado" }); return; }
  if (!order.garProtocolo) { res.status(400).json({ error: "Pedido não possui protocolo GAR" }); return; }

  const [s] = await db.select().from(settingsTable).limit(1);
  if (!s?.safewebUrl || !s?.safewebUsername || !s?.safewebPassword) {
    res.status(400).json({ error: "Configurações Safeweb não encontradas" }); return;
  }
  const swSettings = { url: s.safewebUrl, username: s.safewebUsername, password: s.safewebPassword };

  try {
    const result = await swHopeSolicitation(swSettings, order.garProtocolo);
    const url = result.url ?? null;
    await db.update(ordersTable).set({ garHopeUploadUrl: url }).where(eq(ordersTable.id, id));
    req.log.info({ orderId: id, url }, "hope-solicitation: URL gerada com sucesso");
    res.json({ url });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    req.log.error({ err, orderId: id }, "hope-solicitation: erro");
    res.status(502).json({ error: `Erro ao criar solicitação Hope: ${msg}` });
  }
});

// ── POST /orders/:id/approve-payment — aprovação manual de pagamento ─────────
router.post("/orders/:id/approve-payment", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { motivo } = req.body ?? {};
  if (!motivo?.trim()) {
    res.status(400).json({ error: "Motivo da aprovação é obrigatório." }); return;
  }

  const [row] = await db
    .select({ order: ordersTable, certName: certificatesTable.name })
    .from(ordersTable)
    .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
    .where(eq(ordersTable.id, id))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Pedido não encontrado" }); return; }
  const order = row.order;

  if (!["pending_payment", "created"].includes(order.status)) {
    res.status(400).json({ error: `Aprovação manual não permitida: pedido está com status "${order.status}".` }); return;
  }

  await db.update(ordersTable).set({ status: "paid" }).where(eq(ordersTable.id, id));

  const { logEvent: logApproveEv } = await import("../lib/order-events");
  await logApproveEv(id, "payment_confirmed", `Pagamento aprovado manualmente pelo admin. Motivo: ${motivo.trim()}`, { motivo: motivo.trim(), adminId: req.session.userId });

  const { notifyOrderStatus: notifyApprove } = await import("../lib/notify");
  const approveResponsiblePhone = order.userId
    ? await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, order.userId)).limit(1).then(r => r[0]?.phone ?? null)
    : null;
  notifyApprove({
    to: order.customerEmail,
    phone: order.customerPhone,
    responsiblePhone: approveResponsiblePhone,
    customerName: order.customerName,
    orderNumber: order.orderNumber,
    status: "paid",
    total: parseFloat(order.total),
    certName: row.certName ?? undefined,
  }).catch((err: unknown) => req.log.error({ err }, "approve-payment: erro ao notificar"));

  const [approveSettings] = await db.select().from(settingsTable).limit(1);
  const approveProvider = approveSettings?.activeProvider ?? "gestaoar";
  if (approveProvider === "safeweb") {
    const { swAutoComprar } = await import("../lib/sw-auto");
    swAutoComprar(id).catch((err: unknown) => req.log.error({ err }, "approve-payment: erro sw-auto"));
  } else {
    const { garAutoComprar } = await import("../lib/gar-auto");
    garAutoComprar(id).catch((err: unknown) => req.log.error({ err }, "approve-payment: erro gar-auto"));
  }

  res.json({ ok: true });
});

// ── POST /orders/:id/trigger-protocol — geração manual de protocolo ───────────
router.post("/orders/:id/trigger-protocol", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) { res.status(404).json({ error: "Pedido não encontrado" }); return; }

  if (order.status !== "paid") {
    res.status(400).json({ error: `Geração de protocolo disponível apenas para pedidos pagos. Status atual: "${order.status}".` }); return;
  }

  const [triggerSettings] = await db.select().from(settingsTable).limit(1);
  const triggerProvider = triggerSettings?.activeProvider ?? "gestaoar";

  try {
    if (triggerProvider === "safeweb") {
      const { swAutoComprar } = await import("../lib/sw-auto");
      await swAutoComprar(id);
    } else {
      const { garAutoComprar } = await import("../lib/gar-auto");
      await garAutoComprar(id);
    }

    const { logEvent: logTriggerEv } = await import("../lib/order-events");
    await logTriggerEv(id, "admin_action", "Geração de protocolo disparada manualmente pelo admin.", { adminId: req.session.userId });

    res.json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message ?? "Erro ao gerar protocolo";
    req.log.error({ err, orderId: id }, "trigger-protocol: erro");
    res.status(502).json({ ok: false, error: msg });
  }
});

// ── POST /orders/:id/gar-cancelar-protocolo — cancela protocolo GAR via Safeweb
router.post("/orders/:id/gar-cancelar-protocolo", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  try {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) { res.status(404).json({ error: "Pedido não encontrado" }); return; }

    if (!order.garProtocolo) {
      res.status(400).json({ error: "Pedido não possui protocolo GAR registrado" }); return;
    }

    const nonCancellableStatuses = ["emitido", "completed", "cancelled", "revogado"];
    if (nonCancellableStatuses.includes(order.status)) {
      res.status(400).json({ error: `Cancelamento não permitido: o pedido está com status "${order.status}".` }); return;
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
    const { motivo, force } = req.body ?? {};

    // force=true: pula Safeweb (protocolo já foi cancelado diretamente no Gestão AR)
    if (!force) {
      try {
        const { swCancelarSolicitacao } = await import("../lib/safeweb");
        const result = await swCancelarSolicitacao(sw, order.garProtocolo);
        req.log.info({ orderId: id, protocolo: order.garProtocolo, result }, "gar-cancelar-protocolo: resposta da Safeweb");
      } catch (swErr) {
        const swMsg = (swErr as Error).message ?? "";
        req.log.warn({ err: swErr, orderId: id }, "gar-cancelar-protocolo: Safeweb retornou erro — protocolo pode já ter sido cancelado no Gestão AR");
        // Retorna 422 para que o frontend pergunte se deseja cancelar só localmente
        res.status(422).json({
          swError: true,
          error: `Não foi possível cancelar na Safeweb: ${swMsg}. O protocolo pode já ter sido cancelado diretamente no Gestão AR.`,
        });
        return;
      }
    }

    // Cancela agendamento GAR ativo se houver
    const hasAgendamento = !!(order.garAgendamentoDataHora || order.garAgendamentoLocalHash);
    if (hasAgendamento && order.garHashVenda && s?.garApiKey) {
      try {
        const { garExcluirAgendamento } = await import("../lib/gestaoar");
        await garExcluirAgendamento(s.garApiKey, order.garHashVenda, order.garPedido);
        req.log.info({ orderId: id }, "gar-cancelar-protocolo: agendamento GAR cancelado junto");
      } catch (agendErr) {
        req.log.warn({ err: agendErr, orderId: id }, "gar-cancelar-protocolo: não foi possível cancelar agendamento GAR (continuando)");
      }
    }

    await db.update(ordersTable).set({
      status: "cancelled",
      garStatus: "Cancelado",
      garSyncedAt: new Date(),
      garAgendamentoDataHora: null,
      garAgendamentoLocalNome: null,
      garAgendamentoLocalHash: null,
      garAgendamentoSlotHash: null,
      scheduledAt: null,
    }).where(eq(ordersTable.id, id));

    const { logEvent } = await import("../lib/order-events");
    const logMsg = force
      ? `Pedido cancelado localmente (protocolo já cancelado diretamente no Gestão AR). Motivo: ${motivo ?? "Cancelado pelo administrador"}`
      : `Protocolo GAR cancelado via Safeweb. Agendamento removido. Motivo: ${motivo ?? "Cancelado pelo administrador"}`;
    await logEvent(id, "order_cancelled", logMsg, { force: !!force });

    notifyOrderStatus({
      to: order.customerEmail,
      phone: order.customerPhone,
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      status: "cancelled",
    }).catch((err: unknown) => req.log.error({ err }, "Erro ao notificar cancelamento GAR"));

    res.json({ ok: true, message: force ? "Pedido cancelado no sistema." : "Protocolo e agendamento cancelados com sucesso." });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    req.log.error({ err, orderId: id }, "gar-cancelar-protocolo: erro");
    res.status(500).json({ error: `Erro ao cancelar pedido: ${msg}` });
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

  const swResponsiblePhone = order.userId
    ? await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, order.userId)).limit(1).then(r => r[0]?.phone ?? null)
    : null;
  notifyScheduling({
    to: order.customerEmail,
    phone: order.customerPhone,
    responsiblePhone: swResponsiblePhone,
    customerName: order.customerName,
    orderNumber: order.orderNumber,
    protocolo: order.safewebSolicitacaoId ? String(order.safewebSolicitacaoId) : String(id),
    localNome: nomeLocal,
    dataHora: `${dataAgenda} ${horarioLabel}`,
  }).catch((err: unknown) => req.log.error({ err }, "safeweb-agendar: erro ao notificar agendamento"));

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
