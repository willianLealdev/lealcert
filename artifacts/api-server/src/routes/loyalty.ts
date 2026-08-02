import { Router } from "express";
import { eq, and, asc, desc } from "drizzle-orm";
import { db, loyaltyCartelasTable, loyaltySlotEventsTable, usersTable, ordersTable, certificatesTable, settingsTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getAvailableCortesias, useCorteisa } from "../lib/loyalty";

const router = Router();

// ── GET /api/loyalty/me — cartelas do contador autenticado ────────────────────
router.get("/loyalty/me", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId as number;

  const [user] = await db
    .select({ userType: usersTable.userType })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || user.userType !== "contador") {
    res.status(403).json({ error: "Recurso exclusivo para contadores." });
    return;
  }

  const cartelas = await db
    .select()
    .from(loyaltyCartelasTable)
    .where(eq(loyaltyCartelasTable.userId, userId))
    .orderBy(asc(loyaltyCartelasTable.createdAt));

  const availableCortesias = await getAvailableCortesias(userId);

  res.json({ cartelas, availableCortesias });
});

// ── GET /api/loyalty/cortesia-available — verifica cortesia disponível ────────
router.get("/loyalty/cortesia-available", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId as number;
  const available = await getAvailableCortesias(userId);
  res.json({ available, count: available });
});

// ── POST /api/loyalty/checkout-cortesia — usa cortesia para comprar cert ──────
// Double-check backend: valida userType + cartela completed antes de processar
router.post("/loyalty/checkout-cortesia", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId as number;

  const [user] = await db
    .select({ userType: usersTable.userType, name: usersTable.name, email: usersTable.email, cpfCnpj: usersTable.cpfCnpj, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || user.userType !== "contador") {
    res.status(403).json({ error: "Recurso exclusivo para contadores." });
    return;
  }

  // Double-check: tem cartela completed?
  const available = await getAvailableCortesias(userId);
  if (available < 1) {
    res.status(400).json({ error: "Nenhuma cortesia disponível. Complete 10 certificados para desbloquear." });
    return;
  }

  const { certificateId } = req.body ?? {};
  if (!certificateId) {
    res.status(400).json({ error: "certificateId é obrigatório." });
    return;
  }

  const [cert] = await db
    .select()
    .from(certificatesTable)
    .where(and(eq(certificatesTable.id, Number(certificateId)), eq(certificatesTable.active, true)))
    .limit(1);

  if (!cert) {
    res.status(400).json({ error: "Certificado não encontrado ou inativo." });
    return;
  }

  const [settings] = await db.select().from(settingsTable).limit(1);

  // Gerar número do pedido
  const orderNumber = `${new Date().getFullYear()}${String(Date.now()).slice(-7)}`;

  try {
    // Criar pedido com pagamento por cortesia (total = 0, status = paid)
    const [order] = await db
      .insert(ordersTable)
      .values({
        orderNumber,
        userId,
        certificateId: cert.id,
        status: "paid" as const,
        total: "0",
        clientType: "cpf" as const,
        customerName: user.name ?? "Contador",
        customerCpfCnpj: user.cpfCnpj,
        customerEmail: user.email ?? null,
        customerPhone: user.phone ?? null,
        paymentMethod: "cortesia",
        termsAcceptedAt: new Date(),
      })
      .returning();

    // Usar a cortesia (marcar cartela como "used")
    const cartelaId = await useCorteisa(userId, order.id);
    if (!cartelaId) {
      // Falha na cortesia — reverter
      await db.delete(ordersTable).where(eq(ordersTable.id, order.id));
      res.status(400).json({ error: "Falha ao usar cortesia. Tente novamente." });
      return;
    }

    logger.info({ userId, orderId: order.id, cartelaId }, "Loyalty: pedido cortesia criado");

    // Disparar no provedor ativo
    const activeProvider = settings?.activeProvider ?? "gestaoar";
    if (activeProvider === "safeweb") {
      const { swAutoComprar } = await import("../lib/sw-auto");
      swAutoComprar(order.id).catch((err: unknown) => logger.error({ err }, "Loyalty cortesia: erro sw-auto"));
    } else {
      const { garAutoComprar } = await import("../lib/gar-auto");
      garAutoComprar(order.id).catch((err: unknown) => logger.error({ err }, "Loyalty cortesia: erro gar-auto"));
    }

    res.json({ ok: true, orderId: order.id, orderNumber: order.orderNumber });
  } catch (err) {
    logger.error({ err }, "Loyalty cortesia: erro ao criar pedido");
    res.status(500).json({ error: "Erro ao processar cortesia. Tente novamente." });
  }
});

// ── POST /api/loyalty/pay-with-cortesia — usa cortesia para pagar pedido já criado ──
// O pedido foi criado normalmente (com dados do cliente preenchidos no formulário).
// Este endpoint apenas troca o pagamento por cortesia.
router.post("/loyalty/pay-with-cortesia", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId as number;

  const [user] = await db
    .select({ userType: usersTable.userType })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || user.userType !== "contador") {
    res.status(403).json({ error: "Recurso exclusivo para contadores." });
    return;
  }

  const available = await getAvailableCortesias(userId);
  if (available < 1) {
    res.status(400).json({ error: "Nenhuma cortesia disponível." });
    return;
  }

  const { orderId } = req.body ?? {};
  if (!orderId) {
    res.status(400).json({ error: "orderId é obrigatório." });
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, Number(orderId)), eq(ordersTable.userId, userId)))
    .limit(1);

  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }

  if (order.status !== "pending_payment" && order.status !== "created") {
    res.status(400).json({ error: "Este pedido não pode ser pago com cortesia no estado atual." });
    return;
  }

  // Usar cortesia e atualizar pedido para "paid"
  const cartelaId = await useCorteisa(userId, order.id);
  if (!cartelaId) {
    res.status(400).json({ error: "Falha ao usar cortesia. Tente novamente." });
    return;
  }

  await db
    .update(ordersTable)
    .set({ status: "paid", paymentMethod: "cortesia", total: "0" })
    .where(eq(ordersTable.id, order.id));

  const [settings] = await db.select().from(settingsTable).limit(1);
  const activeProvider = settings?.activeProvider ?? "gestaoar";
  if (activeProvider === "safeweb") {
    const { swAutoComprar } = await import("../lib/sw-auto");
    swAutoComprar(order.id).catch((err: unknown) => logger.error({ err }, "Loyalty pay-with-cortesia: erro sw-auto"));
  } else {
    const { garAutoComprar } = await import("../lib/gar-auto");
    garAutoComprar(order.id).catch((err: unknown) => logger.error({ err }, "Loyalty pay-with-cortesia: erro gar-auto"));
  }

  logger.info({ userId, orderId: order.id, cartelaId }, "Loyalty: cortesia aplicada em pedido existente");
  res.json({ ok: true, orderId: order.id, orderNumber: order.orderNumber });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/loyalty — visão geral admin ────────────────────────────────
router.get("/admin/loyalty", requireAdmin, async (req, res): Promise<void> => {
  // Buscar todos os contadores com suas cartelas
  const contadores = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      cpfCnpj: usersTable.cpfCnpj,
    })
    .from(usersTable)
    .where(eq(usersTable.userType, "contador"));

  const cartelas = await db
    .select()
    .from(loyaltyCartelasTable)
    .orderBy(asc(loyaltyCartelasTable.userId), asc(loyaltyCartelasTable.createdAt));

  // Agrupar por usuário
  const byUser = new Map<number, typeof cartelas>();
  for (const c of cartelas) {
    if (!byUser.has(c.userId)) byUser.set(c.userId, []);
    byUser.get(c.userId)!.push(c);
  }

  const result = contadores
    .map(u => {
      const userCartelas = byUser.get(u.id) ?? [];
      const active    = userCartelas.find(c => c.status === "active");
      const completed = userCartelas.filter(c => c.status === "completed").length;
      const used      = userCartelas.filter(c => c.status === "used").length;
      return {
        user: u,
        activeCartela: active ?? null,
        completedCount: completed,
        usedCount: used,
        allCartelas: userCartelas,
      };
    })
    // Ordenar: primeiro os com mais slots na cartela ativa (mais perto de completar)
    .sort((a, b) => {
      const aSlots = a.activeCartela?.slots ?? -1;
      const bSlots = b.activeCartela?.slots ?? -1;
      return bSlots - aSlots;
    });

  // Cortesias usadas (com info do pedido)
  const usedCartelas = await db
    .select({
      cartela: loyaltyCartelasTable,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(loyaltyCartelasTable)
    .leftJoin(usersTable, eq(loyaltyCartelasTable.userId, usersTable.id))
    .where(eq(loyaltyCartelasTable.status, "used"))
    .orderBy(desc(loyaltyCartelasTable.usedAt));

  res.json({ contadores: result, usedCartelas });
});

// ── PATCH /api/admin/loyalty/cartelas/:id/slots — ajuste manual de slots ──────
router.patch("/admin/loyalty/cartelas/:id/slots", requireAdmin, async (req, res): Promise<void> => {
  const cartelaId = parseInt(String(req.params.id), 10);
  if (isNaN(cartelaId)) { res.status(400).json({ error: "ID inválido." }); return; }

  const { slots } = req.body ?? {};
  if (typeof slots !== "number" || slots < 0 || slots > 10) {
    res.status(400).json({ error: "slots deve ser um número entre 0 e 10." });
    return;
  }

  const [cartela] = await db
    .select()
    .from(loyaltyCartelasTable)
    .where(eq(loyaltyCartelasTable.id, cartelaId))
    .limit(1);

  if (!cartela) { res.status(404).json({ error: "Cartela não encontrada." }); return; }
  if (cartela.status === "used") { res.status(400).json({ error: "Cartela já foi utilizada." }); return; }

  const now = new Date();
  const newStatus = slots >= 10 ? "completed" : "active";

  await db
    .update(loyaltyCartelasTable)
    .set({
      slots,
      status: newStatus,
      completedAt: newStatus === "completed" ? (cartela.completedAt ?? now) : null,
    })
    .where(eq(loyaltyCartelasTable.id, cartelaId));

  // Se completou manualmente, criar nova cartela ativa (se não existir)
  if (newStatus === "completed") {
    const [existingActive] = await db
      .select({ id: loyaltyCartelasTable.id })
      .from(loyaltyCartelasTable)
      .where(and(eq(loyaltyCartelasTable.userId, cartela.userId), eq(loyaltyCartelasTable.status, "active")))
      .limit(1);
    if (!existingActive) {
      await db.insert(loyaltyCartelasTable).values({ userId: cartela.userId });
    }
  }

  logger.info({ cartelaId, slots, adminId: req.session.userId }, "Admin: slots da cartela ajustados manualmente");
  res.json({ ok: true });
});

// ── POST /api/admin/loyalty/cartelas — criar cartela manual p/ usuário ────────
router.post("/admin/loyalty/cartelas", requireAdmin, async (req, res): Promise<void> => {
  const { userId } = req.body ?? {};
  if (!userId) { res.status(400).json({ error: "userId obrigatório." }); return; }

  const [user] = await db
    .select({ userType: usersTable.userType })
    .from(usersTable)
    .where(eq(usersTable.id, Number(userId)))
    .limit(1);

  if (!user || user.userType !== "contador") {
    res.status(400).json({ error: "Usuário não é contador." });
    return;
  }

  const [cartela] = await db
    .insert(loyaltyCartelasTable)
    .values({ userId: Number(userId) })
    .returning();

  res.json({ ok: true, cartela });
});

export default router;
