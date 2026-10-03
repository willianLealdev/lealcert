import { db, settingsTable } from "@workspace/db";

export function moneyCents(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) {
    throw new Error("Preço inválido: informe um valor não negativo com até duas casas decimais.");
  }
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("Preço fora do limite permitido.");
  return cents;
}

export function calculateOrderTotal(basePrice: number, plusPrice: number, discount = 0): number {
  return Math.max(0, moneyCents(basePrice) + moneyCents(plusPrice) - moneyCents(discount)) / 100;
}

export async function getLealPlusPrice(): Promise<number> {
  const [settings] = await db.select({ price: settingsTable.lealPlusPrice })
    .from(settingsTable).limit(1);
  if (!settings) throw new Error("Preço do Leal Plus não configurado no catálogo.");
  return moneyCents(settings.price) / 100;
}