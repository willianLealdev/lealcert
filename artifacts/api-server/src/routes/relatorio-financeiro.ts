import { Router } from "express";
import { and, gte, lte, eq, asc, sql } from "drizzle-orm";
import { db, ordersTable, reportCertTiersTable, reportPaymentFeesTable, reportExtraCostsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

// ─── Relatório / Resumo ──────────────────────────────────────────────────────

router.get("/admin/relatorio/resumo", requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    if (!from || !to) {
      res.status(400).json({ error: "Parâmetros from e to são obrigatórios (YYYY-MM-DD)." });
      return;
    }

    const fromDate = new Date(from + "T00:00:00.000Z");
    const toDate = new Date(to + "T23:59:59.999Z");
    const daysDiff = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Buscar pedidos pagos no período (excluindo criados/pendentes/cancelados)
    const orders = await db
      .select({
        id: ordersTable.id,
        total: ordersTable.total,
        paymentMethod: ordersTable.paymentMethod,
        garPedido: ordersTable.garPedido,
        safewebSolicitacaoId: ordersTable.safewebSolicitacaoId,
      })
      .from(ordersTable)
      .where(
        and(
          sql`${ordersTable.status} NOT IN ('created', 'pending_payment', 'cancelled')`,
          gte(ordersTable.createdAt, fromDate),
          lte(ordersTable.createdAt, toDate)
        )
      );

    const totalOrders = orders.length;

    // Receita bruta
    const grossRevenue = orders.reduce((acc, o) => acc + parseFloat(String(o.total ?? "0")), 0);

    // Custo de certificados — flat rate pela faixa atingida
    const tiers = await db.select().from(reportCertTiersTable).orderBy(asc(reportCertTiersTable.minQty));
    const tier = tiers.find(
      (t) => totalOrders >= t.minQty && (t.maxQty === null || totalOrders <= t.maxQty)
    ) ?? null;
    const certCost = tier ? totalOrders * parseFloat(String(tier.pricePerCert)) : 0;

    // Taxas de pagamento
    const feesConfig = await db.select().from(reportPaymentFeesTable);
    const feeMap = Object.fromEntries(feesConfig.map((f) => [f.method, f]));

    type MethodSummary = { count: number; revenue: number; fees: number };
    const byMethod: Record<string, MethodSummary> = {};
    let totalPaymentFees = 0;

    for (const order of orders) {
      const method = order.paymentMethod ?? "sem_metodo";
      if (!byMethod[method]) byMethod[method] = { count: 0, revenue: 0, fees: 0 };
      const rev = parseFloat(String(order.total ?? "0"));
      byMethod[method].count++;
      byMethod[method].revenue += rev;

      const fee = feeMap[method];
      if (fee) {
        const orderFee =
          parseFloat(String(fee.fixedFee ?? "0")) +
          (parseFloat(String(fee.percentFee ?? "0")) / 100) * rev;
        byMethod[method].fees += orderFee;
        totalPaymentFees += orderFee;
      }
    }

    // Custos adicionais — rateados pelo período
    const extraCosts = await db
      .select()
      .from(reportExtraCostsTable)
      .where(eq(reportExtraCostsTable.active, true));

    let totalExtraCosts = 0;
    const extraCostsDetail: { id: number; name: string; amount: number; period: string; periodCost: number }[] = [];

    for (const cost of extraCosts) {
      const amount = parseFloat(String(cost.amount ?? "0"));
      let periodCost = 0;
      if (cost.period === "daily") periodCost = amount * daysDiff;
      else if (cost.period === "monthly") periodCost = amount * (daysDiff / 30.44);
      else if (cost.period === "annual") periodCost = amount * (daysDiff / 365);
      totalExtraCosts += periodCost;
      extraCostsDetail.push({ id: cost.id, name: cost.name, amount, period: cost.period, periodCost });
    }

    const netProfit = grossRevenue - certCost - totalPaymentFees - totalExtraCosts;

    // Breakdown por provedor
    type ProviderSummary = { count: number; revenue: number; fees: number };
    const byProviderRaw: Record<string, ProviderSummary> = {
      gar: { count: 0, revenue: 0, fees: 0 },
      safeweb: { count: 0, revenue: 0, fees: 0 },
      other: { count: 0, revenue: 0, fees: 0 },
    };

    for (const order of orders) {
      const providerKey = order.garPedido ? "gar" : order.safewebSolicitacaoId ? "safeweb" : "other";
      const rev = parseFloat(String(order.total ?? "0"));
      byProviderRaw[providerKey].count++;
      byProviderRaw[providerKey].revenue += rev;
      // taxas já calculadas — reutiliza o feeMap
      const fee = feeMap[order.paymentMethod ?? ""];
      if (fee) {
        const orderFee =
          parseFloat(String(fee.fixedFee ?? "0")) +
          (parseFloat(String(fee.percentFee ?? "0")) / 100) * rev;
        byProviderRaw[providerKey].fees += orderFee;
      }
    }

    // Custo de certificados proporcional por provedor (mesmo preço/faixa, alocado pelo volume)
    const pricePerCert = tier ? parseFloat(String(tier.pricePerCert)) : 0;
    const byProvider = Object.entries(byProviderRaw).map(([provider, s]) => ({
      provider,
      count: s.count,
      revenue: s.revenue,
      paymentFees: s.fees,
      certCost: s.count * pricePerCert,
      netProfit: s.revenue - s.fees - s.count * pricePerCert,
    }));

    res.json({
      period: { from, to, days: daysDiff },
      totalOrders,
      grossRevenue,
      certTierUsed: tier
        ? { id: tier.id, minQty: tier.minQty, maxQty: tier.maxQty, pricePerCert: parseFloat(String(tier.pricePerCert)) }
        : null,
      certCost,
      totalPaymentFees,
      extraCostsPeriod: totalExtraCosts,
      extraCostsDetail,
      netProfit,
      byPaymentMethod: Object.entries(byMethod).map(([method, s]) => ({
        method,
        count: s.count,
        revenue: s.revenue,
        fees: s.fees,
        net: s.revenue - s.fees,
      })),
      byProvider,
    });
  } catch (err) {
    console.error("[relatorio/resumo]", err);
    res.status(500).json({ error: "Erro ao gerar relatório." });
  }
});

// ─── Tabela de Faixas de Certificado ────────────────────────────────────────

router.get("/admin/relatorio/cert-tiers", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select().from(reportCertTiersTable).orderBy(asc(reportCertTiersTable.minQty));
    res.json(rows);
  } catch (err) { console.error("[cert-tiers GET]", err); res.status(500).json({ error: "Erro ao buscar faixas." }); }
});

router.post("/admin/relatorio/cert-tiers", requireAdmin, async (req, res) => {
  try {
    const { minQty, maxQty, pricePerCert } = req.body;
    if (minQty == null || pricePerCert == null) { res.status(400).json({ error: "minQty e pricePerCert são obrigatórios." }); return; }
    const [row] = await db.insert(reportCertTiersTable).values({ minQty: Number(minQty), maxQty: maxQty != null ? Number(maxQty) : null, pricePerCert: String(pricePerCert) }).returning();
    res.json(row);
  } catch (err) { console.error("[cert-tiers POST]", err); res.status(500).json({ error: "Erro ao criar faixa." }); }
});

router.put("/admin/relatorio/cert-tiers/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { minQty, maxQty, pricePerCert } = req.body;
    const [row] = await db.update(reportCertTiersTable).set({ minQty: Number(minQty), maxQty: maxQty != null ? Number(maxQty) : null, pricePerCert: String(pricePerCert) }).where(eq(reportCertTiersTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Faixa não encontrada." }); return; }
    res.json(row);
  } catch (err) { console.error("[cert-tiers PUT]", err); res.status(500).json({ error: "Erro ao atualizar faixa." }); }
});

router.delete("/admin/relatorio/cert-tiers/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(reportCertTiersTable).where(eq(reportCertTiersTable.id, id));
    res.json({ ok: true });
  } catch (err) { console.error("[cert-tiers DELETE]", err); res.status(500).json({ error: "Erro ao excluir faixa." }); }
});

// ─── Taxas de Pagamento ──────────────────────────────────────────────────────

router.get("/admin/relatorio/payment-fees", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select().from(reportPaymentFeesTable);
    res.json(rows);
  } catch (err) { console.error("[payment-fees GET]", err); res.status(500).json({ error: "Erro ao buscar taxas." }); }
});

router.put("/admin/relatorio/payment-fees/:method", requireAdmin, async (req, res) => {
  try {
    const method = String(req.params.method);
    const { fixedFee, percentFee } = req.body;
    const existing = await db.select().from(reportPaymentFeesTable).where(eq(reportPaymentFeesTable.method, method));
    if (existing.length > 0) {
      const [row] = await db.update(reportPaymentFeesTable).set({ fixedFee: String(fixedFee ?? "0"), percentFee: String(percentFee ?? "0") }).where(eq(reportPaymentFeesTable.method, method)).returning();
      res.json(row);
    } else {
      const [row] = await db.insert(reportPaymentFeesTable).values({ method, fixedFee: String(fixedFee ?? "0"), percentFee: String(percentFee ?? "0") }).returning();
      res.json(row);
    }
  } catch (err) { console.error("[payment-fees PUT]", err); res.status(500).json({ error: "Erro ao salvar taxa." }); }
});

// ─── Custos Adicionais ───────────────────────────────────────────────────────

router.get("/admin/relatorio/extra-costs", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select().from(reportExtraCostsTable).orderBy(asc(reportExtraCostsTable.createdAt));
    res.json(rows);
  } catch (err) { console.error("[extra-costs GET]", err); res.status(500).json({ error: "Erro ao buscar custos." }); }
});

router.post("/admin/relatorio/extra-costs", requireAdmin, async (req, res) => {
  try {
    const { name, amount, period, active } = req.body;
    if (!name || amount == null || !period) { res.status(400).json({ error: "name, amount e period são obrigatórios." }); return; }
    const [row] = await db.insert(reportExtraCostsTable).values({ name, amount: String(amount), period, active: active !== false }).returning();
    res.json(row);
  } catch (err) { console.error("[extra-costs POST]", err); res.status(500).json({ error: "Erro ao criar custo." }); }
});

router.put("/admin/relatorio/extra-costs/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, amount, period, active } = req.body;
    const [row] = await db.update(reportExtraCostsTable).set({ name, amount: String(amount), period, active: !!active }).where(eq(reportExtraCostsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Custo não encontrado." }); return; }
    res.json(row);
  } catch (err) { console.error("[extra-costs PUT]", err); res.status(500).json({ error: "Erro ao atualizar custo." }); }
});

router.delete("/admin/relatorio/extra-costs/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(reportExtraCostsTable).where(eq(reportExtraCostsTable.id, id));
    res.json({ ok: true });
  } catch (err) { console.error("[extra-costs DELETE]", err); res.status(500).json({ error: "Erro ao excluir custo." }); }
});

// ─── Exportar CSV ────────────────────────────────────────────────────────────

router.get("/admin/relatorio/exportar-csv", requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    if (!from || !to) {
      res.status(400).json({ error: "Parâmetros from e to são obrigatórios (YYYY-MM-DD)." });
      return;
    }

    const fromDate = new Date(from + "T00:00:00.000Z");
    const toDate = new Date(to + "T23:59:59.999Z");
    const daysDiff = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)));

    const orders = await db
      .select({
        id: ordersTable.id,
        total: ordersTable.total,
        paymentMethod: ordersTable.paymentMethod,
      })
      .from(ordersTable)
      .where(
        and(
          sql`${ordersTable.status} NOT IN ('created', 'pending_payment', 'cancelled')`,
          gte(ordersTable.createdAt, fromDate),
          lte(ordersTable.createdAt, toDate)
        )
      );

    const totalOrders = orders.length;
    const grossRevenue = orders.reduce((acc, o) => acc + parseFloat(String(o.total ?? "0")), 0);

    const tiers = await db.select().from(reportCertTiersTable).orderBy(asc(reportCertTiersTable.minQty));
    const tier = tiers.find(
      (t) => totalOrders >= t.minQty && (t.maxQty === null || totalOrders <= t.maxQty)
    ) ?? null;
    const certCost = tier ? totalOrders * parseFloat(String(tier.pricePerCert)) : 0;

    const feesConfig = await db.select().from(reportPaymentFeesTable);
    const feeMap = Object.fromEntries(feesConfig.map((f) => [f.method, f]));

    type MethodSummary = { count: number; revenue: number; fees: number };
    const byMethod: Record<string, MethodSummary> = {};
    let totalPaymentFees = 0;

    for (const order of orders) {
      const method = order.paymentMethod ?? "sem_metodo";
      if (!byMethod[method]) byMethod[method] = { count: 0, revenue: 0, fees: 0 };
      const rev = parseFloat(String(order.total ?? "0"));
      byMethod[method].count++;
      byMethod[method].revenue += rev;
      const fee = feeMap[method];
      if (fee) {
        const orderFee =
          parseFloat(String(fee.fixedFee ?? "0")) +
          (parseFloat(String(fee.percentFee ?? "0")) / 100) * rev;
        byMethod[method].fees += orderFee;
        totalPaymentFees += orderFee;
      }
    }

    const extraCosts = await db
      .select()
      .from(reportExtraCostsTable)
      .where(eq(reportExtraCostsTable.active, true));

    let totalExtraCosts = 0;
    const extraCostsDetail: { id: number; name: string; amount: number; period: string; periodCost: number }[] = [];
    for (const cost of extraCosts) {
      const amount = parseFloat(String(cost.amount ?? "0"));
      let periodCost = 0;
      if (cost.period === "daily") periodCost = amount * daysDiff;
      else if (cost.period === "monthly") periodCost = amount * (daysDiff / 30.44);
      else if (cost.period === "annual") periodCost = amount * (daysDiff / 365);
      totalExtraCosts += periodCost;
      extraCostsDetail.push({ id: cost.id, name: cost.name, amount, period: cost.period, periodCost });
    }

    const netProfit = grossRevenue - certCost - totalPaymentFees - totalExtraCosts;

    const methodLabels: Record<string, string> = {
      pix: "PIX",
      boleto: "Boleto",
      cartao: "Cartão",
      cortesia: "Cortesia",
      sem_metodo: "Sem método",
    };
    const periodLabels: Record<string, string> = {
      daily: "Diário",
      monthly: "Mensal",
      annual: "Anual",
    };
    const fmt = (n: number) => n.toFixed(2).replace(".", ",");

    const rows: string[] = [];
    rows.push(`Relatório Financeiro LealCert`);
    rows.push(`Período;${from} a ${to};${daysDiff} dias`);
    rows.push(``);

    rows.push(`VENDAS POR MÉTODO DE PAGAMENTO`);
    rows.push(`Método;Quantidade;Receita Bruta (R$);Taxas (R$);Líquido (R$)`);
    for (const [method, s] of Object.entries(byMethod)) {
      rows.push(
        `${methodLabels[method] ?? method};${s.count};${fmt(s.revenue)};${fmt(s.fees)};${fmt(s.revenue - s.fees)}`
      );
    }
    rows.push(`Total;${totalOrders};${fmt(grossRevenue)};${fmt(totalPaymentFees)};${fmt(grossRevenue - totalPaymentFees)}`);
    rows.push(``);

    rows.push(`CUSTOS`);
    rows.push(`Descrição;Valor (R$)`);
    const tierLabel = tier
      ? `${tier.minQty}${tier.maxQty != null ? `–${tier.maxQty}` : "+"} certs × R$ ${fmt(parseFloat(String(tier.pricePerCert)))}`
      : "Sem faixa";
    rows.push(`Custo de Certificados (${totalOrders} × faixa ${tierLabel});${fmt(certCost)}`);
    for (const ec of extraCostsDetail) {
      rows.push(`${ec.name} (${periodLabels[ec.period] ?? ec.period});${fmt(ec.periodCost)}`);
    }
    rows.push(`Total Custos;${fmt(certCost + totalPaymentFees + totalExtraCosts)}`);
    rows.push(``);

    rows.push(`RESULTADO`);
    rows.push(`Item;Valor (R$)`);
    rows.push(`Receita Bruta;${fmt(grossRevenue)}`);
    rows.push(`(-) Custo de Certificados;${fmt(certCost)}`);
    rows.push(`(-) Taxas de Pagamento;${fmt(totalPaymentFees)}`);
    rows.push(`(-) Custos Adicionais;${fmt(totalExtraCosts)}`);
    rows.push(`Lucro Líquido;${fmt(netProfit)}`);

    const csv = rows.join("\r\n");
    const [csvYear, csvMonth] = from.split("-");
    const filename = `relatorio-financeiro-${csvMonth}-${csvYear}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // BOM for Excel to recognize UTF-8
    res.send("\uFEFF" + csv);
  } catch (err) {
    console.error("[relatorio/exportar-csv]", err);
    res.status(500).json({ error: "Erro ao exportar relatório." });
  }
});

export default router;
