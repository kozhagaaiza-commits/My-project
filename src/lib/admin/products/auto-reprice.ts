import type { PurchaseCurrency } from "@/lib/pricing";
import { priceWith } from "./auto-price";
import { recalculateAutoPrices, skipReason } from "./recalc";
import type { AdminProductsRepo } from "./repo";
import type { PricingSettings } from "./rows";

// Автопересчёт цен после загрузки курса (5.4 «Автопересчёт», 5.12 шаг 2). Условие: app_settings.auto_reprice = true и курс валюты
// изменился на ≥ reprice_threshold % относительно курса на дату price_updated_at товара (курс, по которому считалась цена).
// Для валюты, где порог достигнут хотя бы у одного auto-товара, пересчитываются все auto-товары этой валюты (общий recalc.ts).
// Идемпотентно: повторный запуск ничего не меняет — recalc обновляет price_updated_at и у товаров, чья цена не изменилась,
// а товары, которые пересчёт всё равно пропустит (цена ателье выше новой розничной, BR-09; цена вне integer), в проверке
// порога не участвуют: их price_updated_at не обновляется, и без исключения пересчёт запускался бы каждый день.
// RUB-товары от курса не зависят.

export interface RepriceSettings { auto_reprice: boolean; reprice_threshold: number }

export interface AutoRepriceOutcome {
  enabled: boolean;
  /** Валюты, у которых порог достигнут. */
  currencies: Array<"USD" | "CNY">;
  repriced_products: number;
  skipped_products: number;
}

/** Сдвиг курса в %, округлён до 6 знаков: 83.56 → 85.2312 ровно 2 %, а не 1.9999999… из-за float. */
const shiftPercent = (latest: number, base: number): number => Math.round((Math.abs(latest - base) / base) * 100 * 1e6) / 1e6;

const CURRENCIES = ["USD", "CNY"] as const;

export async function autoRepriceAfterRates(repo: AdminProductsRepo, settings: RepriceSettings, now: Date): Promise<AutoRepriceOutcome> {
  const none: AutoRepriceOutcome = { enabled: settings.auto_reprice, currencies: [], repriced_products: 0, skipped_products: 0 };
  if (!settings.auto_reprice) return none;

  const products = await repo.listAutoPriced();
  const triggered: Array<"USD" | "CNY"> = [];
  let pricing: PricingSettings | null = null;
  for (const currency of CURRENCIES) {
    const ofCurrency = products.filter((p) => p.purchase_currency === currency);
    if (ofCurrency.length === 0) continue;
    const latest = await repo.latestRate(currency);
    if (latest === null) continue; // курса нет — цены не трогаем (5.9.4 Fallback)
    pricing ??= await repo.pricingSettings();
    const s = pricing;
    const mine = ofCurrency.filter((p) => skipReason(p, priceWith(p.purchase_cost, currency, latest.rate, s)) === null);
    const baseByDate = new Map<string, number | null>();
    let hit = false;
    for (const p of mine) {
      const date = p.price_updated_at.slice(0, 10);
      if (!baseByDate.has(date)) baseByDate.set(date, (await repo.rateOnOrBefore(currency, date))?.rate ?? null);
      const base = baseByDate.get(date) ?? null;
      // Нет курса на дату расчёта цены (цена старше всех курсов) — опорной точки нет, пересчитываем.
      if (base === null || base <= 0 || shiftPercent(latest.rate, base) >= settings.reprice_threshold) { hit = true; break; }
    }
    if (hit) triggered.push(currency);
  }
  if (triggered.length === 0) return none;

  const result = await recalculateAutoPrices(repo, { dryRun: false, now, products, currencies: new Set<PurchaseCurrency>(triggered) });
  if (result.kind === "rate_not_loaded") throw new Error(`auto reprice: курс ${result.currency} не загружен`);
  return { enabled: true, currencies: triggered, repriced_products: result.data.changes.length, skipped_products: result.data.skipped.length };
}
