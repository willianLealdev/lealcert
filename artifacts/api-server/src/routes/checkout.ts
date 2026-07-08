/**
 * Public checkout routes — no auth required.
 * All sensitive operations (PSBio, coupon, user creation, payment) are server-side only.
 */
import { Router } from "express";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, ordersTable, usersTable, certificatesTable, settingsTable, couponsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import {
  swBiometriaPSBioGlobal,
  swConsultaCPF,
  swConsultaCNPJ,
  type SafewebSettings,
} from "../lib/safeweb";
import { sendTempPasswordEmail, sendOrderStatusEmail, sendWelcomeEmail } from "../lib/email";

const router = Router();

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pw = "";
  for (let i = 0; i < 8; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

function generateOrderNumber(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${rand}`;
}

function validarCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(d[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(d[10]);
}

// ── GET /public/checkout/cert/:id — retorna certificado público ───────────────
router.get("/public/checkout/cert/:id", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const [cert] = await db
    .select({
      id: certificatesTable.id,
      name: certificatesTable.name,
      product: certificatesTable.product,
      model: certificatesTable.model,
      validityMonths: certificatesTable.validityMonths,
      price: certificatesTable.price,
      priceContador: certificatesTable.priceContador,
    })
    .from(certificatesTable)
    .where(and(eq(certificatesTable.id, id), eq(certificatesTable.active, true)))
    .limit(1);
  if (!cert) { res.status(404).json({ error: "Certificado não encontrado" }); return; }
  // Return price as number
  res.json({
    ...cert,
    price: parseFloat(cert.price as unknown as string) || 0,
    priceContador: cert.priceContador != null ? parseFloat(cert.priceContador as unknown as string) : null,
  });
});

// ── POST /public/checkout/lookup — verifica se CPF/CNPJ já tem conta ─────────
router.post("/public/checkout/lookup", async (req, res): Promise<void> => {
  const { cpfCnpj, password } = req.body ?? {};
  const doc = String(cpfCnpj ?? "").replace(/\D/g, "");
  if (!doc || (doc.length !== 11 && doc.length !== 14)) {
    res.status(400).json({ found: false, error: "CPF/CNPJ inválido." }); return;
  }
  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      passwordHash: usersTable.passwordHash,
      personType: usersTable.personType,
      isActive: usersTable.isActive,
      role: usersTable.role,
      userType: usersTable.userType,
    })
    .from(usersTable)
    .where(eq(usersTable.cpfCnpj, doc))
    .limit(1);

  if (!user || !user.isActive) {
    res.json({ found: false }); return;
  }

  // Se enviou senha → tentar login
  if (password) {
    const ok = await bcrypt.compare(String(password), user.passwordHash ?? "");
    if (!ok) {
      res.status(401).json({ found: true, authenticated: false, error: "Senha incorreta." }); return;
    }
    // Busca último pedido para pré-preencher dados
    const [lastOrder] = await db
      .select({
        customerName: ordersTable.customerName,
        customerEmail: ordersTable.customerEmail,
        customerPhone: ordersTable.customerPhone,
        customerBirthDate: ordersTable.customerBirthDate,
        companyName: ordersTable.companyName,
        addressZipcode: ordersTable.addressZipcode,
        addressStreet: ordersTable.addressStreet,
        addressNumber: ordersTable.addressNumber,
        addressComplement: ordersTable.addressComplement,
        addressNeighborhood: ordersTable.addressNeighborhood,
        addressCity: ordersTable.addressCity,
        addressState: ordersTable.addressState,
        representanteNascimento: ordersTable.representanteNascimento,
        representanteDocTipo: ordersTable.representanteDocTipo,
        representanteDocNumero: ordersTable.representanteDocNumero,
        representanteDocEmissor: ordersTable.representanteDocEmissor,
        nfCnpj: ordersTable.nfCnpj,
        nfNome: ordersTable.nfNome,
        nfZipcode: ordersTable.nfZipcode,
        nfStreet: ordersTable.nfStreet,
        nfNumber: ordersTable.nfNumber,
        nfComplement: ordersTable.nfComplement,
        nfNeighborhood: ordersTable.nfNeighborhood,
        nfCity: ordersTable.nfCity,
        nfState: ordersTable.nfState,
      })
      .from(ordersTable)
      .where(eq(ordersTable.userId, user.id))
      .orderBy(ordersTable.createdAt)
      .limit(1);

    // Autentica a sessão para que o usuário já esteja logado no painel
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) { reject(err); return; }
        req.session.userId = user.id;
        req.session.role = user.role as string;
        req.session.userType = user.userType as string;
        req.session.save((saveErr) => { if (saveErr) reject(saveErr); else resolve(); });
      });
    });

    res.json({
      found: true,
      authenticated: true,
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      personType: user.personType,
      prefill: lastOrder ?? null,
    });
    return;
  }

  // Sem senha → apenas confirma existência
  res.json({ found: true, name: user.name });
});

// ── POST /public/checkout/bio — valida CPF + PSBio (sem auth) ────────────────
router.post("/public/checkout/bio", async (req, res): Promise<void> => {
  const { cpf, dataNascimento } = req.body ?? {};
  const cpfDigits = String(cpf ?? "").replace(/\D/g, "");

  if (!cpfDigits || cpfDigits.length !== 11) {
    res.status(400).json({ ok: false, mensagem: "CPF inválido." });
    return;
  }
  if (!validarCpf(cpfDigits)) {
    res.status(400).json({ ok: false, mensagem: "CPF inválido — dígitos verificadores incorretos." });
    return;
  }
  if (!dataNascimento) {
    res.status(400).json({ ok: false, mensagem: "Data de nascimento obrigatória." });
    return;
  }

  try {
    const [s] = await db.select().from(settingsTable).limit(1);

    if (!s?.safewebUrl || !s?.safewebUsername || !s?.safewebPassword) {
      res.json({ ok: true, hasPsbio: true, customerName: null, mensagem: "Validação ignorada — PSBio não configurado." });
      return;
    }

    const sw: SafewebSettings = {
      url: s.safewebUrl,
      username: s.safewebUsername,
      password: s.safewebPassword,
      cnpjAr: s.safewebCnpjAr ?? undefined,
    };

    const psbioResult = await swBiometriaPSBioGlobal(sw, cpfDigits);
    const hasPsbio = psbioResult.encontrado === true;

    let customerName: string | null = null;
    try {
      const r = await swConsultaCPF(sw, cpfDigits, dataNascimento);
      if (r.Codigo === 0) {
        customerName = (r.NomeCompleto as string) || (r.Mensagem as string) || null;
      }
    } catch {
      // best-effort
    }

    res.json({
      ok: true,
      hasPsbio,
      customerName,
      mensagem: hasPsbio
        ? "Biometria encontrada — videoconferência disponível."
        : "Biometria não encontrada — atendimento presencial necessário.",
    });
  } catch (err) {
    logger.error({ err }, "public/checkout/bio error");
    res.status(422).json({ ok: false, mensagem: "Não foi possível validar o CPF. Tente novamente." });
  }
});

// ── GET /public/checkout/previous-order — último pedido do CPF (sem auth) ────
router.get("/public/checkout/previous-order", async (req, res): Promise<void> => {
  const cpf = String(req.query.cpf ?? "").replace(/\D/g, "");
  if (cpf.length !== 11) { res.json({ found: false }); return; }

  // Localiza usuário pelo CPF
  const [user] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.cpfCnpj, cpf)).limit(1);
  if (!user) { res.json({ found: false }); return; }

  // Busca último pedido com dados de endereço preenchidos
  const [order] = await db.select({
    customerName: ordersTable.customerName,
    customerEmail: ordersTable.customerEmail,
    customerPhone: ordersTable.customerPhone,
    customerBirthDate: ordersTable.customerBirthDate,
    companyName: ordersTable.companyName,
    addressZipcode: ordersTable.addressZipcode,
    addressStreet: ordersTable.addressStreet,
    addressNumber: ordersTable.addressNumber,
    addressComplement: ordersTable.addressComplement,
    addressNeighborhood: ordersTable.addressNeighborhood,
    addressCity: ordersTable.addressCity,
    addressState: ordersTable.addressState,
    representanteNascimento: ordersTable.representanteNascimento,
    representanteDocTipo: ordersTable.representanteDocTipo,
    representanteDocNumero: ordersTable.representanteDocNumero,
    representanteDocEmissor: ordersTable.representanteDocEmissor,
  }).from(ordersTable)
    .where(and(eq(ordersTable.userId, user.id), isNotNull(ordersTable.addressZipcode)))
    .orderBy(desc(ordersTable.createdAt))
    .limit(1);

  if (!order) { res.json({ found: false }); return; }
  res.json({ found: true, data: order });
});

// ── POST /public/checkout/cnpj-rfb — consulta CNPJ (sem auth) ───────────────
router.post("/public/checkout/cnpj-rfb", async (req, res): Promise<void> => {
  const { cnpj, cpf, dataNascimento } = req.body ?? {};
  const cnpjDigits = String(cnpj ?? "").replace(/\D/g, "");
  const cpfDigits = String(cpf ?? "").replace(/\D/g, "");
  if (!cnpjDigits || !cpfDigits || !dataNascimento) {
    res.status(400).json({ ok: false, mensagem: "CNPJ, CPF e data de nascimento são obrigatórios." });
    return;
  }
  try {
    const [s] = await db.select().from(settingsTable).limit(1);
    if (!s?.safewebUrl || !s?.safewebUsername || !s?.safewebPassword) {
      res.json({ ok: true, razaoSocial: "", repName: "" });
      return;
    }
    const sw: SafewebSettings = { url: s.safewebUrl, username: s.safewebUsername, password: s.safewebPassword, cnpjAr: s.safewebCnpjAr ?? undefined };
    const result = await swConsultaCNPJ(sw, cnpjDigits, cpfDigits, dataNascimento);
    if (result.Codigo === 0) {
      const nome = (result.NomeCompleto as string) || "";
      const msg = (result.Mensagem as string) || "";
      res.json({ ok: true, razaoSocial: nome || msg, repName: msg || nome });
    } else {
      res.json({ ok: false, mensagem: (result.Mensagem as string) ?? "CNPJ não encontrado." });
    }
  } catch (err) {
    logger.error({ err }, "public/checkout/cnpj-rfb error");
    res.status(502).json({ ok: false, mensagem: "Erro ao consultar." });
  }
});

// ── POST /public/checkout/coupon — valida cupom no backend (sem auth) ────────
router.post("/public/checkout/coupon", async (req, res): Promise<void> => {
  const { code, total } = req.body ?? {};
  if (!code) { res.status(400).json({ ok: false, error: "Código obrigatório." }); return; }

  const [coupon] = await db
    .select()
    .from(couponsTable)
    .where(and(eq(couponsTable.code, String(code).toUpperCase().trim()), eq(couponsTable.active, true)))
    .limit(1);

  if (!coupon) { res.status(404).json({ ok: false, error: "Cupom inválido ou expirado." }); return; }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    res.status(400).json({ ok: false, error: "Este cupom está expirado." }); return;
  }
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    res.status(400).json({ ok: false, error: "Este cupom atingiu o limite de uso." }); return;
  }

  const subtotal = parseFloat(String(total ?? 0));
  const discount = coupon.type === "percent"
    ? Math.round(subtotal * parseFloat(String(coupon.value))) / 100
    : Math.min(parseFloat(String(coupon.value)), subtotal);

  res.json({ ok: true, type: coupon.type, value: parseFloat(String(coupon.value)), discount });
});

// ── POST /public/checkout/cep — busca endereço via ViaCEP (proxy) ────────────
router.get("/public/checkout/cep/:cep", async (req, res): Promise<void> => {
  const cep = String(req.params.cep).replace(/\D/g, "");
  if (cep.length !== 8) { res.status(400).json({ error: "CEP inválido." }); return; }
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await r.json() as Record<string, unknown>;
    if (data.erro) { res.status(404).json({ error: "CEP não encontrado." }); return; }
    res.json(data);
  } catch {
    res.status(502).json({ error: "Erro ao consultar CEP." });
  }
});

// ── POST /public/checkout/submit — cria usuário + pedido + gera PIX ──────────
router.post("/public/checkout/submit", async (req, res): Promise<void> => {
  const {
    certificateId,
    personType, // "fisica" | "juridica"
    // dados bio/titular
    cpf, dataNascimento, hasPsbio, customerName,
    customerEmail, customerPhone,
    // e-CNPJ extra
    customerCpfCnpj, companyName, inssNumber,
    // endereço titular
    addressZipcode, addressStreet, addressNumber, addressComplement,
    addressNeighborhood, addressCity, addressState, addressIbge,
    // representante
    representanteCpf, representanteNascimento,
    representanteDocTipo, representanteDocNumero, representanteDocEmissor,
    representanteAddressZipcode, representanteAddressStreet, representanteAddressNumber,
    representanteAddressComplement, representanteAddressNeighborhood, representanteAddressCity, representanteAddressState,
    // NF
    nfCnpj, nfNome, nfZipcode, nfStreet, nfNumber, nfComplement, nfNeighborhood, nfCity, nfState,
    // coupon
    couponCode,
    // Leal Plus
    extendedWarranty,
    // payment method: "pix" | "boleto" | "cartao"
    paymentMethod,
    // cartão (tokenized by MP SDK — never raw card data)
    mpCardToken, mpInstallments, mpPaymentMethodId,
    // terms
    termsAccepted,
  } = req.body ?? {};

  const LEALPLUS_PRICE = 19.90;

  if (!certificateId || !customerName || !customerEmail || !cpf || !termsAccepted) {
    res.status(400).json({ error: "Campos obrigatórios faltando." });
    return;
  }

  const cpfDigits = String(cpf).replace(/\D/g, "");
  const isCnpj = !!(customerCpfCnpj && String(customerCpfCnpj).replace(/\D/g, "").length === 14);
  const clientType: "cpf" | "cnpj" = isCnpj ? "cnpj" : "cpf";
  const docDigits = isCnpj ? String(customerCpfCnpj).replace(/\D/g, "") : cpfDigits;

  // Validate cert exists and is active
  const [cert] = await db
    .select()
    .from(certificatesTable)
    .where(and(eq(certificatesTable.id, Number(certificateId)), eq(certificatesTable.active, true)))
    .limit(1);
  if (!cert) { res.status(400).json({ error: "Certificado não encontrado ou inativo." }); return; }

  const basePrice = parseFloat(String(cert.price));

  // Validate/apply coupon (server-side only)
  let discount = 0;
  let usedCouponId: number | null = null;
  if (couponCode) {
    const [coupon] = await db
      .select()
      .from(couponsTable)
      .where(and(eq(couponsTable.code, String(couponCode).toUpperCase().trim()), eq(couponsTable.active, true)))
      .limit(1);
    if (coupon && !(coupon.expiresAt && new Date(coupon.expiresAt) < new Date())
      && !(coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit)) {
      discount = coupon.type === "percent"
        ? Math.round(basePrice * parseFloat(String(coupon.value))) / 100
        : Math.min(parseFloat(String(coupon.value)), basePrice);
      usedCouponId = coupon.id;
    }
  }

  const lealplusPrice = extendedWarranty ? LEALPLUS_PRICE : 0;
  const total = Math.max(0, basePrice + lealplusPrice - discount);

  // Enforce payment method rules
  if (paymentMethod === "cartao" && total < 150) {
    res.status(400).json({ error: "Cartão de crédito disponível apenas para valores acima de R$ 150,00." });
    return;
  }
  if (paymentMethod === "boleto" && total < 125) {
    res.status(400).json({ error: "Boleto disponível apenas para valores acima de R$ 125,00." });
    return;
  }
  if (!["pix", "boleto", "cartao"].includes(paymentMethod)) {
    res.status(400).json({ error: "Método de pagamento inválido." });
    return;
  }

  const [settings] = await db.select().from(settingsTable).limit(1);
  const mpToken = settings?.mpAccessToken || "";
  if (!mpToken) { res.status(500).json({ error: "Sistema de pagamento não configurado. Contacte o suporte." }); return; }
  const siteUrl = settings?.siteUrl || "https://lealcert.com.br";

  // Find or create user account
  let userId: number;
  let isNewUser = false;
  let tempPassword: string | null = null;

  const existingUser = await db
    .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name, role: usersTable.role, userType: usersTable.userType })
    .from(usersTable)
    .where(eq(usersTable.cpfCnpj, cpfDigits))
    .limit(1);

  if (existingUser.length > 0) {
    userId = existingUser[0].id;
    // Garante que a sessão está ativa para o usuário (caso não tenha feito lookup com senha)
    if (!req.session.userId) {
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) { reject(err); return; }
          req.session.userId = existingUser[0].id;
          req.session.role = existingUser[0].role as string;
          req.session.userType = existingUser[0].userType as string;
          req.session.save((saveErr) => { if (saveErr) reject(saveErr); else resolve(); });
        });
      });
    }
  } else {
    // Create new user with temp password
    isNewUser = true;
    tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const resolvedPersonType = personType === "juridica" ? "juridica" : "fisica";

    const [newUser] = await db.insert(usersTable).values({
      name: String(customerName).trim(),
      email: String(customerEmail).toLowerCase().trim(),
      cpfCnpj: cpfDigits,
      passwordHash,
      phone: customerPhone ? String(customerPhone).replace(/\D/g, "") : null,
      role: "contador",
      userType: "cliente",
      personType: resolvedPersonType,
      isActive: true,
      emailVerified: true,
      mustChangePassword: true,
    }).returning({ id: usersTable.id });
    userId = newUser.id;

    // Loga o novo usuário automaticamente
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) { reject(err); return; }
        req.session.userId = userId;
        req.session.role = "contador";
        req.session.userType = "cliente";
        req.session.save((saveErr) => { if (saveErr) reject(saveErr); else resolve(); });
      });
    });
  }

  // Create order
  let orderNumber: string;
  do {
    orderNumber = generateOrderNumber();
    const [existing] = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.orderNumber, orderNumber)).limit(1);
    if (!existing) break;
  } while (true);

  const [order] = await db.insert(ordersTable).values({
    orderNumber,
    userId,
    certificateId: Number(certificateId),
    status: "pending_payment",
    total: String(total),
    clientType,
    customerName: String(customerName).trim(),
    customerCpfCnpj: docDigits,
    customerEmail: String(customerEmail).toLowerCase().trim(),
    customerPhone: customerPhone ? String(customerPhone).replace(/\D/g, "") : null,
    customerBirthDate: dataNascimento || null,
    hasPsbio: hasPsbio !== undefined ? Boolean(hasPsbio) : null,
    companyName: companyName || null,
    inssNumber: inssNumber || null,
    addressZipcode: addressZipcode ? String(addressZipcode).replace(/\D/g, "") : null,
    addressStreet: addressStreet || null,
    addressNumber: addressNumber || null,
    addressComplement: addressComplement || null,
    addressNeighborhood: addressNeighborhood || null,
    addressCity: addressCity || null,
    addressState: addressState || null,
    addressIbge: addressIbge || null,
    representanteCpf: representanteCpf ? String(representanteCpf).replace(/\D/g, "") : null,
    representanteNascimento: representanteNascimento || null,
    representanteDocTipo: representanteDocTipo || null,
    representanteDocNumero: representanteDocNumero || null,
    representanteDocEmissor: representanteDocEmissor || null,
    representanteAddressZipcode: representanteAddressZipcode ? String(representanteAddressZipcode).replace(/\D/g, "") : null,
    representanteAddressStreet: representanteAddressStreet || null,
    representanteAddressNumber: representanteAddressNumber || null,
    representanteAddressComplement: representanteAddressComplement || null,
    representanteAddressNeighborhood: representanteAddressNeighborhood || null,
    representanteAddressCity: representanteAddressCity || null,
    representanteAddressState: representanteAddressState || null,
    nfCnpj: nfCnpj ? String(nfCnpj).replace(/\D/g, "") : null,
    nfNome: nfNome || null,
    nfZipcode: nfZipcode ? String(nfZipcode).replace(/\D/g, "") : null,
    nfStreet: nfStreet || null,
    nfNumber: nfNumber || null,
    nfComplement: nfComplement || null,
    nfNeighborhood: nfNeighborhood || null,
    nfCity: nfCity || null,
    nfState: nfState || null,
    certNameSnapshot: cert.name,
    certProductSnapshot: cert.product || null,
    termsAcceptedAt: termsAccepted ? new Date() : null,
    extendedWarranty: extendedWarranty ? true : false,
  }).returning();

  // Increment coupon usage
  if (usedCouponId) {
    await db.update(couponsTable)
      .set({ usageCount: (await db.select({ c: couponsTable.usageCount }).from(couponsTable).where(eq(couponsTable.id, usedCouponId)).limit(1))[0].c + 1 })
      .where(eq(couponsTable.id, usedCouponId));
  }

  // Envio de email: pedido criado + boas-vindas para novo usuário
  const emailTo = String(customerEmail).toLowerCase().trim();
  const emailName = String(customerName).trim();
  sendOrderStatusEmail({ to: emailTo, customerName: emailName, orderNumber, status: "created", certName: cert.name, total })
    .catch((err: unknown) => logger.error({ err }, "checkout: erro ao enviar email pedido criado"));
  if (isNewUser) {
    sendWelcomeEmail(emailTo, emailName, "cliente")
      .catch((err: unknown) => logger.error({ err }, "checkout: erro ao enviar email boas-vindas"));
  }

  // Generate payment
  const cpfForPayer = cpfDigits;
  const nameParts = String(customerName).split(" ");
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ") || firstName;
  const payerEmail = `naoresponda@lealcert.com.br`;

  try {
    if (paymentMethod === "pix") {
      const pixPayload = {
        transaction_amount: total,
        description: cert.name,
        payment_method_id: "pix",
        external_reference: orderNumber,
        notification_url: `${siteUrl}/api/mp/webhook`,
        payer: {
          email: payerEmail,
          first_name: firstName,
          last_name: lastName,
          identification: { type: "CPF", number: cpfForPayer },
        },
      };

      const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mpToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `${orderNumber}-pix-${Date.now()}`,
        },
        body: JSON.stringify(pixPayload),
      });
      const mpData = await mpRes.json() as {
        id?: number; status?: string;
        point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
        message?: string; error?: string;
      };

      if (!mpRes.ok) {
        res.status(400).json({ error: mpData.message ?? mpData.error ?? "Erro ao gerar PIX." });
        return;
      }

      const txData = mpData.point_of_interaction?.transaction_data;
      if (!txData?.qr_code) {
        res.status(400).json({ error: "MercadoPago não retornou QR Code PIX." });
        return;
      }

      await db.update(ordersTable)
        .set({ mpPreferenceId: String(mpData.id ?? ""), mpPaymentId: String(mpData.id ?? "") })
        .where(eq(ordersTable.id, order.id));

      // Send temp password email AFTER payment is generated (but before confirmation)
      if (isNewUser && tempPassword) {
        sendTempPasswordEmail(String(customerEmail).toLowerCase().trim(), String(customerName), tempPassword)
          .catch((err: unknown) => logger.error({ err }, "checkout: erro ao enviar email senha temporária"));
      }

      res.json({
        ok: true,
        orderId: order.id,
        orderNumber,
        paymentMethod: "pix",
        pixQrCode: txData.qr_code,
        pixQrCodeBase64: txData.qr_code_base64 ?? "",
        pixPaymentId: String(mpData.id ?? ""),
        isNewUser,
        total,
      });

    } else if (paymentMethod === "boleto") {
      const boletoPayload = {
        transaction_amount: total,
        description: cert.name,
        payment_method_id: "bolbradesco",
        external_reference: orderNumber,
        notification_url: `${siteUrl}/api/mp/webhook`,
        payer: {
          email: String(customerEmail).toLowerCase().trim(),
          first_name: firstName,
          last_name: lastName,
          identification: { type: "CPF", number: cpfForPayer },
        },
      };

      const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mpToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `${orderNumber}-boleto-${Date.now()}`,
        },
        body: JSON.stringify(boletoPayload),
      });
      const mpData = await mpRes.json() as {
        id?: number; status?: string; barcode?: { content?: string }; transaction_details?: { external_resource_url?: string };
        message?: string; error?: string;
      };

      if (!mpRes.ok) {
        res.status(400).json({ error: mpData.message ?? mpData.error ?? "Erro ao gerar boleto." });
        return;
      }

      await db.update(ordersTable)
        .set({ mpPreferenceId: String(mpData.id ?? ""), mpPaymentId: String(mpData.id ?? "") })
        .where(eq(ordersTable.id, order.id));

      if (isNewUser && tempPassword) {
        sendTempPasswordEmail(String(customerEmail).toLowerCase().trim(), String(customerName), tempPassword)
          .catch((err: unknown) => logger.error({ err }, "checkout: erro ao enviar email senha temporária"));
      }

      res.json({
        ok: true,
        orderId: order.id,
        orderNumber,
        paymentMethod: "boleto",
        boletoUrl: mpData.transaction_details?.external_resource_url ?? null,
        boletoBarcode: mpData.barcode?.content ?? null,
        boletoPaymentId: String(mpData.id ?? ""),
        isNewUser,
        total,
      });

    } else {
      // Cartão — frontend envia token MP (nunca dados brutos)
      if (!mpCardToken) {
        res.status(400).json({ error: "Token do cartão não fornecido." });
        return;
      }

      const cardPayload = {
        transaction_amount: total,
        token: mpCardToken,
        description: cert.name,
        installments: Number(mpInstallments ?? 1),
        payment_method_id: mpPaymentMethodId,
        external_reference: orderNumber,
        notification_url: `${siteUrl}/api/mp/webhook`,
        payer: {
          email: String(customerEmail).toLowerCase().trim(),
          identification: { type: "CPF", number: cpfForPayer },
        },
      };

      const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mpToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `${orderNumber}-card-${Date.now()}`,
        },
        body: JSON.stringify(cardPayload),
      });
      const mpData = await mpRes.json() as {
        id?: number; status?: string; status_detail?: string;
        message?: string; error?: string;
      };

      if (!mpRes.ok) {
        res.status(400).json({ error: mpData.message ?? mpData.error ?? "Erro ao processar cartão." });
        return;
      }

      await db.update(ordersTable)
        .set({ mpPreferenceId: String(mpData.id ?? ""), mpPaymentId: String(mpData.id ?? "") })
        .where(eq(ordersTable.id, order.id));

      if (isNewUser && tempPassword) {
        sendTempPasswordEmail(String(customerEmail).toLowerCase().trim(), String(customerName), tempPassword)
          .catch((err: unknown) => logger.error({ err }, "checkout: erro ao enviar email senha temporária"));
      }

      const approved = mpData.status === "approved";
      if (approved) {
        await db.update(ordersTable).set({ status: "paid" }).where(eq(ordersTable.id, order.id));
        const { garAutoComprar } = await import("../lib/gar-auto");
        const { swAutoComprar } = await import("../lib/sw-auto");
        const activeProvider = settings?.activeProvider ?? "gestaoar";
        if (activeProvider === "safeweb") swAutoComprar(order.id).catch(() => {});
        else garAutoComprar(order.id).catch(() => {});
      }

      res.json({
        ok: true,
        orderId: order.id,
        orderNumber,
        paymentMethod: "cartao",
        approved,
        cardPaymentId: String(mpData.id ?? ""),
        isNewUser,
        total,
      });
    }
  } catch (err) {
    logger.error({ err }, "checkout/submit payment error");
    res.status(500).json({ error: "Erro interno ao processar pagamento. Tente novamente." });
  }
});

// ── GET /public/checkout/payment-status/:orderId — poll payment status ────────
router.get("/public/checkout/payment-status/:orderId", async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.orderId, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "ID inválido." }); return; }

  const [row] = await db
    .select({ status: ordersTable.status, mpPaymentId: ordersTable.mpPaymentId, garProtocolo: ordersTable.garProtocolo, garHopeUploadUrl: ordersTable.garHopeUploadUrl, safewebSolicitacaoId: ordersTable.safewebSolicitacaoId, protocolNumber: ordersTable.protocolNumber })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Pedido não encontrado." }); return; }

  // If still pending_payment, try to sync with MP
  if ((row.status === "pending_payment" || row.status === "created") && row.mpPaymentId) {
    try {
      const [settings] = await db.select({ mpAccessToken: settingsTable.mpAccessToken }).from(settingsTable).limit(1);
      const mpToken = settings?.mpAccessToken || "";
      if (mpToken) {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${row.mpPaymentId}`, {
          headers: { Authorization: `Bearer ${mpToken}` },
        });
        if (mpRes.ok) {
          const payment = await mpRes.json() as { status?: string };
          if (payment.status === "approved") {
            await db.update(ordersTable).set({ status: "paid" }).where(eq(ordersTable.id, orderId));
            const [settings2] = await db.select({ activeProvider: settingsTable.activeProvider }).from(settingsTable).limit(1);
            const activeProvider = settings2?.activeProvider ?? "gestaoar";
            if (activeProvider === "safeweb") {
              const { swAutoComprar } = await import("../lib/sw-auto");
              swAutoComprar(orderId).catch(() => {});
            } else {
              const { garAutoComprar } = await import("../lib/gar-auto");
              garAutoComprar(orderId).catch(() => {});
            }
            res.json({ status: "paid", garProtocolo: row.garProtocolo, garHopeUploadUrl: row.garHopeUploadUrl, safewebSolicitacaoId: row.safewebSolicitacaoId, protocolNumber: row.protocolNumber });
            return;
          }
        }
      }
    } catch { /* best-effort */ }
  }

  res.json({ status: row.status, garProtocolo: row.garProtocolo, garHopeUploadUrl: row.garHopeUploadUrl, safewebSolicitacaoId: row.safewebSolicitacaoId, protocolNumber: row.protocolNumber });
});

// ── GET /public/checkout/slots/:orderId — locais ou horários disponíveis ─────
router.get("/public/checkout/slots/:orderId", async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.orderId, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "ID inválido." }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ error: "Pedido não encontrado." }); return; }

  const [settings] = await db.select().from(settingsTable).limit(1);
  const activeProvider = settings?.activeProvider ?? "gestaoar";

  // Se hashLocal + date fornecidos → retorna horários disponíveis (GAR)
  const { hashLocal, date, idLocal } = req.query as Record<string, string>;

  try {
    if (activeProvider === "safeweb") {
      const { swLocaisPorCnpjAr, swAgendaListarHorarios } = await import("../lib/safeweb");
      const sw = { url: settings!.safewebUrl!, username: settings!.safewebUsername!, password: settings!.safewebPassword! };
      if (idLocal && date) {
        const horarios = await swAgendaListarHorarios(sw, Number(idLocal), date);
        res.json({ horarios: (horarios as { data?: unknown[] })?.data ?? [], provider: "safeweb" });
        return;
      }
      const locais = await swLocaisPorCnpjAr(sw, settings?.safewebCnpjAr ?? undefined);
      res.json({ locais: locais ?? [], provider: "safeweb", orderId: order.id, safewebSolicitacaoId: order.safewebSolicitacaoId });
    } else {
      const [garSettings] = await db.select({ garApiKey: settingsTable.garApiKey }).from(settingsTable).limit(1);
      const apiKey = garSettings?.garApiKey ?? "";
      if (hashLocal && date) {
        const { garDisponibilidadeAgenda } = await import("../lib/gestaoar");
        const dataInicial = `${date} 00:00`;
        const dataFinal = `${date} 23:59`;
        const result = await garDisponibilidadeAgenda(apiKey, dataInicial, dataFinal, hashLocal);
        const horarios = result?.Datas?.[0]?.Horarios ?? [];
        res.json({ horarios, provider: "gestaoar" });
        return;
      }
      if (!order.garHashVenda) { res.json({ locais: [], provider: "gestaoar" }); return; }
      const { garLocaisAgendamento } = await import("../lib/gestaoar");
      const locais = await garLocaisAgendamento(apiKey);
      res.json({ locais: locais ?? [], provider: "gestaoar", garHashVenda: order.garHashVenda });
    }
  } catch (err) {
    logger.error({ err }, "public/checkout/slots error");
    res.status(502).json({ error: "Erro ao buscar disponibilidade." });
  }
});

// ── POST /public/checkout/agendar/:orderId — agenda sem auth ─────────────────
router.post("/public/checkout/agendar/:orderId", async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.orderId, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "ID inválido." }); return; }

  const { localHash, slotHash, localNome, dataHora, solicitacaoId } = req.body ?? {};

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ error: "Pedido não encontrado." }); return; }

  const [settings] = await db.select().from(settingsTable).limit(1);
  const activeProvider = settings?.activeProvider ?? "gestaoar";

  const { idLocal, horarioInicio, horarioFim, data: dataAgenda } = req.body ?? {};

  try {
    if (activeProvider === "safeweb") {
      const { swAgendaAgendar } = await import("../lib/safeweb");
      const sid = solicitacaoId ?? order.safewebSolicitacaoId;
      if (!sid) { res.status(400).json({ error: "Solicitação Safeweb não encontrada." }); return; }
      const dataHoraStr = dataAgenda && horarioInicio ? `${dataAgenda}T${horarioInicio}:00` : dataHora;
      const sw = { url: settings!.safewebUrl!, username: settings!.safewebUsername!, password: settings!.safewebPassword! };
      try {
        await swAgendaAgendar(sw, { localAtendimentoId: Number(idLocal), protocolo: sid, data: dataHoraStr });
      } catch { /* save manually if API fails */ }
      await db.update(ordersTable).set({
        safewebAgendamentoId: `sw-${Date.now()}`,
        safewebAgendamentoDataHora: dataHoraStr || null,
        safewebAgendamentoLocalNome: localNome || null,
      }).where(eq(ordersTable.id, orderId));
    } else {
      const { garAgendar } = await import("../lib/gestaoar");
      const [garSettings] = await db.select({ garApiKey: settingsTable.garApiKey }).from(settingsTable).limit(1);
      const apiKey = garSettings?.garApiKey ?? "";
      const dataHoraStr = dataAgenda && horarioInicio ? `${dataAgenda}T${horarioInicio}:00` : dataHora;
      const dataFim = dataAgenda && horarioFim ? `${dataAgenda}T${horarioFim}:00` : dataHoraStr;
      if (!order.garHashVenda) { res.status(400).json({ error: "Pedido ainda não registrado no provedor." }); return; }
      try {
        await garAgendar(apiKey, order.garHashVenda, localHash, dataHoraStr, dataFim);
      } catch { /* save manually if API fails */ }
      await db.update(ordersTable).set({
        garAgendamentoLocalNome: localNome || null,
        garAgendamentoLocalHash: localHash || null,
        garAgendamentoSlotHash: slotHash || null,
        garAgendamentoDataHora: dataHoraStr || null,
      }).where(eq(ordersTable.id, orderId));
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "public/checkout/agendar error");
    res.status(502).json({ error: `Erro ao agendar: ${(err as Error).message}` });
  }
});

export default router;
