import { Router } from "express";
import { eq, sql, and, inArray } from "drizzle-orm";
import { db, certificatesTable, settingsTable, ordersTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { swListarProdutos, type SafewebSettings } from "../lib/safeweb";
import { garTabelaPrecos, type GarProduto } from "../lib/gestaoar";
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

  function deriveProduct(nome: string): string | null {
    const n = (nome ?? "").toLowerCase().replace(/[^a-z0-9]/g, " ");
    if (n.includes("cnpj")) return "e-CNPJ";
    if (n.includes("cpf"))  return "e-CPF";
    if (n.includes("e pj") || n.match(/\bpj\b/)) return "e-PJ";
    if (n.includes("e pf") || n.match(/\bpf\b/)) return "e-PF";
    return null;
  }

  const existingRows = await db
    .select({ id: certificatesTable.id, safewebIdProduto: certificatesTable.safewebIdProduto })
    .from(certificatesTable);
  const existingMap = new Map(existingRows.filter(r => r.safewebIdProduto).map(r => [r.safewebIdProduto!, r.id]));

  let imported = 0;
  let updated = 0;
  for (const { produto: p, tipo } of unique) {
    const idStr = String(p.idProduto);
    const issuanceType = ISSUANCE_MAP[tipo] ?? null;
    const product = deriveProduct(p.Nome);
    const validityMonths = (p.Validade || 1) * 12;

    if (existingMap.has(idStr)) {
      // Update issuance_type and product for existing cert (fills in nulls from before migration)
      await db
        .update(certificatesTable)
        .set({ issuanceType, product, validityMonths })
        .where(eq(certificatesTable.id, existingMap.get(idStr)!));
      updated++;
    } else {
      await db.insert(certificatesTable).values({
        name: p.Nome,
        description: null,
        price: "0.00",
        active: true,
        safewebIdProduto: idStr,
        validityMonths,
        garHashProduto: null,
        issuanceType,
        product,
      });
      imported++;
    }
  }

  await db.execute(sql`
    UPDATE certificates SET product =
      CASE
        WHEN name ILIKE '%cnpj%' THEN 'e-CNPJ'
        WHEN name ILIKE '%cpf%'  THEN 'e-CPF'
        WHEN name ILIKE '%e-pj%' OR name ILIKE '%e pj%' THEN 'e-PJ'
        WHEN name ILIKE '%e-pf%' OR name ILIKE '%e pf%' THEN 'e-PF'
        ELSE product
      END
    WHERE product IS NULL OR product = ''
  `);

  res.json({ imported, updated, skipped: 0, total: unique.length });
});

// ── Import from Gestão AR ─────────────────────────────────────────────────────
router.post("/certificates/import-gar", requireAdmin, async (req, res): Promise<void> => {
  const [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings?.garApiKey) {
    res.status(400).json({ error: "Chave API da Gestão AR não configurada. Acesse Configurações primeiro." });
    return;
  }
  const documentoRaw = settings.garDocumento ?? settings.garHashVendedor ?? "";
  if (!documentoRaw) {
    res.status(400).json({ error: "CNPJ da AR (Documento) não configurado. Acesse Configurações → Gestão AR." });
    return;
  }
  // Strip formatting — GAR espera apenas dígitos (ex: 45737998000140, não 45.737.998/0001-40)
  const documento = documentoRaw.replace(/\D/g, "");

  const TIPOS_PRODUTO = [0, 1, 2, 3, 4];
  const seen = new Set<string>();
  const allProdutos: GarProduto[] = [];
  const erros: string[] = [];

  for (const tipo of TIPOS_PRODUTO) {
    try {
      const result = await garTabelaPrecos(settings.garApiKey, documento, tipo, 0);
      for (const p of result.Produtos ?? []) {
        if (!seen.has(p.HashProduto)) {
          seen.add(p.HashProduto);
          allProdutos.push(p);
        }
      }
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      logger.warn({ tipo, err }, "import-gar: erro ao buscar TipoProduto");
      erros.push(`TipoProduto=${tipo}: ${msg}`);
    }
  }

  if (!allProdutos.length) {
    const detalhe = erros.length ? ` Detalhes: ${erros[0]}` : "";
    res.status(400).json({ error: `Nenhum produto retornado pela Gestão AR. Documento usado: ${documento}.${detalhe}` });
    return;
  }

  function deriveIssuanceFromGar(descricao: string): string | null {
    const d = (descricao ?? "").toLowerCase();
    if (d.includes("video") || d.includes("vídeo")) return "Videoconferência";
    if (d.includes("renova")) return "Renovação";
    if (d.includes("fast")) return "Fast";
    if (d.includes("presenc")) return "Presencial";
    return descricao || null;
  }

  function deriveProductFromGar(nome: string, tipoProdutoDescricao: string): string | null {
    const n = (nome + " " + tipoProdutoDescricao).toLowerCase().replace(/[^a-z0-9]/g, " ");
    if (n.includes("cnpj")) return "e-CNPJ";
    if (n.includes("cpf")) return "e-CPF";
    if (n.match(/\be pj\b/) || n.match(/\bepj\b/)) return "e-PJ";
    if (n.match(/\be pf\b/) || n.match(/\bepf\b/)) return "e-PF";
    return null;
  }

  const existingRows = await db
    .select({ id: certificatesTable.id, garHashProduto: certificatesTable.garHashProduto })
    .from(certificatesTable);
  const existingMap = new Map(
    existingRows.filter(r => r.garHashProduto).map(r => [r.garHashProduto!, r.id])
  );

  let imported = 0;
  let updated = 0;
  for (const p of allProdutos) {
    const issuanceType = deriveIssuanceFromGar(p.TipoEmissaoDescricao);
    const product = deriveProductFromGar(p.Nome, p.TipoProdutoDescricao);
    const model = (p.TipoCertificado === "A1" || p.TipoCertificado === "A3") ? p.TipoCertificado : null;
    const validityMonths = (p.Validade || 1) * 12;
    const price = p.ValorVenda ? p.ValorVenda.toFixed(2) : "0.00";

    if (existingMap.has(p.HashProduto)) {
      await db
        .update(certificatesTable)
        .set({ issuanceType, product, model, validityMonths })
        .where(eq(certificatesTable.id, existingMap.get(p.HashProduto)!));
      updated++;
    } else {
      await db.insert(certificatesTable).values({
        name: p.Nome,
        description: null,
        price,
        active: true,
        garHashProduto: p.HashProduto,
        validityMonths,
        safewebIdProduto: null,
        issuanceType,
        product,
        model,
      });
      imported++;
    }
  }

  res.json({ imported, updated, skipped: 0, total: allProdutos.length });
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

router.post("/certificates/batch-delete", requireAdmin, async (req, res): Promise<void> => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids é obrigatório." });
    return;
  }
  const numericIds = ids.map(Number).filter(n => Number.isFinite(n) && n > 0);
  if (numericIds.length === 0) {
    res.json({ deleted: 0, skipped: 0, skippedIds: [] });
    return;
  }
  try {
    await db.delete(certificatesTable).where(inArray(certificatesTable.id, numericIds));
    res.json({ deleted: numericIds.length, skipped: 0, skippedIds: [] });
  } catch (err) {
    logger.error({ err }, "Erro ao excluir certificados em lote");
    res.status(500).json({ error: "Erro ao excluir certificados. Verifique os logs do servidor." });
  }
});

router.post("/certificates/batch-toggle", requireAdmin, async (req, res): Promise<void> => {
  const { product, issuanceType, active } = req.body ?? {};
  if (!product || !issuanceType || active === undefined) {
    res.status(400).json({ error: "product, issuanceType e active são obrigatórios." });
    return;
  }
  const updated = await db
    .update(certificatesTable)
    .set({ active })
    .where(and(eq(certificatesTable.product, product), eq(certificatesTable.issuanceType, issuanceType)))
    .returning();
  res.json({ updated: updated.length });
});

router.delete("/certificates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  try {
    await db.delete(certificatesTable).where(eq(certificatesTable.id, id));
    res.sendStatus(204);
  } catch (err) {
    logger.error({ err, id }, "Erro ao deletar certificado");
    res.status(500).json({ error: "Erro ao excluir o certificado. Verifique os logs do servidor." });
  }
});
export default router;
