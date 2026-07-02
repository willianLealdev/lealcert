/**
 * garAutoComprar — disparo automático da GAR após pagamento confirmado.
 * Chamado pelo webhook MP. Busca o hash do produto no catálogo, registra a
 * venda na GAR e emite o protocolo, sem nenhuma intervenção manual.
 */
import { eq } from "drizzle-orm";
import { db, ordersTable, certificatesTable, settingsTable } from "@workspace/db";
import { garComprar, garConsultarStatus, garEmitirProtocolo } from "./gestaoar";
import { logger } from "./logger";
import { logEvent } from "./order-events";

async function getIbgeCode(cep: string): Promise<string> {
  try {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) return "";
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return "";
    const data = await res.json() as { ibge?: string };
    return data.ibge ?? "";
  } catch {
    return "";
  }
}

export async function garAutoComprar(orderId: number): Promise<void> {
  // 1. Buscar pedido + certificado
  const [row] = await db
    .select({ order: ordersTable, cert: certificatesTable })
    .from(ordersTable)
    .leftJoin(certificatesTable, eq(ordersTable.certificateId, certificatesTable.id))
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  if (!row) {
    logger.warn({ orderId }, "garAutoComprar: pedido não encontrado");
    return;
  }

  const order = row.order;
  const cert = row.cert;

  // 2. Verificar se já foi registrado na GAR
  if (order.garPedido) {
    logger.info({ orderId, garPedido: order.garPedido }, "garAutoComprar: pedido já registrado na GAR, ignorando");
    return;
  }

  // 3. Buscar hash do produto GAR no catálogo
  const hashProduto = cert?.garHashProduto;
  if (!hashProduto) {
    logger.warn({ orderId, certificateId: order.certificateId }, "garAutoComprar: certificado sem hash GAR — registro manual necessário");
    await logEvent(orderId, "admin_action", "Certificado sem hash GAR configurado — registro manual necessário", { certificateId: order.certificateId });
    return;
  }

  // 4. Buscar credenciais GAR
  const [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings?.garApiKey) {
    logger.warn({ orderId }, "garAutoComprar: GAR API Key não configurada");
    return;
  }
  if (!settings.garHashVendedor || !settings.garHashTabela) {
    logger.warn({ orderId }, "garAutoComprar: HashVendedor ou HashTabela GAR não configurados");
    return;
  }

  const formaPagamento = parseInt(settings.garFormaPagamento ?? "8", 10);

  // 5. Montar dados do cliente
  const phone = (order.customerPhone ?? "").replace(/\D/g, "");
  const ddd = phone.slice(0, 2);
  const tel = phone.slice(2);

  const isCnpj = order.clientType === "cnpj";

  const cep = (order.addressZipcode ?? "").replace(/\D/g, "");
  const codigoIBGE = order.addressIbge || await getIbgeCode(cep);
  if (!codigoIBGE) {
    logger.warn({ orderId, cep }, "garAutoComprar: código IBGE não encontrado para o CEP — verifique o endereço do pedido");
  }

  const cliente = {
    CNPJCPF: order.customerCpfCnpj,
    NomeRazaoSocial: isCnpj ? (order.companyName ?? order.customerName) : order.customerName,
    NomeFantasia: isCnpj ? (order.customerName ?? "") : "",
    Email: order.customerEmail ?? "",
    CEP: cep,
    Logradouro: order.addressStreet ?? "",
    Numero: order.addressNumber ?? "",
    Complemento: order.addressComplement ?? "",
    Bairro: order.addressNeighborhood ?? "",
    Cidade: order.addressCity ?? "",
    UF: order.addressState ?? "",
    CodigoIBGE: codigoIBGE,
    DDD: ddd,
    Telefone: tel,
  };

  try {
    logger.info({ orderId, hashProduto }, "garAutoComprar: registrando venda na GAR");

    const result = await garComprar(
      settings.garApiKey,
      settings.garHashVendedor,
      settings.garHashTabela,
      formaPagamento,
      cliente,
      [hashProduto],
    );

    if (result.Status !== 0 && result.Erros?.length) {
      logger.error({ orderId, erros: result.Erros }, "garAutoComprar: GAR retornou erro na compra");
      await logEvent(orderId, "gar_sale_registered", `Erro ao registrar venda na GAR: ${result.Erros.map(e => e.Ocorrencia).join("; ")}`, { erros: result.Erros });
      return;
    }

    const garPedidoNumero = result.Produtos?.[0]?.Pedido ?? null;

    await db.update(ordersTable).set({
      garPedido: garPedidoNumero,
      garHashVenda: result.HashVenda ?? result.Hash ?? null,
      garAgendamentoLink: result.LinkAgenda ?? null,
      garStatus: "Compra registrada",
      garSyncedAt: new Date(),
    }).where(eq(ordersTable.id, orderId));

    await logEvent(orderId, "gar_sale_registered", `Venda registrada na Gestão AR — Pedido GAR #${garPedidoNumero}`, {
      garPedido: garPedidoNumero,
      hashProduto,
      formaPagamento,
    });

    logger.info({ orderId, garPedidoNumero }, "garAutoComprar: venda registrada na GAR");

    // 6. Emitir protocolo automaticamente
    if (garPedidoNumero) {
      try {
        // Para e-CPF: CPF é o próprio customerCpfCnpj; para e-CNPJ: CPF é o do representante legal
        const cpf = isCnpj
          ? (order.representanteCpf ?? order.customerCpfCnpj)
          : order.customerCpfCnpj;
        const cnpj = isCnpj ? order.customerCpfCnpj : undefined;
        const dataNasc = isCnpj
          ? (order.representanteNascimento ?? "")
          : (order.customerBirthDate ?? "");

        const protoResult = await garEmitirProtocolo(
          settings.garApiKey,
          Number(garPedidoNumero),
          cpf,
          cnpj,
          dataNasc || undefined,
          false,
          isCnpj,
        );

        const success = protoResult[0]?.ErrorCode === "000";
        if (success) {
          // Buscar o número real do protocolo via ConsultaPedidoProtocolo
          let protocolo: string | undefined;
          try {
            const statusResult = await garConsultarStatus(settings.garApiKey!, String(garPedidoNumero));
            protocolo = statusResult.Protocolo ?? undefined;
          } catch {
            // fallback: sem protocolo — admin pode buscar manualmente
          }

          await db.update(ordersTable).set({
            garProtocolo: protocolo ?? null,
            garStatus: "Protocolo emitido",
            status: "protocol_assigned",
          }).where(eq(ordersTable.id, orderId));

          await logEvent(orderId, "gar_protocol_emitted", `Protocolo emitido na Gestão AR: ${protocolo ?? "(aguardando número)"}`, {
            protocolo,
            garPedido: garPedidoNumero,
          });

          logger.info({ orderId, protocolo }, "garAutoComprar: protocolo emitido com sucesso");
        } else {
          logger.warn({ orderId, protoResult }, "garAutoComprar: EmitirProtocolo retornou resultado inesperado");
          await logEvent(orderId, "gar_protocol_emitted", "Emissão de protocolo retornou resultado inesperado — verificar manualmente", { protoResult });
        }
      } catch (protoErr) {
        logger.warn({ orderId, err: protoErr }, "garAutoComprar: falha ao emitir protocolo — pode ser emitido manualmente pelo admin");
        await logEvent(orderId, "gar_protocol_emitted", "Falha ao emitir protocolo automaticamente — emitir manualmente pelo painel admin");
      }
    }
  } catch (err) {
    logger.error({ orderId, err }, "garAutoComprar: erro inesperado ao registrar venda na GAR");
    await logEvent(orderId, "gar_sale_registered", "Erro inesperado ao registrar venda na Gestão AR");
  }
}
