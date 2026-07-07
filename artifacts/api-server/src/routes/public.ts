import { Router } from "express";
import { db } from "@workspace/db";
import { certificatesTable, reviewsTable, insertReviewSchema } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/public/certificates", async (req, res) => {
  try {
    const certs = await db
      .select({
        id: certificatesTable.id,
        name: certificatesTable.name,
        description: certificatesTable.description,
        price: certificatesTable.price,
        validityMonths: certificatesTable.validityMonths,
        product: certificatesTable.product,
        issuanceType: certificatesTable.issuanceType,
        model: certificatesTable.model,
      })
      .from(certificatesTable)
      .where(eq(certificatesTable.active, true))
      .orderBy(certificatesTable.id);
    res.json(certs);
  } catch (err) {
    req.log.error(err, "public certificates error");
    res.status(500).json({ error: "Erro ao buscar certificados" });
  }
});

/* ── PUBLIC: list approved reviews ──────────────────────────── */
router.get("/public/reviews", async (req, res) => {
  try {
    const reviews = await db
      .select({
        id: reviewsTable.id,
        name: reviewsTable.name,
        role: reviewsTable.role,
        text: reviewsTable.text,
        stars: reviewsTable.stars,
        createdAt: reviewsTable.createdAt,
      })
      .from(reviewsTable)
      .where(eq(reviewsTable.status, "approved"))
      .orderBy(desc(reviewsTable.createdAt))
      .limit(20);
    res.json(reviews);
  } catch (err) {
    req.log.error(err, "public reviews error");
    res.status(500).json({ error: "Erro ao buscar avaliações" });
  }
});

/* ── AUTHENTICATED: submit review ────────────────────────────── */
router.post("/reviews", async (req, res) => {
  const session = (req as any).session?.user;
  if (!session) { res.status(401).json({ error: "Você precisa estar logado para enviar uma avaliação." }); return; }

  const parsed = insertReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    return;
  }
  try {
    await db.insert(reviewsTable).values({ ...parsed.data, status: "pending", userId: session.id });
    res.status(201).json({ message: "Avaliação enviada! Será publicada após aprovação." });
  } catch (err) {
    req.log.error(err, "submit review error");
    res.status(500).json({ error: "Erro ao enviar avaliação" });
  }
});

/* ── AUTHENTICATED: check if current user already reviewed ──── */
router.get("/reviews/my-status", async (req, res) => {
  const session = (req as any).session?.user;
  if (!session) { res.status(401).json({ error: "Não autenticado" }); return; }
  try {
    const existing = await db
      .select({ id: reviewsTable.id })
      .from(reviewsTable)
      .where(eq(reviewsTable.userId, session.id))
      .limit(1);
    res.json({ hasReviewed: existing.length > 0 });
  } catch (err) {
    req.log.error(err, "my-status error");
    res.status(500).json({ error: "Erro" });
  }
});

/* ── ADMIN: list reviews (with optional ?status= filter) ─────── */
router.get("/admin/reviews", async (req, res) => {
  const session = (req as any).session?.user;
  if (session?.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const statusFilter = req.query.status as string | undefined;
    let reviews;
    if (statusFilter && ["pending", "approved", "rejected"].includes(statusFilter)) {
      reviews = await db
        .select()
        .from(reviewsTable)
        .where(eq(reviewsTable.status, statusFilter))
        .orderBy(desc(reviewsTable.createdAt));
    } else {
      reviews = await db
        .select()
        .from(reviewsTable)
        .orderBy(desc(reviewsTable.createdAt));
    }
    res.json(reviews);
  } catch (err) {
    req.log.error(err, "admin reviews error");
    res.status(500).json({ error: "Erro" });
  }
});

/* ── ADMIN: update review status ─────────────────────────────── */
router.patch("/admin/reviews/:id", async (req, res) => {
  const session = (req as any).session?.user;
  if (session?.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const { status } = req.body;
  if (!["pending", "approved", "rejected"].includes(status)) {
    res.status(400).json({ error: "Status inválido" }); return;
  }
  try {
    await db.update(reviewsTable).set({ status }).where(eq(reviewsTable.id, Number(req.params.id)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "update review status error");
    res.status(500).json({ error: "Erro" });
  }
});

/* ── ADMIN: delete review ────────────────────────────────────── */
router.delete("/admin/reviews/:id", async (req, res) => {
  const session = (req as any).session?.user;
  if (session?.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    await db.delete(reviewsTable).where(eq(reviewsTable.id, Number(req.params.id)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "delete review error");
    res.status(500).json({ error: "Erro" });
  }
});

export default router;
