import { PG_INT_MAX } from "@/lib/schemas/common";
import { computeAutoPrice, formatPriceCalculation, type PurchaseCurrency } from "@/lib/pricing";
import type { AdminProductsRepo } from "./repo";
import type { PricingSettings } from "./rows";

// Автоцена товара (Блок 5.4): computeAutoPrice по последнему курсу exchange_rates (order by rate_date desc limit 1)
// и настройкам app_settings (markup_multiplier, price_rounding_rub). RUB — курс 1, строка курса не нужна.

export type AutoPriceResult =
  | { ok: true; price: number; calculation: string }
  | { ok: false; reason: "rate_not_loaded"; currency: "USD" | "CNY" }
  | { ok: false; reason: "too_large" };

/** Курс для расчёта: RUB → 1; USD/CNY → последняя строка exchange_rates или null. */
export async function rateFor(repo: AdminProductsRepo, currency: PurchaseCurrency): Promise<number | null> {
  if (currency === "RUB") return 1;
  return (await repo.latestRate(currency))?.rate ?? null;
}

export function priceWith(cost: number, currency: PurchaseCurrency, rate: number, s: PricingSettings): AutoPriceResult {
  const price = computeAutoPrice(cost, rate, s.markup_multiplier, s.price_rounding_rub);
  // products.price — integer (A32): цена больше 2 147 483 647 коп. дала бы 22003 → 500.
  if (price > PG_INT_MAX || price <= 0) return { ok: false, reason: "too_large" };
  return { ok: true, price, calculation: formatPriceCalculation(cost, currency, rate, s.markup_multiplier, s.price_rounding_rub) };
}

export async function resolveAutoPrice(repo: AdminProductsRepo, currency: PurchaseCurrency, cost: number): Promise<AutoPriceResult> {
  const rate = await rateFor(repo, currency);
  if (rate === null) return { ok: false, reason: "rate_not_loaded", currency: currency as "USD" | "CNY" };
  return priceWith(cost, currency, rate, await repo.pricingSettings());
}

/** 422 RATE_NOT_LOADED в POST/PATCH товара (Блок 3). */
export const rateNotLoadedMessage = (currency: string) => `Курс ${currency} не загружен. Загрузите курс или задайте цену вручную`;
/** Цена вне integer — текста в Чертеже нет; ошибка поля «Закупка». */
export const PRICE_TOO_LARGE_MESSAGE = "Цена получается больше допустимой. Проверьте закупку";
