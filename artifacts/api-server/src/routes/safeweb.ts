import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import {
  swTestarAutenticacao,
  swListarProdutos,
  swConsultaCPF,
  swConsultaCNPJ,
  swLocaisPorCnpjAr,
  swLocaisPorIbge,
  swAdicionarPresencial,
  swAdicionarRenovacao,
  swAdicionarVideoconferencia,
  swAdicionarEmissaoOnline,
  swCancelarSolicitacao,
  swRenovarComProduto,
  swRenovarOutraAC,
  swLiberarRenovacao,
  swEmitirComProduto,
  swEmitirOutraAC,
  swLiberarEmissao,
  swSafeIDValidarCertificado,
  swSafeIDObterProdutos,
  swSafeIDIncluirSolicitacao,
  swSafeIDIncluirCertificado,
  swAgendaListarHorarios,
  swAgendaAgendar,
  swAgendaCancelar,
  swAgendaConfiguracao,
  swAgendaInformacoes,
  swHopePrimeiraEmissao,
  swBiometriaValidar,
  swBiometriaPSBioLocal,
  swBiometriaPSBioGlobal,
  type SafewebSettings,
} from "../lib/safeweb";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Extract only the origin (scheme+host+port) from a URL — strips any path the user may have pasted */
function normalizeSwUrl(raw: string): string {
  try { return new URL(raw).origin; } catch { return raw.replace(/\/Service\/.+$/, "").replace(/\/$/, ""); }
}

async function getSwSettings(): Promise<SafewebSettings | null> {
  const [s] = await db.select().from(settingsTable).limit(1);
  const isHomol = s?.safewebAmbiente === "homologacao";
  const username = isHomol ? (s?.safewebUsernameHomologacao ?? s?.safewebUsername) : s?.safewebUsername;
  const password = isHomol ? (s?.safewebPasswordHomologacao ?? s?.safewebPassword) : s?.safewebPassword;
  if (!username || !password) return null;
  const rawUrl = (isHomol ? s?.safewebUrlHomologacao : s?.safewebUrl) ?? s?.safewebUrl;
  if (!rawUrl) return null;
  return {
    url: normalizeSwUrl(rawUrl),
    username,
    password,
    cnpjAr: s?.safewebCnpjAr ?? undefined,
    codigoParceiro: s?.safewebCodigoParceiro ?? undefined,
  };
}

type Res = Parameters<Parameters<typeof router.get>[1]>[1];
function requireSw(sw: SafewebSettings | null, res: Res): sw is SafewebSettings {
  if (!sw) {
    res.status(400).json({ error: "Safeweb não configurada. Acesse Configurações → Safeweb." });
    return false;
  }
  return true;
}

function handleErr(res: Res, err: unknown, msg: string): void {
  const message = (err as Error).message ?? msg;
  // Safeweb returns HTTP 4xx when credentials/request are invalid — extract clean message
  const swMatch = message.match(/Safeweb \w+ HTTP (\d+): (.+)/s);
  if (swMatch) {
    const httpCode = Number(swMatch[1]);
    let detail = swMatch[2];
    try {
      const parsed = JSON.parse(detail) as { mensagem?: string };
      if (parsed.mensagem) detail = parsed.mensagem;
    } catch { /* use raw */ }
    const status = httpCode >= 400 && httpCode < 500 ? 400 : 502;
    logger.error({ err }, msg);
    res.status(status).json({ error: detail });
    return;
  }
  logger.error({ err }, msg);
  res.status(502).json({ error: message });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/safeweb/test-auth", requireAdmin, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  try { res.json(await swTestarAutenticacao(sw)); }
  catch (err) { handleErr(res, err, "Safeweb test-auth error"); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUTOS
// GET /api/safeweb/produtos?idTipoEmissao=1&cnpjAr=...
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/safeweb/produtos", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  const { idTipoEmissao, cnpjAr } = req.query as Record<string, string>;
  try { res.json(await swListarProdutos(sw, Number(idTipoEmissao ?? 1), cnpjAr)); }
  catch (err) { handleErr(res, err, "Safeweb ListarProdutos error"); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONSULTA PRÉVIA
// POST /api/safeweb/consulta-cpf   { cpf, dataNascimento }
// POST /api/safeweb/consulta-cnpj  { cnpj, cpfResponsavel, dataNascimento }
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/safeweb/consulta-cpf", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  const { cpf, dataNascimento } = req.body ?? {};
  if (!cpf || !dataNascimento) { res.status(400).json({ error: "CPF e dataNascimento são obrigatórios." }); return; }
  try { res.json(await swConsultaCPF(sw, cpf, dataNascimento)); }
  catch (err) { handleErr(res, err, "Safeweb ConsultaCPF error"); }
});

router.post("/safeweb/consulta-cnpj", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  const { cnpj, cpfResponsavel, dataNascimento } = req.body ?? {};
  if (!cnpj || !cpfResponsavel || !dataNascimento) { res.status(400).json({ error: "CNPJ, CPF do responsável e dataNascimento são obrigatórios." }); return; }
  try { res.json(await swConsultaCNPJ(sw, cnpj, cpfResponsavel, dataNascimento)); }
  catch (err) { handleErr(res, err, "Safeweb ConsultaCNPJ error"); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAIS DE ATENDIMENTO
// GET  /api/safeweb/locais?cnpjAr=...&idStatus=1
// POST /api/safeweb/locais/ibge  { codigoIbge }
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/safeweb/locais", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  const { cnpjAr, idStatus } = req.query as Record<string, string>;
  try { res.json(await swLocaisPorCnpjAr(sw, cnpjAr, idStatus ? Number(idStatus) : 1)); }
  catch (err) { handleErr(res, err, "Safeweb LocaisCnpjAr error"); }
});

router.post("/safeweb/locais/ibge", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  const { codigoIbge } = req.body ?? {};
  if (!codigoIbge) { res.status(400).json({ error: "codigoIbge é obrigatório." }); return; }
  try { res.json(await swLocaisPorIbge(sw, codigoIbge)); }
  catch (err) { handleErr(res, err, "Safeweb LocaisIbge error"); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADICIONAR SOLICITAÇÃO
// POST /api/safeweb/solicitacao/presencial      — tipo 1
// POST /api/safeweb/solicitacao/renovacao       — tipo 2 (própria ou outra AC via CnpjACOrigem)
// POST /api/safeweb/solicitacao/videoconferencia — tipo 3
// POST /api/safeweb/solicitacao/emissao-online  — tipo 5 (própria ou outra AC via CnpjACOrigem)
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/safeweb/solicitacao/presencial", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  const body = req.body ?? {};
  if (!body.Nome || !body.CPF || !body.idProduto) { res.status(400).json({ error: "Nome, CPF e idProduto são obrigatórios." }); return; }
  try { res.json(await swAdicionarPresencial(sw, body)); }
  catch (err) { handleErr(res, err, "Safeweb AdicionarPresencial error"); }
});

router.post("/safeweb/solicitacao/renovacao", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  const body = req.body ?? {};
  if (!body.idProduto) { res.status(400).json({ error: "idProduto é obrigatório." }); return; }
  try { res.json(await swAdicionarRenovacao(sw, body)); }
  catch (err) { handleErr(res, err, "Safeweb AdicionarRenovacao error"); }
});

router.post("/safeweb/solicitacao/videoconferencia", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  const body = req.body ?? {};
  if (!body.idProduto) { res.status(400).json({ error: "idProduto é obrigatório." }); return; }
  try { res.json(await swAdicionarVideoconferencia(sw, body)); }
  catch (err) { handleErr(res, err, "Safeweb AdicionarVideoconferencia error"); }
});

router.post("/safeweb/solicitacao/emissao-online", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  const body = req.body ?? {};
  if (!body.idProduto) { res.status(400).json({ error: "idProduto é obrigatório." }); return; }
  try { res.json(await swAdicionarEmissaoOnline(sw, body)); }
  catch (err) { handleErr(res, err, "Safeweb AdicionarEmissaoOnline error"); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CANCELAR SOLICITAÇÃO
// POST /api/safeweb/solicitacao/:id/cancelar   { motivo? }
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/safeweb/solicitacao/:id/cancelar", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "ID da solicitação inválido." }); return; }
  try { res.json(await swCancelarSolicitacao(sw, String(id))); }
  catch (err) { handleErr(res, err, "Safeweb CancelarSolicitacao error"); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RENOVAÇÃO (workflow pós-solicitação)
// GET  /api/safeweb/renovacao/:id            — Renovar com produto
// POST /api/safeweb/renovacao/outra-ac       — Renovar outra AC
// POST /api/safeweb/renovacao/:id/liberar    — Liberar renovação
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/safeweb/renovacao/:id", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  try { res.json(await swRenovarComProduto(sw, Number(req.params.id))); }
  catch (err) { handleErr(res, err, "Safeweb RenovarComProduto error"); }
});

router.post("/safeweb/renovacao/outra-ac", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  try { res.json(await swRenovarOutraAC(sw, req.body ?? {})); }
  catch (err) { handleErr(res, err, "Safeweb RenovarOutraAC error"); }
});

router.post("/safeweb/renovacao/:id/liberar", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  try { res.json(await swLiberarRenovacao(sw, { idSolicitacao: Number(req.params.id), ...(req.body ?? {}) })); }
  catch (err) { handleErr(res, err, "Safeweb LiberarRenovacao error"); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EMISSÃO ON-LINE (workflow pós-solicitação)
// GET  /api/safeweb/emissao/:id             — Emitir com produto
// POST /api/safeweb/emissao/outra-ac        — Emitir outra AC
// POST /api/safeweb/emissao/:id/liberar     — Liberar emissão
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/safeweb/emissao/:id", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  try { res.json(await swEmitirComProduto(sw, Number(req.params.id))); }
  catch (err) { handleErr(res, err, "Safeweb EmitirComProduto error"); }
});

router.post("/safeweb/emissao/outra-ac", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  try { res.json(await swEmitirOutraAC(sw, req.body ?? {})); }
  catch (err) { handleErr(res, err, "Safeweb EmitirOutraAC error"); }
});

router.post("/safeweb/emissao/:id/liberar", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  try { res.json(await swLiberarEmissao(sw, { idSolicitacao: Number(req.params.id), ...(req.body ?? {}) })); }
  catch (err) { handleErr(res, err, "Safeweb LiberarEmissao error"); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RENOVAÇÃO SAFEID
// GET  /api/safeweb/safeid/validar/:cpf
// GET  /api/safeweb/safeid/produtos?cnpjAr=...
// POST /api/safeweb/safeid/solicitacao
// POST /api/safeweb/safeid/certificado
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/safeweb/safeid/validar/:cpf", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  try { res.json(await swSafeIDValidarCertificado(sw, String(req.params.cpf))); }
  catch (err) { handleErr(res, err, "Safeweb SafeID ValidarCertificado error"); }
});

router.get("/safeweb/safeid/produtos", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  const { cnpjAr } = req.query as Record<string, string>;
  try { res.json(await swSafeIDObterProdutos(sw, cnpjAr)); }
  catch (err) { handleErr(res, err, "Safeweb SafeID ObterProdutos error"); }
});

router.post("/safeweb/safeid/solicitacao", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  try { res.json(await swSafeIDIncluirSolicitacao(sw, req.body ?? {})); }
  catch (err) { handleErr(res, err, "Safeweb SafeID IncluirSolicitacao error"); }
});

router.post("/safeweb/safeid/certificado", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  try { res.json(await swSafeIDIncluirCertificado(sw, req.body ?? {})); }
  catch (err) { handleErr(res, err, "Safeweb SafeID IncluirCertificado error"); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO AGENDA
// GET    /api/safeweb/agenda/horarios?cnpjAr=...&idProduto=...
// POST   /api/safeweb/agenda/agendar
// DELETE /api/safeweb/agenda/:id
// GET    /api/safeweb/agenda/configuracao?cnpjAr=...
// GET    /api/safeweb/agenda/:id/informacoes
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/safeweb/agenda/horarios", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  const { localAtendimentoId, data } = req.query as Record<string, string>;
  const idLocal = parseInt(localAtendimentoId, 10);
  if (isNaN(idLocal)) { res.status(400).json({ error: "localAtendimentoId obrigatório" }); return; }
  try { res.json(await swAgendaListarHorarios(sw, idLocal, data)); }
  catch (err) { handleErr(res, err, "Safeweb Agenda ListarHorarios error"); }
});

router.post("/safeweb/agenda/agendar", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  const { localAtendimentoId, protocolo, data, catalogoProdutoId } = req.body ?? {};
  if (!localAtendimentoId || !protocolo || !data) { res.status(400).json({ error: "localAtendimentoId, protocolo e data são obrigatórios" }); return; }
  try { res.json(await swAgendaAgendar(sw, { localAtendimentoId: Number(localAtendimentoId), protocolo: String(protocolo), data: String(data), catalogoProdutoId: catalogoProdutoId ? Number(catalogoProdutoId) : undefined })); }
  catch (err) { handleErr(res, err, "Safeweb Agenda Agendar error"); }
});

router.delete("/safeweb/agenda/:protocolo", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  const { catalogoProdutoId } = req.query as Record<string, string>;
  const catId = catalogoProdutoId ? Number(catalogoProdutoId) : undefined;
  try { res.json(await swAgendaCancelar(sw, String(req.params.protocolo), catId)); }
  catch (err) { handleErr(res, err, "Safeweb Agenda Cancelar error"); }
});

router.get("/safeweb/agenda/configuracao", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  const { localAtendimentoId } = req.query as Record<string, string>;
  const idLocal = parseInt(localAtendimentoId, 10);
  if (isNaN(idLocal)) { res.status(400).json({ error: "localAtendimentoId obrigatório" }); return; }
  try { res.json(await swAgendaConfiguracao(sw, idLocal)); }
  catch (err) { handleErr(res, err, "Safeweb Agenda Configuracao error"); }
});

router.get("/safeweb/agenda/:protocolo/informacoes", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  try { res.json(await swAgendaInformacoes(sw, String(req.params.protocolo))); }
  catch (err) { handleErr(res, err, "Safeweb Agenda Informacoes error"); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO HOPE
// POST /api/safeweb/hope/primeira-emissao
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/safeweb/hope/primeira-emissao", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  try { res.json(await swHopePrimeiraEmissao(sw, req.body ?? {})); }
  catch (err) { handleErr(res, err, "Safeweb Hope PrimeiraEmissao error"); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BIOMETRIA
// GET  /api/safeweb/biometria/validar/:cpf
// POST /api/safeweb/biometria/psbio-local
// POST /api/safeweb/biometria/psbio-global
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/safeweb/biometria/validar/:cpf", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  try { res.json(await swBiometriaValidar(sw, String(req.params.cpf))); }
  catch (err) { handleErr(res, err, "Safeweb Biometria Validar error"); }
});

router.post("/safeweb/biometria/psbio-local", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  try { res.json(await swBiometriaPSBioLocal(sw, req.body ?? {})); }
  catch (err) { handleErr(res, err, "Safeweb PSBio Local error"); }
});

router.post("/safeweb/biometria/psbio-global", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSw(sw, res)) return;
  try { res.json(await swBiometriaPSBioGlobal(sw, req.body ?? {})); }
  catch (err) { handleErr(res, err, "Safeweb PSBio Global error"); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICA EVENTOS (webhooks recebidos da Safeweb)
// Configure no painel Safeweb a URL: https://seu-dominio.com/api/safeweb/eventos/:tipo
// Tipos: emissao, solicitacao, validacao, verificacao, cancelamento, revogacao,
//        pagamento, confirmacao-cadastro, solicitacao-periodo-uso,
//        certificado-periodo-uso, validacao-autonoma, cancelamento-solicitacao
// ═══════════════════════════════════════════════════════════════════════════════

// Mapa tipo do evento Safeweb → status interno do pedido
const SW_EVENT_STATUS_MAP: Record<string, string> = {
  emissao: "emitido",
  "certificado-periodo-uso": "emitido",
  validacao: "aguardando_validacao",
  "validacao-autonoma": "aguardando_validacao",
  verificacao: "aguardando_validacao",
  cancelamento: "cancelled",
  "cancelamento-solicitacao": "cancelled",
  revogacao: "revogado",
};

router.post("/safeweb/eventos/:tipo", async (req, res): Promise<void> => {
  const tipo = (req.params.tipo ?? "").toLowerCase();
  const payload = req.body ?? {};
  logger.info({ tipo, payload }, "Safeweb evento recebido");

  // Responde imediatamente para a Safeweb não reenviar
  res.json({ ok: true, tipo, recebido: new Date().toISOString() });

  // Processa em background para não bloquear a resposta
  (async () => {
    try {
      const solicitacaoId =
        payload.IdSolicitacao ?? payload.idSolicitacao ??
        payload.SolicitacaoId ?? payload.solicitacaoId ??
        payload.Protocolo ?? payload.protocolo;

      if (!solicitacaoId) {
        logger.warn({ tipo, payload }, "Safeweb evento sem IdSolicitacao — ignorado");
        return;
      }

      const { ordersTable: ot, db: database, certificatesTable: ct } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const { logEvent } = await import("../lib/order-events");
      const { notifyOrderStatus } = await import("../lib/notify");

      const [row] = await database
        .select({ order: ot, certName: ct.name })
        .from(ot)
        .leftJoin(ct, eq(ot.certificateId, ct.id))
        .where(eq(ot.safewebSolicitacaoId, String(solicitacaoId)))
        .limit(1);

      if (!row) {
        logger.warn({ tipo, solicitacaoId }, "Safeweb evento: pedido não encontrado");
        return;
      }

      const order = row.order;

      // Atualiza status Safeweb raw
      const safewebStatusLabel = String(
        payload.Status ?? payload.status ?? payload.Situacao ?? payload.Evento ?? tipo
      );

      const updates: Record<string, unknown> = {
        safewebStatus: safewebStatusLabel,
        safewebSyncedAt: new Date(),
      };

      // Mapeia para status interno se reconhecido
      const newStatus = SW_EVENT_STATUS_MAP[tipo];
      if (newStatus && order.status !== newStatus) {
        updates.status = newStatus;
      }

      await database.update(ot).set(updates as unknown as Parameters<typeof database.update<typeof ot>>[0]).where(eq(ot.id, order.id));
      await logEvent(order.id, "gar_status_updated", `Evento Safeweb [${tipo}]: ${safewebStatusLabel}`, { tipo, payload });

      // Notifica o cliente quando o certificado for emitido
      if (newStatus === "emitido") {
        notifyOrderStatus({
          to: order.customerEmail,
          phone: order.customerPhone,
          customerName: order.customerName,
          orderNumber: order.orderNumber,
          status: "completed",
          total: parseFloat(order.total),
          certName: row.certName ?? undefined,
        }).catch(err => logger.error({ err }, "Notificação emissão Safeweb: erro"));
      }
    } catch (err) {
      logger.error({ err, tipo }, "Safeweb evento: erro ao processar");
    }
  })();
});

// Rota específica para o webhook configurado em UrlSolicitacao no sw-auto.ts
// URL: /api/safeweb/eventos/webhook  (tipo = "webhook", ignoramos o tipo e lemos o payload)
router.post("/safeweb/eventos/webhook", async (req, res): Promise<void> => {
  const payload = req.body ?? {};
  const tipo = String(payload.Tipo ?? payload.tipo ?? payload.Evento ?? payload.evento ?? "webhook").toLowerCase();
  logger.info({ tipo, payload }, "Safeweb webhook recebido");

  res.json({ ok: true, tipo, recebido: new Date().toISOString() });

  (async () => {
    try {
      const solicitacaoId =
        payload.IdSolicitacao ?? payload.idSolicitacao ??
        payload.SolicitacaoId ?? payload.solicitacaoId;

      if (!solicitacaoId) {
        logger.warn({ payload }, "Safeweb webhook sem IdSolicitacao — ignorado");
        return;
      }

      const { ordersTable: ot, db: database, certificatesTable: ct } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const { logEvent } = await import("../lib/order-events");

      const [row] = await database
        .select({ order: ot, certName: ct.name })
        .from(ot)
        .leftJoin(ct, eq(ot.certificateId, ct.id))
        .where(eq(ot.safewebSolicitacaoId, String(solicitacaoId)))
        .limit(1);

      if (!row) { logger.warn({ solicitacaoId }, "Safeweb webhook: pedido não encontrado"); return; }

      const safewebStatusLabel = String(
        payload.Status ?? payload.status ?? payload.Situacao ?? payload.Evento ?? tipo
      );
      const updates: Record<string, unknown> = { safewebStatus: safewebStatusLabel, safewebSyncedAt: new Date() };
      const newStatus = SW_EVENT_STATUS_MAP[tipo];
      if (newStatus && row.order.status !== newStatus) updates.status = newStatus;

      await database.update(ot).set(updates as unknown as Parameters<typeof database.update<typeof ot>>[0]).where(eq(ot.id, row.order.id));
      await logEvent(row.order.id, "gar_status_updated", `Webhook Safeweb [${tipo}]: ${safewebStatusLabel}`, { tipo, payload });
    } catch (err) {
      logger.error({ err }, "Safeweb webhook: erro ao processar");
    }
  })();
});

export default router;
