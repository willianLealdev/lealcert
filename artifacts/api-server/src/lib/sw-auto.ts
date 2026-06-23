/**
 * swAutoComprar — registro automático na Safeweb após pagamento confirmado.
 * Chamado pelo webhook MP quando activeProvider === "safeweb".
 *
 * Roteamento por issuanceType do certificado:
 *   "Presencial"      → POST /Partner/api/Add/1  (mesmo payload que Add/3)
 *   "Videoconferência"→ POST /Partner/api/Add/3  (padrão)
 *   "Renovação"       → POST /Partner/api/Add/2  (Protocolo obrigatório, Titular só com Contato+Endereco)
 *   "Fast"            → POST /Partner/api/Add/5  (Emissão On-line; e-CPF sem dados pessoais na raiz)
 */
import { eq } from "drizzle-orm";
import { db, ordersTable, certificatesTable, settingsTable } from "@workspace/db";
import {
  swAdicionarVideoconferencia,
  swAdicionarPresencial,
  swAdicionarRenovacao,
  swAdicionarEmissaoOnline,
  type SafewebSettings,
  type SwResult,
} from "./safeweb";
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

/** Recursively convert null/undefined → "" to prevent .NET RuntimeBinderException */
function sanitizeNulls(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      result[k] = "";
    } else if (typeof v === "object" && !Array.isArray(v)) {
      result[k] = sanitizeNulls(v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
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

  // 5. Dados comuns
  const phone = (order.customerPhone ?? "").replace(/\D/g, "");
  const ddd = phone.slice(0, 2) || "11";
  const tel = phone.slice(2) || "000000000";
  const isCnpj = order.clientType === "cnpj";
  const issuanceType = cert?.issuanceType ?? "Videoconferência";

  const contato = { DDD: ddd, Telefone: tel, Email: order.customerEmail ?? "" };

  // Endereço raiz (empresa para e-CNPJ, titular para e-CPF)
  const enderecoRaiz = {
    Logradouro: order.addressStreet ?? "",
    Numero: order.addressNumber ?? "S/N",
    Complemento: order.addressComplement ?? "",
    Bairro: order.addressNeighborhood ?? "",
    UF: order.addressState ?? "",
    Cidade: order.addressCity ?? "",
    CEP: (order.addressZipcode ?? "").replace(/\D/g, ""),
  };

  // Endereço do representante (fallback para endereço do pedido)
  const enderecoRepresentante = {
    Logradouro: order.representanteAddressStreet || order.addressStreet || "",
    Numero: order.representanteAddressNumber || order.addressNumber || "S/N",
    Complemento: order.representanteAddressComplement || order.addressComplement || "",
    Bairro: order.representanteAddressNeighborhood || order.addressNeighborhood || "",
    UF: order.representanteAddressState || order.addressState || "",
    Cidade: order.representanteAddressCity || order.addressCity || "",
    CEP: ((order.representanteAddressZipcode || order.addressZipcode) ?? "").replace(/\D/g, ""),
  };

  // UrlSolicitacao — notificações de eventos Safeweb
  const urlSolicitacao = sw.siteUrl
    ? `${sw.siteUrl.replace(/\/$/, "")}/api/safeweb/eventos/webhook`
    : undefined;

  // ── Base fields enviados em todos os tipos ─────────────────────────────────
  const baseFields: Record<string, unknown> = {
    idProduto: safewebIdProduto,
    CnpjAR: sw.cnpjAr ?? "",
    ...(sw.codigoParceiro ? { CodigoParceiro: sw.codigoParceiro } : {}),
    ...(urlSolicitacao ? { UrlSolicitacao: urlSolicitacao } : {}),
  };

  // ── Montar payload e selecionar função de acordo com issuanceType ──────────
  let body: Record<string, unknown>;
  let apiFn: (settings: SafewebSettings, data: Record<string, unknown>) => Promise<SwResult>;
  let endpointLabel: string;

  if (issuanceType === "Renovação") {
    // ── Add/2 — Renovação própria ─────────────────────────────────────────────
    // Protocolo obrigatório; dados pessoais (Nome/CPF/DataNascimento) não enviados —
    // o servidor Safeweb já os tem da solicitação original.
    // Titular contém apenas Contato + Endereco.
    if (!order.protocolNumber) {
      logger.warn({ orderId }, "swAutoComprar: Renovação requer protocolNumber — registro manual necessário");
      await logEvent(orderId, "admin_action", "Renovação Safeweb requer número de protocolo da solicitação original — preencher manualmente");
      return;
    }
    endpointLabel = "Add/2 Renovação";
    apiFn = swAdicionarRenovacao;

    const titular: Record<string, unknown> = {
      Contato: contato,
      Endereco: isCnpj ? enderecoRepresentante : enderecoRaiz,
    };

    body = {
      ...baseFields,
      Protocolo: order.protocolNumber,
      Contato: contato,
      Endereco: enderecoRaiz,
      Titular: titular,
    };

  } else if (issuanceType === "Fast") {
    // ── Add/5 — Emissão On-line ───────────────────────────────────────────────
    // e-CPF: apenas Contato + Endereco na raiz (sem Nome/CPF/DataNascimento)
    // e-CNPJ: CNPJ/RazaoSocial/NomeFantasia na raiz + Titular{Contato,Endereco}
    endpointLabel = "Add/5 Emissão On-line";
    apiFn = swAdicionarEmissaoOnline;

    if (isCnpj) {
      body = {
        ...baseFields,
        CNPJ: (order.customerCpfCnpj ?? "").replace(/\D/g, ""),
        RazaoSocial: order.companyName ?? "",
        NomeFantasia: order.companyName ?? "",
        Contato: contato,
        Endereco: enderecoRaiz,
        Titular: {
          Contato: contato,
          Endereco: enderecoRepresentante,
        },
      };
    } else {
      body = {
        ...baseFields,
        Contato: contato,
        Endereco: enderecoRaiz,
      };
    }

  } else {
    // ── Add/1 Presencial | Add/3 Videoconferência ─────────────────────────────
    // Payload idêntico — apenas o endpoint difere.
    // e-CPF: Nome/CPF/DataNascimento na raiz + DocumentoIdentidade (opt)
    // e-CNPJ: CNPJ/RazaoSocial na raiz + Titular aninhado (Nome/CPF/DataNascimento + Contato + Endereco + DocumentoIdentidade)
    endpointLabel = issuanceType === "Presencial" ? "Add/1 Presencial" : "Add/3 Videoconferência";
    apiFn = issuanceType === "Presencial" ? swAdicionarPresencial : swAdicionarVideoconferencia;

    if (isCnpj) {
      const titular: Record<string, unknown> = {
        Nome: order.customerName ?? "",
        CPF: (order.representanteCpf ?? "").replace(/\D/g, ""),
        DataNascimento: order.representanteNascimento ?? "",
        Contato: contato,
        Endereco: enderecoRepresentante,
      };

      if (order.representanteDocTipo && order.representanteDocTipo !== "0") {
        titular.DocumentoIdentidade = {
          TipoDocumento: order.representanteDocTipo ?? "",
          Numero: order.representanteDocNumero ?? "",
          Emissor: order.representanteDocEmissor ?? "",
        };
      }
      if (order.customerCei) titular.CEI = order.customerCei;
      if (order.customerNis) titular.NIS = order.customerNis;

      body = {
        ...baseFields,
        CNPJ: (order.customerCpfCnpj ?? "").replace(/\D/g, ""),
        RazaoSocial: order.companyName ?? "",
        NomeFantasia: order.companyName ?? "",
        Contato: contato,
        Endereco: enderecoRaiz,
        Titular: titular,
      };
    } else {
      body = {
        ...baseFields,
        Nome: order.customerName ?? "",
        CPF: ((order.representanteCpf ?? order.customerCpfCnpj) ?? "").replace(/\D/g, ""),
        DataNascimento: order.representanteNascimento ?? order.customerBirthDate ?? "",
        Contato: contato,
        Endereco: enderecoRaiz,
      };

      if (order.representanteDocTipo && order.representanteDocTipo !== "0") {
        body.DocumentoIdentidade = {
          TipoDocumento: order.representanteDocTipo ?? "",
          Numero: order.representanteDocNumero ?? "",
          Emissor: order.representanteDocEmissor ?? "",
        };
      }
      if (order.customerCei) body.CEI = order.customerCei;
      if (order.customerNis) body.NIS = order.customerNis;
      if (order.inssNumber) body.PIS = order.inssNumber;
    }
  }

  const sanitizedBody = sanitizeNulls(body);

  try {
    logger.info(
      { orderId, safewebIdProduto, isCnpj, issuanceType, endpointLabel, bodyJson: JSON.stringify(sanitizedBody) },
      "swAutoComprar: enviando solicitação para Safeweb",
    );

    const result = await apiFn(sw, sanitizedBody);

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

    await logEvent(orderId, "gar_sale_registered", `Solicitação criada na Safeweb (${endpointLabel}) — ID #${solicitacaoId}`, {
      safewebSolicitacaoId: solicitacaoId,
      safewebIdProduto,
      endpointLabel,
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

    logger.info({ orderId, solicitacaoId, endpointLabel }, "swAutoComprar: solicitação Safeweb criada com sucesso");
  } catch (err) {
    const errMsg = (err as Error).message ?? String(err);
    logger.error({ orderId, err, errMsg, endpointLabel }, "swAutoComprar: erro inesperado ao criar solicitação na Safeweb");
    await logEvent(orderId, "admin_action", `Erro ao criar solicitação na Safeweb (${endpointLabel}): ${errMsg}`);
    await db.update(ordersTable).set({ safewebStatus: `Erro: ${errMsg}`, safewebSyncedAt: new Date() }).where(eq(ordersTable.id, orderId));
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
          const info = await swAgendaInformacoes(sw, String(agendId)) as Record<string, unknown>;
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
