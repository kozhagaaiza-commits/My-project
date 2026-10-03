import { formatRub } from "@/lib/money";
import { PRICE_ROUNDING_RUB } from "@/lib/config";
import type { AdminSettings, PurchaseCurrency } from "@/lib/admin-products-ui/types";
import { computeAutoPrice } from "@/lib/pricing";
import { minorToInput } from "@/lib/admin-products-ui/money-input";

export { computeAutoPrice };

export type PricePreview =
  | { kind: "ok"; priceKopecks: number; line: string }
  | { kind: "no_rate"; currency: PurchaseCurrency; line: string }
  | { kind: "empty" };

/** Курс USD/CNY из настроек; RUB — всегда 1; нет курса или настроек — null. */
export function rateFor(currency: PurchaseCurrency, settings: AdminSettings | null): number | null {
  if (currency === "RUB") return 1;
  return settings?.rates[currency]?.rate ?? null;
}

const formatRate = (rate: number) => rate.toFixed(4).replace(".", ",");

/** «800.00 USD × 83,5600 × 2.00 = 133 696 ₽ → 133 700 ₽» (Блок 4, «Форма товара» → «Цена»). */
export function buildPricePreview(
  purchaseMinor: number | undefined,
  currency: PurchaseCurrency,
  settings: AdminSettings | null,
): PricePreview {
  if (purchaseMinor === undefined || purchaseMinor <= 0) return { kind: "empty" };
  const rate = rateFor(currency, settings);
  if (rate === null || settings === null) return { kind: "no_rate", currency, line: `Курс ${currency} не загружен` };
  const multiplier = settings.markup_multiplier;
  const rounding = settings.price_rounding_rub || PRICE_ROUNDING_RUB;
  const priceKopecks = computeAutoPrice(purchaseMinor, rate, multiplier, rounding);
  const exact = Math.round((purchaseMinor / 100) * rate * multiplier * 100);
  const line =
    `${minorToInput(purchaseMinor)} ${currency} × ${formatRate(rate)} × ${multiplier.toFixed(2)}` +
    ` = ${formatRub(exact)} → ${formatRub(priceKopecks)}`;
  return { kind: "ok", priceKopecks, line };
}
