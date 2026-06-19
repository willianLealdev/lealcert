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
  const { name, description, price, priceContador, active, garHashProduto, safewebIdProduto } = req.body ?? {};
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

  // Remove formatação do CNPJ AR (pontos, barras, traços) — a Safeweb exige só dígitos no path
  swSettings.cnpjAr = swSettings.cnpjAr.replace(/\D/g, "");

  // Busca produtos para todos os tipos de emissão disponíveis
  const TIPOS_EMISSAO = [1, 2, 3, 5];
  const allProdutos: Awaited<ReturnType<typeof swListarProdutos>> = [];
  const erros: string[] = [];

  for (const tipo of TIPOS_EMISSAO) {
    try {
      const raw = await swListarProdutos(swSettings, tipo);
      // A Safeweb pode retornar array direto OU objeto wrapper
      let lista: typeof allProdutos = [];
      if (Array.isArray(raw)) {
        lista = raw;
      } else if (raw && typeof raw === "object") {
        const obj = raw as Record<string, unknown>;
        // Tenta campos comuns de wrapper
        const inner = obj["Produtos"] ?? obj["produtos"] ?? obj["data"] ?? obj["Data"] ?? obj["items"];
        if (Array.isArray(inner)) lista = inner as typeof allProdutos;
        // Se veio sucesso=false, captura mensagem
        if (obj["sucesso"] === false || obj["Sucesso"] === false) {
          erros.push(`Tipo ${tipo}: ${String(obj["mensagem"] ?? obj["Mensagem"] ?? "sem produtos")}`);
        }
      }
      allProdutos.push(...lista);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      erros.push(`Tipo ${tipo}: ${msg}`);
      logger.warn({ tipo, err: msg }, "import-safeweb: erro ao buscar produtos");
    }
  }

  logger.info({ total: allProdutos.length, erros }, "import-safeweb: coleta concluída");

  // Deduplica por idProduto
  const seen = new Set<number>();
  const unique = allProdutos.filter(p => {
    if (seen.has(p.idProduto)) return false;
    seen.add(p.idProduto);
    return true;
  });

  if (!unique.length) {
    const detail = erros.length ? ` Detalhes: ${erros.join("; ")}` : "";
    res.status(400).json({ error: `Nenhum produto retornado pela Safeweb. Verifique as credenciais e o CNPJ AR.${detail}` });
    return;
  }

  // Busca IDs já importados
  const existing = await db.select({ safewebIdProduto: certificatesTable.safewebIdProduto }).from(certificatesTable);
  const existingIds = new Set(existing.map(e => e.safewebIdProduto).filter(Boolean));

  // Insere os novos
  let imported = 0;
  let skipped = 0;
  for (const p of unique) {
    const idStr = String(p.idProduto);
    if (existingIds.has(idStr)) { skipped++; continue; }
    const descParts = [p.TipoEmissao, p.ProdutoModelo].filter(Boolean);
    await db.insert(certificatesTable).values({
      name: p.Nome,
      description: descParts.length ? descParts.join(" · ") : null,
      price: "0.00",
      active: true,
      safewebIdProduto: idStr,
      validityMonths: p.Validade || 12,
      garHashProduto: null,
    });
    imported++;
  }

  res.json({ imported, skipped, total: unique.length });
});

router.patch("/certificates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, description, price, priceContador, active, garHashProduto, safewebIdProduto } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (price !== undefined) updates.price = String(price);
  if (priceContador !== undefined) updates.priceContador = priceContador != null ? String(priceContador) : null;
  if (active !== undefined) updates.active = active;
  if (garHashProduto !== undefined) updates.garHashProduto = garHashProduto || null;
  if (safewebIdProduto !== undefined) updates.safewebIdProduto = safewebIdProduto || null;

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
