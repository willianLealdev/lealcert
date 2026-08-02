import { Router } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import { db, settingsTable, ordersTable, usersTable, orderEventsTable, certificateRenewalsTable, certificatesTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { logEvent, getOrderEvents, isGarStatusEmitido } from "../lib/order-events";
import { notifyOrderStatus, notifyScheduling } from "../lib/notify";
import {
  garConsultarStatus,
  garTabelaPrecos,
  garFormasPagamento,
  garTiposEmissao,
  garTiposProduto,
  garValidades,
  garPsBio,
  garComprar,
  garEmitirProtocolo,
  garConsultarPedido,
  garPedidosPorCliente,
  garPedidosContador,
  garRenovacoes,
  garLocaisAgendamento,
  garSlotsLocal,
  garUFs,
  garMunicipios,
  garDiasSemana,
  garFamilias,
  garAgendar,
  garDisponibilidadeAgenda,
  garParceiroVendas,
} from "../lib/gestaoar";

const router = Router();

async function getGarSettings() {
  const [s] = await db.select().from(settingsTable).limit(1);
  return s;
}

function requireGarKey(apiKey: string | null | undefined, res: Parameters<Parameters<typeof router.get>[1]>[1]): apiKey is string {
  if (!apiKey) {
    res.status(400).json({ error: "API Key da Gestão AR não configurada. Acesse Configurações → Gestão AR para inserir a chave." });
    return false;
  }
  return true;
}

// ── Tabela de preços (produtos reais) ─────────────────────────────────────────
router.get("/gestaoar/produtos", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  const { documento, tipoProduto, tipoEmissao, validade } = req.query as Record<string, string>;
  try {
    const result = await garTabelaPrecos(
      s.garApiKey!,
      documento ?? s.garHashVendedor ?? "",
      tipoProduto ? Number(tipoProduto) : undefined,
      tipoEmissao ? Number(tipoEmissao) : undefined,
      validade ? Number(validade) : undefined,
    );
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR TabelaPrecos error");
    res.status(502).json({ error: "Erro ao consultar tabela de preços na Gestão AR." });
  }
});

// ── Tipos de emissão ──────────────────────────────────────────────────────────
router.get("/gestaoar/tipos-emissao", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  const { documento } = req.query as Record<string, string>;
  try {
    const result = await garTiposEmissao(s.garApiKey!, documento);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR TipoEmissao error");
    res.status(502).json({ error: "Erro ao consultar tipos de emissão." });
  }
});

// ── Tipos de produto ──────────────────────────────────────────────────────────
router.get("/gestaoar/tipos-produto", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  const { documento } = req.query as Record<string, string>;
  try {
    const result = await garTiposProduto(s.garApiKey!, documento);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR TipoProduto error");
    res.status(502).json({ error: "Erro ao consultar tipos de produto." });
  }
});

// ── Validades ─────────────────────────────────────────────────────────────────
router.get("/gestaoar/validades", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  const { tipo, tipoEmissao } = req.query as Record<string, string>;
  try {
    const result = await garValidades(s.garApiKey!, Number(tipo ?? 1), Number(tipoEmissao ?? 1));
    res.json(result ?? []);
  } catch (err) {
    logger.error({ err }, "GAR Validade error");
    res.status(502).json({ error: "Erro ao consultar validades." });
  }
});

// ── Famílias de produtos ──────────────────────────────────────────────────────
router.get("/gestaoar/familias", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  try {
    const result = await garFamilias(s.garApiKey!);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR Familias error");
    res.status(502).json({ error: "Erro ao consultar famílias de produtos." });
  }
});

// ── Formas de pagamento ───────────────────────────────────────────────────────
router.get("/gestaoar/formas-pagamento", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  try {
    const result = await garFormasPagamento(s.garApiKey!);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR FormasPagamento error");
    res.status(502).json({ error: "Erro ao consultar formas de pagamento." });
  }
});

// ── PSBio (verifica biometria) ────────────────────────────────────────────────
router.post("/gestaoar/psbio", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  const { cpf } = req.body ?? {};
  if (!cpf) { res.status(400).json({ error: "CPF obrigatório." }); return; }
  try {
    const result = await garPsBio(s.garApiKey!, cpf);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR PSBio error");
    res.status(502).json({ error: "Erro ao consultar PSBio." });
  }
});

// ── Dias da semana ────────────────────────────────────────────────────────────
router.get("/gestaoar/dias-semana", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  try {
    const result = await garDiasSemana(s.garApiKey!);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR DiasSemana error");
    res.status(502).json({ error: "Erro ao consultar dias da semana." });
  }
});

// ── Locais de agendamento ─────────────────────────────────────────────────────
router.get("/gestaoar/locais", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  const { uf, municipio } = req.query as Record<string, string>;
  try {
    const result = await garLocaisAgendamento(s.garApiKey!, uf, municipio);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR LocaisAgendamento error");
    res.status(502).json({ error: "Erro ao consultar locais de agendamento." });
  }
});

// ── Slots de um local ─────────────────────────────────────────────────────────
router.get("/gestaoar/locais/:hashLocal/slots", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  const hashLocal = Array.isArray(req.params.hashLocal) ? req.params.hashLocal[0] : req.params.hashLocal;
  try {
    const result = await garSlotsLocal(s.garApiKey!, hashLocal);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR LocaisSlot error");
    res.status(502).json({ error: "Erro ao consultar slots do local." });
  }
});

// ── UFs ───────────────────────────────────────────────────────────────────────
router.get("/gestaoar/ufs", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  try {
    const result = await garUFs(s.garApiKey!);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR UFs error");
    res.status(502).json({ error: "Erro ao consultar UFs." });
  }
});

// ── Municípios ────────────────────────────────────────────────────────────────
router.get("/gestaoar/municipios", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  const { uf } = req.query as Record<string, string>;
  if (!uf) { res.status(400).json({ error: "UF obrigatória." }); return; }
  try {
    const result = await garMunicipios(s.garApiKey!, uf);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR Municipios error");
    res.status(502).json({ error: "Erro ao consultar municípios." });
  }
});

// ── Consultar status de um pedido GAR ─────────────────────────────────────────
router.get("/gestaoar/pedido/:garPedido/status", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  const garPedido = Array.isArray(req.params.garPedido) ? req.params.garPedido[0] : req.params.garPedido;
  try {
    const result = await garConsultarStatus(s.garApiKey!, garPedido);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR ConsultarStatus error");
    res.status(502).json({ error: "Erro ao consultar pedido na Gestão AR." });
  }
});

// ── Consultar pedido completo ─────────────────────────────────────────────────
router.get("/gestaoar/pedido/:garPedido", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  const garPedido = Array.isArray(req.params.garPedido) ? req.params.garPedido[0] : req.params.garPedido;
  try {
    const result = await garConsultarPedido(s.garApiKey!, garPedido);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR ConsultarPedido error");
    res.status(502).json({ error: "Erro ao consultar pedido na Gestão AR." });
  }
});

// ── Pedidos de um cliente (CPF/CNPJ) ─────────────────────────────────────────
router.get("/gestaoar/cliente/:documento/pedidos", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  const documento = Array.isArray(req.params.documento) ? req.params.documento[0] : req.params.documento;
  try {
    const result = await garPedidosPorCliente(s.garApiKey!, documento);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR PedidosCliente error");
    res.status(502).json({ error: "Erro ao consultar pedidos do cliente." });
  }
});

// ── Pedidos do contador ───────────────────────────────────────────────────────
router.get("/gestaoar/contador/:documento/pedidos", requireAdmin, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  const documento = Array.isArray(req.params.documento) ? req.params.documento[0] : req.params.documento;
  try {
    const result = await garPedidosContador(s.garApiKey!, documento);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR PedidosContador error");
    res.status(502).json({ error: "Erro ao consultar pedidos do contador." });
  }
});

// ── Extrato de renovações ─────────────────────────────────────────────────────
router.get("/gestaoar/renovacoes", requireAdmin, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  const { dataInicial, dataFinal } = req.query as Record<string, string>;
  if (!dataInicial || !dataFinal) {
    res.status(400).json({ error: "dataInicial e dataFinal são obrigatórios." });
    return;
  }
  try {
    const result = await garRenovacoes(s.garApiKey!, dataInicial, dataFinal);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR Renovacoes error");
    res.status(502).json({ error: "Erro ao consultar renovações." });
  }
});

// ── Emitir protocolo manualmente ──────────────────────────────────────────────
router.post("/gestaoar/pedido/:garPedido/emitir-protocolo", requireAdmin, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  const garPedido = Array.isArray(req.params.garPedido) ? req.params.garPedido[0] : req.params.garPedido;
  const { cpf, cnpj, dataNascimento, isPossuiCNH, isCNPJ } = req.body ?? {};
  if (!cpf) { res.status(400).json({ error: "CPF obrigatório." }); return; }
  try {
    const result = await garEmitirProtocolo(
      s.garApiKey!,
      Number(garPedido),
      cpf,
      cnpj,
      dataNascimento,
      isPossuiCNH,
      isCNPJ,
    );
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GAR EmitirProtocolo error");
    res.status(502).json({ error: "Erro ao emitir protocolo na Gestão AR." });
  }
});

// ── GET /orders/:id/events — histórico completo de eventos do pedido ──────────
router.get("/orders/:id/events", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const userId = req.session.userId as number;
  const role = req.session.role as string;

  const [row] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "Pedido não encontrado." }); return; }
  if (role !== "admin" && row.userId !== userId) { res.status(403).json({ error: "Acesso negado." }); return; }

  const rows = await db
    .select()
    .from(orderEventsTable)
    .where(eq(orderEventsTable.orderId, id))
    .orderBy(desc(orderEventsTable.createdAt));

  // Map DB column names to the OpenAPI schema field names
  const events = rows.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    type: r.eventType,
    message: r.description,
    meta: r.metadata ?? null,
    createdAt: r.createdAt,
  }));

  res.json(events);
});

// ── Sincronizar pedido local com GAR — detecta emissão e cria renovação ───────
router.post("/gestaoar/sync-order/:orderId", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  const orderId = parseInt(Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId, 10);
  const role = req.session.role as string;
  const userId = req.session.userId as number;

  const [orderRow] = await db
    .select({ order: ordersTable, cert: certificatesTable })
    .from(ordersTable)
    .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  if (!orderRow) { res.status(404).json({ error: "Pedido não encontrado." }); return; }
  if (role !== "admin" && orderRow.order.userId !== userId) { res.status(403).json({ error: "Acesso negado." }); return; }
  if (!orderRow.order.garPedido) { res.status(400).json({ error: "Este pedido não possui número GAR registrado." }); return; }

  const order = orderRow.order;
  const cert = orderRow.cert;

  try {
    const garStatus = await garConsultarStatus(s.garApiKey!, order.garPedido!);
    const newGarStatus = garStatus.StatusPedido ?? null;
    const newProtocolo = garStatus.Protocolo ?? order.garProtocolo;

    // Detectar se o certificado foi emitido na GAR
    const wasEmitido = isGarStatusEmitido(newGarStatus) && order.status !== "completed";

    if (wasEmitido) {
      // Criar registro de renovação local
      const validityMonths = cert?.validityMonths ?? 12;
      const emittedAt = new Date();
      const expiresAt = new Date(emittedAt);
      expiresAt.setMonth(expiresAt.getMonth() + validityMonths);

      // Verificar se já existe registro de renovação para este pedido
      const [existingRenewal] = await db
        .select()
        .from(certificateRenewalsTable)
        .where(eq(certificateRenewalsTable.orderId, orderId))
        .limit(1);

      if (!existingRenewal) {
        await db.insert(certificateRenewalsTable).values({
          orderId,
          customerName: order.customerName,
          customerCpfCnpj: order.customerCpfCnpj,
          customerEmail: order.customerEmail ?? null,
          certificateName: cert?.name ?? "Certificado Digital",
          garPedido: order.garPedido,
          garProtocolo: newProtocolo ?? null,
          validityMonths,
          emittedAt,
          expiresAt,
        });
      }

      await logEvent(orderId, "certificate_emitted", `Certificado emitido com sucesso — status GAR: ${newGarStatus}`, {
        garStatus: newGarStatus,
        protocolo: newProtocolo,
        expiresAt: expiresAt.toISOString(),
        validityMonths,
      });
      await logEvent(orderId, "order_completed", "Pedido concluído — certificado emitido e registro de renovação criado");

      // Notificar cliente (e-mail + WhatsApp) sobre conclusão
      notifyOrderStatus({
        to: order.customerEmail,
        phone: order.customerPhone,
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        status: "completed",
        certName: cert?.name,
        protocolNumber: newProtocolo ?? undefined,
      }).catch((err: unknown) => logger.error({ err }, "Erro ao notificar conclusão do pedido"));

      await db.update(ordersTable).set({
        garStatus: newGarStatus,
        garProtocolo: newProtocolo,
        garSyncedAt: new Date(),
        status: "completed",
      }).where(eq(ordersTable.id, orderId));

      // Loyalty: incrementar cartela do contador se for um pedido de contador
      if (order.userId) {
        const { incrementLoyaltySlot } = await import("../lib/loyalty");
        incrementLoyaltySlot(order.userId, orderId).catch((err: unknown) => logger.error({ err }, "Loyalty: erro ao incrementar slot (GAR sync manual)"));
      }

      logger.info({ orderId, garStatus: newGarStatus }, "Certificado emitido — pedido concluído e renovação registrada");
    } else {
      if (newGarStatus && newGarStatus !== order.garStatus) {
        await logEvent(orderId, "gar_status_updated", `Status GAR atualizado: ${order.garStatus ?? "—"} → ${newGarStatus}`, { garStatus: newGarStatus });
      }
      await db.update(ordersTable).set({
        garStatus: newGarStatus,
        garProtocolo: newProtocolo,
        garSyncedAt: new Date(),
      }).where(eq(ordersTable.id, orderId));
    }

    res.json({ ok: true, garStatus, wasEmitido });
  } catch (err) {
    logger.error({ err }, "GAR SyncOrder error");
    res.status(502).json({ error: "Erro ao sincronizar pedido com Gestão AR." });
  }
});

// ── POST /orders/:id/gar-comprar — registra venda na GAR após pagamento ───────
// Chamado automaticamente pelo webhook de pagamento, mas também disponível manualmente
router.post("/orders/:id/gar-comprar", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const role = req.session.role as string;
  const userId = req.session.userId as number;

  const [row] = await db
    .select({ order: ordersTable, userName: usersTable.name })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
    .where(eq(ordersTable.id, id))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Pedido não encontrado." }); return; }
  if (role !== "admin" && row.order.userId !== userId) { res.status(403).json({ error: "Acesso negado." }); return; }

  const order = row.order;
  if (!s.garHashVendedor || !s.garHashTabela) {
    res.status(400).json({ error: "HashVendedor e HashTabela da Gestão AR não configurados." });
    return;
  }

  const { hashProduto } = req.body ?? {};
  if (!hashProduto) {
    res.status(400).json({ error: "hashProduto obrigatório para registrar a venda na Gestão AR." });
    return;
  }

  // Prefer videoconference (tipoEmissao=3) as default
  const formaPagamento = parseInt(s.garFormaPagamento ?? "8", 10);

  // Extract DDD + phone
  const phone = (order.customerPhone ?? "").replace(/\D/g, "");
  const ddd = phone.slice(0, 2);
  const tel = phone.slice(2);

  const cepClean = (order.addressZipcode ?? "").replace(/\D/g, "");
  let codigoIBGE = "";
  try {
    if (cepClean.length === 8) {
      const vr = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`, { signal: AbortSignal.timeout(5000) });
      if (vr.ok) {
        const vd = await vr.json() as { ibge?: string };
        codigoIBGE = vd.ibge ?? "";
      }
    }
  } catch { /* ignora — segue sem IBGE */ }

  const cliente = {
    CNPJCPF: order.customerCpfCnpj,
    NomeRazaoSocial: order.companyName ?? order.customerName,
    NomeFantasia: order.companyName ? order.customerName : "",
    Email: order.customerEmail ?? "",
    CEP: cepClean,
    Logradouro: order.addressStreet ?? "",
    Numero: order.addressNumber ?? "",
    Complemento: "",
    Bairro: order.addressNeighborhood ?? "",
    Cidade: order.addressCity ?? "",
    UF: order.addressState ?? "",
    CodigoIBGE: codigoIBGE,
    DDD: ddd,
    Telefone: tel,
  };

  try {
    const result = await garComprar(
      s.garApiKey!,
      s.garHashVendedor,
      s.garHashTabela,
      formaPagamento,
      cliente,
      Array.isArray(hashProduto) ? hashProduto : [hashProduto],
    );

    if (result.Status !== 0 && result.Erros?.length) {
      res.status(400).json({ error: result.Erros.map(e => e.Ocorrencia).join("; ") });
      return;
    }

    // Save GAR order numbers
    const garPedidoNumero = result.Produtos?.[0]?.Pedido ?? null;
    const garHashVenda = result.Produtos?.[0] ? undefined : null;

    await db.update(ordersTable).set({
      garPedido: garPedidoNumero,
      garHashVenda: result.LinkFatura ?? null,
      garAgendamentoLink: result.LinkAgenda ?? null,
      garStatus: "Compra registrada",
      garSyncedAt: new Date(),
      status: "paid",
    }).where(eq(ordersTable.id, id));

    // Auto emit protocol if we have a pedido number
    if (garPedidoNumero) {
      try {
        const cpf = order.clientType === "cnpj" ? order.customerCpfCnpj : order.customerCpfCnpj;
        const cnpj = order.clientType === "cnpj" ? order.customerCpfCnpj : undefined;
        const protoResult = await garEmitirProtocolo(
          s.garApiKey!,
          Number(garPedidoNumero),
          cpf,
          cnpj,
          undefined,
          false,
          order.clientType === "cnpj",
        );
        const success = protoResult[0]?.ErrorCode === "000";
        if (success) {
          await db.update(ordersTable).set({
            garProtocolo: protoResult[0]?.ErrorDescription,
            garStatus: "Protocolo emitido",
            status: "protocol_assigned",
          }).where(eq(ordersTable.id, id));
        }
      } catch (protoErr) {
        logger.warn({ protoErr }, "GAR EmitirProtocolo falhou automaticamente — pode ser emitido manualmente");
      }
    }

    res.json({ ok: true, garResult: result });
  } catch (err) {
    logger.error({ err }, "GAR Comprar error");
    res.status(502).json({ error: "Erro ao registrar venda na Gestão AR." });
  }
});

// ── GET /orders/:id/gar-locais — locais disponíveis para agendamento ──────────
router.get("/orders/:id/gar-locais", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const userId = req.session.userId as number;
  const role = req.session.role as string;

  const [row] = await db.select({ order: ordersTable })
    .from(ordersTable)
    .where(eq(ordersTable.id, id))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Pedido não encontrado." }); return; }
  if (role !== "admin" && row.order.userId !== userId) { res.status(403).json({ error: "Acesso negado." }); return; }

  const { uf, municipio } = req.query as Record<string, string>;

  try {
    const locais = await garLocaisAgendamento(s.garApiKey!, uf, municipio);
    res.json(locais);
  } catch (err) {
    logger.error({ err }, "GAR LocaisAgendamento error");
    res.status(502).json({ error: "Erro ao buscar locais de agendamento na Gestão AR." });
  }
});

// ── GET /orders/:id/gar-slots/:hashLocal — slots de um local ─────────────────
router.get("/orders/:id/gar-slots/:hashLocal", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const userId = req.session.userId as number;
  const role = req.session.role as string;
  const hashLocal = Array.isArray(req.params.hashLocal) ? req.params.hashLocal[0] : req.params.hashLocal;

  const [row] = await db.select({ order: ordersTable })
    .from(ordersTable)
    .where(eq(ordersTable.id, id))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Pedido não encontrado." }); return; }
  if (role !== "admin" && row.order.userId !== userId) { res.status(403).json({ error: "Acesso negado." }); return; }

  try {
    const slots = await garSlotsLocal(s.garApiKey!, hashLocal);
    res.json(slots);
  } catch (err) {
    logger.error({ err }, "GAR SlotsLocal error");
    res.status(502).json({ error: "Erro ao buscar horários disponíveis na Gestão AR." });
  }
});

// ── GET /orders/:id/gar-disponibilidade — horários disponíveis ───────────────
router.get("/orders/:id/gar-disponibilidade", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const userId = req.session.userId as number;
  const role = req.session.role as string;

  const [row] = await db.select({ order: ordersTable })
    .from(ordersTable)
    .where(eq(ordersTable.id, id))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Pedido não encontrado." }); return; }
  if (role !== "admin" && row.order.userId !== userId) { res.status(403).json({ error: "Acesso negado." }); return; }

  const { hashLocal, hashSlot, dataInicial, dataFinal } = req.query as Record<string, string>;
  if (!hashLocal || !dataInicial || !dataFinal) {
    res.status(400).json({ error: "hashLocal, dataInicial e dataFinal são obrigatórios." });
    return;
  }

  try {
    const result = await garDisponibilidadeAgenda(s.garApiKey!, dataInicial, dataFinal, hashLocal, hashSlot);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "GAR ObterDisponibilidadeAgenda error");
    res.status(502).json({ error: "Erro ao consultar disponibilidade na Gestão AR." });
  }
});

// ── POST /orders/:id/agendar — confirma agendamento e envia e-mail ────────────
router.post("/orders/:id/agendar", requireAuth, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const userId = req.session.userId as number;
  const role = req.session.role as string;

  const [row] = await db
    .select({ order: ordersTable })
    .from(ordersTable)
    .where(eq(ordersTable.id, id))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Pedido não encontrado." }); return; }
  if (role !== "admin" && row.order.userId !== userId) { res.status(403).json({ error: "Acesso negado." }); return; }

  const order = row.order;

  if (!order.garPedido) {
    res.status(400).json({ error: "Pedido ainda não registrado na Gestão AR." });
    return;
  }

  // hashLocal, dataInicial e dataFinal são obrigatórios conforme docs GAR endpoint /Agendamento
  // DataInicial e DataFinal devem ser strings no formato "YYYY-MM-DD HH:mm"
  const { hashLocal, dataInicial, dataFinal, localNome } = req.body ?? {};
  if (!hashLocal || !dataInicial || !dataFinal) {
    res.status(400).json({ error: "hashLocal, dataInicial e dataFinal são obrigatórios." });
    return;
  }

  try {
    const result = await garAgendar(s.garApiKey!, order.garPedido, hashLocal, dataInicial, dataFinal);

    // A API retorna [] em caso de sucesso e array de erros em caso de falha
    const erros = Array.isArray(result)
      ? (result as Array<{ Ocorrencia?: string; ErrorDescription?: string }>)
      : result.Erros;
    if (erros && (erros as unknown[]).length > 0) {
      const msg = (erros as Array<{ Ocorrencia?: string; ErrorDescription?: string }>)
        .map(e => e.Ocorrencia ?? e.ErrorDescription ?? "Erro desconhecido").join("; ");
      res.status(400).json({ error: msg });
      return;
    }

    const dataHora = Array.isArray(result)
      ? `${dataInicial} – ${dataFinal}`
      : (result.DataHoraAgendamento ?? `${dataInicial} – ${dataFinal}`);
    const nomeLocal = Array.isArray(result)
      ? (localNome ?? "A confirmar")
      : (result.NomeLocalAgendamento ?? localNome ?? "A confirmar");

    // Salvar agendamento no pedido
    await db.update(ordersTable).set({
      garAgendamentoLocalNome: nomeLocal,
      garAgendamentoLocalHash: hashLocal,
      garAgendamentoDataHora: dataHora,
      garStatus: "Agendado",
      scheduledAt: new Date(),
    }).where(eq(ordersTable.id, id));

    // Notificar cliente (e-mail + WhatsApp) sobre agendamento
    notifyScheduling({
      to: order.customerEmail,
      phone: order.customerPhone,
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      protocolo: order.garProtocolo ?? "",
      localNome: nomeLocal,
      dataHora,
    }).catch((err: unknown) => logger.error({ err }, "Erro ao notificar agendamento"));

    logger.info({ orderId: id, localNome: nomeLocal, dataHora }, "GAR Agendamento confirmado");
    res.json({ ok: true, localNome: nomeLocal, dataHora });
  } catch (err) {
    logger.error({ err }, "GAR Agendar error");
    res.status(502).json({ error: "Erro ao confirmar agendamento na Gestão AR." });
  }
});

// ── Relatório de Vendas do Parceiro ──────────────────────────────────────────
router.get("/gestaoar/parceiro-vendas", requireAdmin, async (req, res): Promise<void> => {
  const s = await getGarSettings();
  if (!requireGarKey(s?.garApiKey, res)) return;
  if (!s?.garHashVendedor) {
    res.status(400).json({ error: "Hash do Vendedor não configurado. Acesse Configurações → Gestão AR para inserir o hashVendedor." });
    return;
  }
  const { dataInicial, dataFinal } = req.query as Record<string, string>;
  if (!dataInicial || !dataFinal) {
    res.status(400).json({ error: "dataInicial e dataFinal são obrigatórios." });
    return;
  }
  try {
    const allItems = await garParceiroVendas(s.garApiKey, s.garHashVendedor, dataInicial, dataFinal);

    // Filtra apenas pedidos reais (Id > 0)
    const realItems = allItems.filter(i => (i.Id ?? 0) > 0);

    // Filtro de parceiro: prioridade ao garHashParceiro (HashVendedor no pedido),
    // depois ao garDocumento (CNPJ da AR como CNPJCPFVendedor).
    // Sem filtro configurado → retorna todos.
    const filterHash = s.garHashParceiro?.trim() ?? "";
    const filterCnpj = (s.garDocumento ?? "").replace(/\D/g, "");
    const filtered = filterHash
      ? realItems.filter(i => i.HashVendedor === filterHash)
      : filterCnpj
        ? realItems.filter(i => (i.CNPJCPFVendedor ?? "").replace(/\D/g, "") === filterCnpj)
        : realItems;

    const pedidoNums = filtered.map(i => i.Protocolo).filter((v): v is string => Boolean(v));
    const localOrders = pedidoNums.length > 0
      ? await db.select({ id: ordersTable.id, garPedido: ordersTable.garPedido })
          .from(ordersTable)
          .where(inArray(ordersTable.garPedido, pedidoNums))
      : [];
    const localMap = new Map(localOrders.map(o => [o.garPedido, o.id]));
    const enriched = filtered.map(item => ({
      ...item,
      localOrderId: item.Protocolo ? (localMap.get(item.Protocolo) ?? null) : null,
    }));
    res.json(enriched);
  } catch (err) {
    logger.error({ err }, "GAR parceiroVendas error");
    res.status(502).json({ error: "Erro ao consultar vendas na Gestão AR." });
  }
});

export default router;
