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
  if (!s?.safewebUsername || !s?.safewebPassword) return null;
  // Use homologation URL when ambiente = "homologacao", otherwise production URL
  const rawUrl = (s.safewebAmbiente === "homologacao" ? s.safewebUrlHomologacao : s.safewebUrl) ?? s.safewebUrl;
  if (!rawUrl) return null;
  return {
    url: normalizeSwUrl(rawUrl),
    username: s.safewebUsername,
    password: s.safewebPassword,
    cnpjAr: s.safewebCnpjAr ?? undefined,
    codigoParceiro: s.safewebCodigoParceiro ?? undefined,
    siteUrl: s.siteUrl ?? undefined,
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
    body.CNPJ = order.customerCpfCnpj;
    body.RazaoSocial = order.companyName ?? order.customerName;
    body.NomeFantasia = order.companyName ? order.customerName : "";
    body.Nome = order.customerName;
    // CPF do responsável pode ser preenchido pelo operador se necessário
  } else {
    body.Nome = order.customerName;
    body.CPF = order.customerCpfCnpj;
    // DataNascimento obrigatória para e-CPF (PF)
    if (order.customerBirthDate) {
      body.DataNascimento = order.customerBirthDate; // ISO format: YYYY-MM-DD
    }
  }

  try {
    logger.info({ orderId, safewebIdProduto }, "swAutoComprar: criando solicitação na Safeweb (videoconferência)");

    const result = await swAdicionarVideoconferencia(sw, body);

    const solicitacaoId = result.idSolicitacao ?? result.Protocolo ?? null;
    const statusMsg = result.sucesso === false
      ? (result.mensagem ?? "Erro retornado pela Safeweb")
      : (result.mensagem ?? "Solicitação criada");

    if (result.sucesso === false) {
      logger.error({ orderId, result }, "swAutoComprar: Safeweb retornou erro");
      await logEvent(orderId, "admin_action", `Erro ao criar solicitação na Safeweb: ${statusMsg}`, { result });
      await db.update(ordersTable).set({ safewebStatus: `Erro: ${statusMsg}`, safewebSyncedAt: new Date() }).where(eq(ordersTable.id, orderId));
      return;
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
export async function swSyncStatus(orderId: number): Promise<{ ok: boolean; status?: string; error?: string }> {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) return { ok: false, error: "Pedido não encontrado" };
  if (!order.safewebSolicitacaoId) return { ok: false, error: "Pedido não registrado na Safeweb" };

  const sw = await getSwSettings();
  if (!sw) return { ok: false, error: "Credenciais Safeweb não configuradas" };

  try {
    // [INFERRED] Endpoint de status da solicitação Safeweb
    const token = await swGetToken(sw);
    const resp = await fetch(
      `${sw.url}/Service/Microservice/Shared/Partner/api/GetStatus/${order.safewebSolicitacaoId}`,
      { headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" } },
    );

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, error: `Safeweb HTTP ${resp.status}: ${text}` };
    }

    const data = await resp.json() as Record<string, unknown>;
    const statusLabel = String(data.Status ?? data.status ?? data.StatusDescricao ?? data.Situacao ?? "Desconhecido");
    const statusMap: Record<string, string> = {
      "Aguardando": "Aguardando",
      "Pendente": "Aguardando",
      "Validada": "Validada",
      "Emitida": "Emitida",
      "Cancelada": "Cancelada",
      "Revogada": "Revogada",
      "Aprovada": "Aprovada",
    };
    const friendlyStatus = statusMap[statusLabel] ?? statusLabel;

    // Mapear status Safeweb para status interno
    let internalStatus = order.status;
    if (friendlyStatus === "Emitida") internalStatus = "completed";
    else if (friendlyStatus === "Cancelada" || friendlyStatus === "Revogada") internalStatus = "cancelled";
    else if (friendlyStatus === "Validada" || friendlyStatus === "Aprovada") internalStatus = "protocol_assigned";

    await db.update(ordersTable).set({
      safewebStatus: friendlyStatus,
      safewebSyncedAt: new Date(),
      ...(internalStatus !== order.status ? { status: internalStatus as typeof order.status } : {}),
    }).where(eq(ordersTable.id, orderId));

    await logEvent(orderId, "gar_status_updated", `Status Safeweb atualizado: ${friendlyStatus}`, { statusRaw: data });

    return { ok: true, status: friendlyStatus };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
