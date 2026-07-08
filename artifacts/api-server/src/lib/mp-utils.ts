/**
 * Utilitários compartilhados para integração com MercadoPago.
 */

/**
 * Descobre o payment_method_id correto a partir dos primeiros 6 dígitos do cartão.
 * Consulta o endpoint de BIN do MP; se falhar, faz detecção básica pelo primeiro dígito.
 */
export async function getMpPaymentMethodId(cardNumber: string, mpToken: string): Promise<string> {
  const bin = cardNumber.replace(/\D/g, "").slice(0, 6);
  if (bin.length < 6) return detectByFirstDigit(cardNumber);

  try {
    const r = await fetch(`https://api.mercadopago.com/v1/payment_methods/search?bin=${bin}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (r.ok) {
      const data = await r.json() as { results?: { id: string }[] };
      const id = data.results?.[0]?.id;
      if (id) return id;
    }
  } catch { /* fallback abaixo */ }

  return detectByFirstDigit(cardNumber);
}

function detectByFirstDigit(cardNumber: string): string {
  const first = cardNumber.replace(/\D/g, "")[0];
  if (first === "4") return "visa";
  if (first === "5") return "master";
  if (first === "3") return "amex";
  if (first === "6") return "elo";
  return "visa";
}

/**
 * Mapeia mensagens de erro do MercadoPago (inglês) para português claro ao usuário.
 */
export function mapMpError(raw: string | undefined | null): string {
  if (!raw) return "Erro ao processar cartão. Tente novamente.";
  const msg = raw.toLowerCase();

  if (msg.includes("invalid payment_method_id") || msg.includes("payment_method_id"))
    return "Bandeira do cartão não identificada. Verifique os dados e tente novamente.";
  if (msg.includes("invalid card number") || msg.includes("card_number"))
    return "Número do cartão inválido. Verifique e tente novamente.";
  if (msg.includes("invalid expiration") || msg.includes("expiration"))
    return "Data de validade do cartão inválida.";
  if (msg.includes("invalid security code") || msg.includes("security_code") || msg.includes("cvv"))
    return "CVV inválido. Verifique o código de segurança do cartão.";
  if (msg.includes("insufficient") || msg.includes("funds"))
    return "Cartão sem saldo ou limite insuficiente.";
  if (msg.includes("rejected") || msg.includes("cc_rejected"))
    return "Pagamento recusado pela operadora do cartão.";
  if (msg.includes("blacklist") || msg.includes("fraud"))
    return "Cartão não autorizado para esta transação.";
  if (msg.includes("call for authorize"))
    return "Pagamento requer autorização manual. Entre em contato com seu banco.";
  if (msg.includes("duplicated") || msg.includes("duplicate"))
    return "Pagamento duplicado detectado. Aguarde alguns minutos e tente novamente.";
  if (msg.includes("invalid token") || msg.includes("token"))
    return "Erro ao processar dados do cartão. Tente novamente.";

  return "Erro ao processar cartão. Verifique os dados ou tente outro cartão.";
}
