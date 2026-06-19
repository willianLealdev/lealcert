/**
 * swAutoComprar — registro automático na Safeweb após pagamento confirmado.
 * Chamado pelo webhook MP quando activeProvider === "safeweb".
 * Cria a solicitação de videoconferência na Safeweb e salva o ID de volta no pedido.
 */
import { eq } from "drizzle-orm";
import { db, ordersTable, certificatesTable, settingsTable } from "@workspace/db";
import { swAdicionarVideoconferencia, swAdicionarPresencial, swGetToken, type SafewebSettings } from "./safeweb";
import { logger } from "./logger";
import { logEvent } from "./order-events";
import { notifyProviderRegistered } from "./notify";

/** Extract only the origin (scheme+host+port) — strips any path the user may have pasted */
function normalizeSwUrl(raw: string): string {
  try { return new URL(raw).origin; } catch { return raw.replace(/\/Service\/.+$/, "").replace(/\/$/, ""); }
}

async function getSwSettings(): Promise<(SafewebSettings & { siteUrl?: string }) | null> {
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
    siteUrl: s?.siteUrl ?? undefined,
  };
}

export async function swAutoComprar(orderId: number): Promise<void> {
  // 1. Buscar pedido + certificado
  const [row] = await db
    .select({ order: ordersTable, cert: certificatesTable })
    .from(ordersTable)
    .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  if (!row) { logger.warn({ orderId }, "swAutoComprar: pedido não encontrado"); return; }

  const order = row.order;
  const cert = row.cert;

  // 2. Verificar se já foi registrado na Safeweb
  if (order.safewebSolicitacaoId) {
    logger.info({ orderId, safewebSolicitacaoId: order.safewebSolicitacaoId }, "swAutoComprar: pedido já registrado na Safeweb, ignorando");
    return;
  }

  // 3. Verificar idProduto Safeweb no catálogo
  const safewebIdProduto = cert?.safewebIdProduto;
  if (!safewebIdProduto) {
    logger.warn({ orderId, certificateId: order.certificateId }, "swAutoComprar: certificado sem idProduto Safeweb — registro manual necessário");
    await logEvent(orderId, "admin_action", "Certificado sem idProduto Safeweb configurado — registrar manualmente na Safeweb", { certificateId: order.certificateId });
    return;
  }

  // 4. Buscar credenciais Safeweb
  const sw = await getSwSettings();
  if (!sw) { logger.warn({ orderId }, "swAutoComprar: credenciais Safeweb não configuradas"); return; }

  // 5. Montar dados do cliente
  const phone = (order.customerPhone ?? "").replace(/\D/g, "");
  const ddd = phone.slice(0, 2) || "11";
  const tel = phone.slice(2) || "000000000";
  const isCnpj = order.clientType === "cnpj";

  const contato = {
    DDD: ddd,
    Telefone: tel,
    Email: order.customerEmail ?? "",
  };

  const endereco = {
    Logradouro: order.addressStreet ?? "",
    Numero: order.addressNumber ?? "S/N",
    Bairro: order.addressNeighborhood ?? "",
    UF: order.addressState ?? "",
    Cidade: order.addressCity ?? "",
    CEP: (order.addressZipcode ?? "").replace(/\D/g, ""),
  };

  // UrlSolicitacao — URL para receber notificações de eventos da Safeweb
  // A Safeweb fará POST para esta URL quando o status da solicitação mudar
  const urlSolicitacao = sw.siteUrl
    ? `${sw.siteUrl.replace(/\/$/, "")}/api/safeweb/eventos/webhook`
    : undefined;

  const body: Record<string, unknown> = {
    CnpjAR: sw.cnpjAr ?? "",
    idProduto: safewebIdProduto,
    Contato: contato,
    Endereco: endereco,
    ...(sw.codigoParceiro ? { CodigoParceiro: sw.codigoParceiro } : {}),
    ...(urlSolicitacao ? { UrlSolicitacao: urlSolicitacao } : {}),
  };

  if (isCnpj) {
    // e-CNPJ: campos da empresa + representante legal (obrigatório pela Safeweb PSS)
    body.CNPJ = order.customerCpfCnpj;
    body.RazaoSocial = order.companyName ?? order.customerName;
    body.NomeFantasia = order.companyName ?? "";
    body.Nome = order.customerName; // nome do representante legal
    if (order.representanteCpf) {
      body.CPF = order.representanteCpf; // CPF do representante legal
    }
    if (order.representanteNascimento) {
      body.DataNascimento = order.representanteNascimento; // data de nascimento do representante
    }
  } else {
    // e-CPF: campos da pessoa física
    body.Nome = order.customerName;
    body.CPF = order.customerCpfCnpj;
    if (order.customerBirthDate) {
      body.DataNascimento = order.customerBirthDate; // ISO format: YYYY-MM-DD
    }
  }

  // Documento de identificação do titular/representante
  // Tipo: 0=Não Informado, 1=RG, 2=RNE, 3=Passaporte
  const docTipo = (isCnpj ? order.representanteDocTipo : order.representanteDocTipo) ?? "0";
  body.DocumentoTipo = docTipo;
  if (docTipo !== "0" && docTipo) {
    if (order.representanteDocNumero) body.DocumentoNumero = order.representanteDocNumero;
    // Formato: OrgãoExpedidorUF (ex: "SSPRJ") — sem espaços, sem CR/LF
    if (order.representanteDocEmissor) body.DocumentoEmissor = order.representanteDocEmissor.replace(/\s+/g, "").toUpperCase();
  }

  try {
    logger.info({ orderId, safewebIdProduto, isCnpj, body }, "swAutoComprar: enviando solicitação para Safeweb");

    const result = await swAdicionarVideoconferencia(sw, body);

    // Log completo da resposta para diagnóstico
    logger.info({ orderId, resultRaw: result }, "swAutoComprar: resposta completa da Safeweb");

    // A Safeweb pode retornar o ID diretamente como string/number,
    // ou como objeto com vários campos possíveis
    let solicitacaoId: string | null = null;
    let statusMsg = "Solicitação criada";

    if (typeof result === "string" || typeof result === "number") {
      // Resposta é o próprio ID (ex: "8000136590")
      const raw = String(result).trim();
      if (raw && !/^(false|erro|error|null|undefined)$/i.test(raw)) {
        solicitacaoId = raw;
      } else {
        logger.error({ orderId, result }, "swAutoComprar: Safeweb retornou string de erro");
        await logEvent(orderId, "admin_action", `Erro ao criar solicitação na Safeweb: ${raw}`, { result });
        await db.update(ordersTable).set({ safewebStatus: `Erro: ${raw}`, safewebSyncedAt: new Date() }).where(eq(ordersTable.id, orderId));
        return;
      }
    } else {
      // Resposta é um objeto — tenta extrair o ID de campos conhecidos
      if (result.sucesso === false) {
        statusMsg = String(result.mensagem ?? "Erro retornado pela Safeweb");
        logger.error({ orderId, result }, "swAutoComprar: Safeweb retornou erro");
        await logEvent(orderId, "admin_action", `Erro ao criar solicitação na Safeweb: ${statusMsg}`, { result });
        await db.update(ordersTable).set({ safewebStatus: `Erro: ${statusMsg}`, safewebSyncedAt: new Date() }).where(eq(ordersTable.id, orderId));
        return;
      }
      solicitacaoId = String(
        result.idSolicitacao ??
        result.IdSolicitacao ??
        result.Protocolo ??
        result.protocolo ??
        result.id ??
        result.Id ??
        result.idSolicitacaoVenda ??
        result.IdSolicitacaoVenda ??
        result.SolicitacaoId ??
        result.solicitacaoId ??
        ""
      ) || null;
      statusMsg = String(result.mensagem ?? "Solicitação criada");
    }

    await db.update(ordersTable).set({
      safewebSolicitacaoId: solicitacaoId ? String(solicitacaoId) : null,
      safewebStatus: statusMsg,
      safewebSyncedAt: new Date(),
      status: "protocol_assigned",
    }).where(eq(ordersTable.id, orderId));

    await logEvent(orderId, "gar_sale_registered", `Solicitação criada na Safeweb — ID #${solicitacaoId}`, {
      safewebSolicitacaoId: solicitacaoId,
      safewebIdProduto,
    });

    // Notificar cliente (e-mail + WhatsApp) que pedido foi registrado na Safeweb
    notifyProviderRegistered({
      to: order.customerEmail,
      phone: order.customerPhone,
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      provider: "safeweb",
      protocolNumber: solicitacaoId ? String(solicitacaoId) : undefined,
    }).catch((err: unknown) => logger.error({ err }, "swAutoComprar: erro ao notificar registro Safeweb"));

    logger.info({ orderId, solicitacaoId }, "swAutoComprar: solicitação Safeweb criada com sucesso");
  } catch (err) {
    logger.error({ orderId, err }, "swAutoComprar: erro inesperado ao criar solicitação na Safeweb");
    await logEvent(orderId, "admin_action", "Erro inesperado ao criar solicitação na Safeweb — verificar manualmente");
    await db.update(ordersTable).set({ safewebStatus: `Erro: ${(err as Error).message}`, safewebSyncedAt: new Date() }).where(eq(ordersTable.id, orderId));
  }
}

// ── Consultar status de uma solicitação Safeweb ───────────────────────────────
// A Safeweb não possui endpoint dedicado de consulta de status por solicitação —
// o status é atualizado via webhooks de eventos (POST /api/safeweb/eventos/:tipo).
// Esta função tenta obter info via GetInformation do agendamento (se houver),
// e caso contrário apenas atualiza safewebSyncedAt e retorna o status atual do banco.
export async function swSyncStatus(orderId: number): Promise<{ ok: boolean; status?: string; error?: string }> {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) return { ok: false, error: "Pedido não encontrado" };
  if (!order.safewebSolicitacaoId) return { ok: false, error: "Pedido não registrado na Safeweb" };

  const sw = await getSwSettings();
  if (!sw) return { ok: false, error: "Credenciais Safeweb não configuradas" };

  // Status atual salvo no banco (atualizado pelos webhooks de eventos)
  const currentStatus = order.safewebStatus ?? "Solicitação criada";

  try {
    // Tenta GetInformation do agendamento se houver idAgendamento salvo
    if (order.safewebAgendamentoId) {
      const agendId = parseInt(order.safewebAgendamentoId, 10);
      if (!isNaN(agendId)) {
        const { swAgendaInformacoes } = await import("./safeweb");
        try {
          const info = await swAgendaInformacoes(sw, agendId) as Record<string, unknown>;
          const statusLabel = String(
            info?.Status ?? info?.status ?? info?.Situacao ?? info?.situacao ?? currentStatus
          );
          await db.update(ordersTable).set({
            safewebStatus: statusLabel,
            safewebSyncedAt: new Date(),
          }).where(eq(ordersTable.id, orderId));
          await logEvent(orderId, "gar_status_updated", `Sync Safeweb (agendamento): ${statusLabel}`, { info });
          return { ok: true, status: statusLabel };
        } catch {
          // GetInformation falhou — segue para retornar status do banco
        }
      }
    }

    // Sem endpoint de status por solicitação na Safeweb — atualiza timestamp e retorna status atual do banco
    // O status real é propagado pelos webhooks de eventos configurados no painel Safeweb.
    await db.update(ordersTable).set({ safewebSyncedAt: new Date() }).where(eq(ordersTable.id, orderId));
    logger.info({ orderId, safewebSolicitacaoId: order.safewebSolicitacaoId }, "swSyncStatus: status mantido (Safeweb envia atualizações por webhook)");

    return { ok: true, status: currentStatus };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
