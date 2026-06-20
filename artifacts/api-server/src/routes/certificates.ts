import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, certificatesTable, settingsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { swListarProdutos, type SafewebSettings } from "../lib/safeweb";
import { logger } from "../lib/logger";

const router = Router();

function certRow(c: typeof certificatesTable.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    price: parseFloat(c.price),
    priceContador: c.priceContador != null ? parseFloat(c.priceContador) : null,
    active: c.active,
    garHashProduto: c.garHashProduto ?? null,
    safewebIdProduto: c.safewebIdProduto ?? null,
    validityMonths: c.validityMonths,
    product: c.product ?? null,
    issuanceType: c.issuanceType ?? null,
    createdAt: c.createdAt,
  };
}

router.get("/certificates", async (req, res): Promise<void> => {
  const { activeOnly } = req.query;
  const rows = await db.select().from(certificatesTable).orderBy(certificatesTable.id);
  const result = activeOnly === "true" ? rows.filter(r => r.active) : rows;
  res.json(result.map(certRow));
});

router.post("/certificates", requireAdmin, async (req, res): Promise<void> => {
  const { name, description, price, priceContador, active, garHashProduto, safewebIdProduto, product, issuanceType } = req.body ?? {};
  if (!name || price === undefined) {
    res.status(400).json({ error: "Nome e preço são obrigatórios." });
    return;
  }
  const [cert] = await db.insert(certificatesTable).values({
    name,
    description: description || null,
    price: String(price),
    priceContador: priceContador != null ? String(priceContador) : null,
    active: active !== false,
    garHashProduto: garHashProduto || null,
    safewebIdProduto: safewebIdProduto || null,
    product: product || null,
    issuanceType: issuanceType || null,
  }).returning();
  res.status(201).json(certRow(cert));
});

router.post("/certificates/import-safeweb", requireAdmin, async (req, res): Promise<void> => {
  const [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings) {
    res.status(400).json({ error: "Configurações não encontradas." });
    return;
  }

  const isHomologacao = settings.safewebAmbiente === "homologacao";
  const swSettings: SafewebSettings = {
    url: (isHomologacao ? settings.safewebUrlHomologacao : settings.safewebUrl) ?? "",
    username: (isHomologacao ? settings.safewebUsernameHomologacao : settings.safewebUsername) ?? "",
    password: (isHomologacao ? settings.safewebPasswordHomologacao : settings.safewebPassword) ?? "",
    cnpjAr: settings.safewebCnpjAr ?? undefined,
    codigoParceiro: settings.safewebCodigoParceiro ?? undefined,
  };

  if (!swSettings.url || !swSettings.username) {
    res.status(400).json({ error: "Credenciais da Safeweb não configuradas. Acesse Configurações primeiro." });
    return;
  }

  if (!swSettings.cnpjAr) {
    res.status(400).json({ error: "CNPJ AR não configurado. Acesse Configurações → Safeweb e preencha o campo 'CNPJ AR'." });
    return;
  }

  swSettings.cnpjAr = swSettings.cnpjAr.replace(/\D/g, "");

  const TIPOS_EMISSAO = [1, 2, 3, 4];
  const allProdutos: Awaited<ReturnType<typeof swListarProdutos>> = [];
  const erros: string[] = [];

  const ISSUANCE_MAP: Record<number, string> = {
    1: "Presencial",
    2: "Renovação",
    3: "Videoconferência",
    4: "Fast",
  };

  const productsPerType: Record<number, Awaited<ReturnType<typeof swListarProdutos>>> = {};

  for (const tipo of TIPOS_EMISSAO) {
    try {
      const raw = await swListarProdutos(swSettings, tipo);
      let lista: typeof allProdutos = [];
      if (Array.isArray(raw)) {
        lista = raw;
      } else if (raw && typeof raw === "object") {
        const obj = raw as Record<string, unknown>;
        const inner = obj["Produtos"] ?? obj["produtos"] ?? obj["data"] ?? obj["Data"] ?? obj["items"];
        if (Array.isArray(inner)) lista = inner as typeof allProdutos;
        if (obj["sucesso"] === false || obj["Sucesso"] === false) {
          erros.push(`Tipo ${tipo}: ${String(obj["mensagem"] ?? obj["Mensagem"] ?? "sem produtos")}`);
        }
      }
      productsPerType[tipo] = lista;
      allProdutos.push(...lista);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      erros.push(`Tipo ${tipo}: ${msg}`);
      logger.warn({ tipo, err: msg }, "import-safeweb: erro ao buscar produtos");
    }
  }

  logger.info({ total: allProdutos.length, erros }, "import-safeweb: coleta concluída");

  const seen = new Set<number>();
  const unique: Array<{ produto: (typeof allProdutos)[number]; tipo: number }> = [];
  for (const tipo of TIPOS_EMISSAO) {
    for (const p of (productsPerType[tipo] ?? [])) {
      if (!seen.has(p.idProduto)) {
        seen.add(p.idProduto);
        unique.push({ produto: p, tipo });
      }
    }
  }

  if (!unique.length) {
    const detail = erros.length ? ` Detalhes: ${erros.join("; ")}` : "";
    res.status(400).json({ error: `Nenhum produto retornado pela Safeweb. Verifique as credenciais e o CNPJ AR.${detail}` });
    return;
  }

  const existing = await db.select({ safewebIdProduto: certificatesTable.safewebIdProduto }).from(certificatesTable);
  const existingIds = new Set(existing.map(e => e.safewebIdProduto).filter(Boolean));

  let imported = 0;
  let skipped = 0;
  for (const { produto: p, tipo } of unique) {
    const idStr = String(p.idProduto);
    if (existingIds.has(idStr)) { skipped++; continue; }
    await db.insert(certificatesTable).values({
      name: p.Nome,
      description: null,
      price: "0.00",
      active: true,
      safewebIdProduto: idStr,
      validityMonths: (p.Validade || 1) * 12,
      garHashProduto: null,
      issuanceType: ISSUANCE_MAP[tipo] ?? null,
    });
    imported++;
  }

  res.json({ imported, skipped, total: unique.length });
});

router.patch("/certificates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, description, price, priceContador, active, garHashProduto, safewebIdProduto, product, issuanceType } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (price !== undefined) updates.price = String(price);
  if (priceContador !== undefined) updates.priceContador = priceContador != null ? String(priceContador) : null;
  if (active !== undefined) updates.active = active;
  if (garHashProduto !== undefined) updates.garHashProduto = garHashProduto || null;
  if (safewebIdProduto !== undefined) updates.safewebIdProduto = safewebIdProduto || null;
  if (product !== undefined) updates.product = product || null;
  if (issuanceType !== undefined) updates.issuanceType = issuanceType || null;

  const [cert] = await db
    .update(certificatesTable)
    .set(updates as Parameters<typeof db.update>[0] extends infer T ? Record<string, unknown> : never)
    .where(eq(certificatesTable.id, id))
    .returning();
  if (!cert) {
    res.status(404).json({ error: "Modelo não encontrado." });
    return;
  }
  res.json(certRow(cert));
});

router.delete("/certificates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(certificatesTable).where(eq(certificatesTable.id, id));
  res.sendStatus(204);
});
export default router;
