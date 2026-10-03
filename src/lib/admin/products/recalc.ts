import { formatRub } from "@/lib/money";
import type { PurchaseCurrency } from "@/lib/pricing";
import { priceWith, rateFor } from "./auto-price";
import type { AdminProductsRepo } from "./repo";
import type { AutoPriceRow } from "./rows";

// Пересчёт pricing_mode = 'auto' товаров по последнему курсу (Блок 3 POST /api/admin/prices/recalculate; 5.4; 5.12 шаг 2).
// Общий код для админского эндпоинта и cron: одна computeAutoPrice, одно правило пропусков. Применение обновляет price и
// price_updated_at у auto-товаров с изменившейся ценой, а у unchanged — только price_updated_at (цена актуальна на этот
// курс: иначе автопересчёт сравнивал бы курс со старой датой и срабатывал каждый день). manual не трогается —
// условие pricing_mode = 'auto' в update. skipped не трогаются (их исключает проверка порога в auto-reprice.ts).
// Нужен курс только тех валют, в которых есть auto-товары; RUB — курс 1.
//
// Дополнительно к JSON Чертежа: old_price/new_price в копейках (3.0) и `skipped` — товары, которые нельзя
// перевести на новую цену: цена ателье выше новой розничной (BR-09, CHECK 2.4), цена вне integer, либо запись
// изменили во время пересчёта.

export interface PriceChange {
  product_id: string; title: string;
  old_price: number; old_price_formatted: string; new_price: number; new_price_formatted: string;
}
export interface PriceSkipped { product_id: string; title: string; reason: string }
export interface RecalcData { dry_run: boolean; changes: PriceChange[]; unchanged: number; skipped: PriceSkipped[] }

export type RecalcResult =
  | { kind: "rate_not_loaded"; currency: string }
  | { kind: "ok"; data: RecalcData };

export const SKIP_ATELIER = "Цена ателье выше новой розничной цены";
export const SKIP_TOO_LARGE = "Цена получается больше допустимой";
export const SKIP_RACE = "Товар изменили во время пересчёта";

/** Причина пропуска товара при цене r по новому курсу (null — товар можно перевести на r или цена не меняется). */
export function skipReason(p: Pick<AutoPriceRow, "price" | "price_atelier">, r: ReturnType<typeof priceWith>): string | null {
  if (!r.ok) return SKIP_TOO_LARGE;
  if (r.price !== p.price && p.price_atelier !== null && p.price_atelier > r.price) return SKIP_ATELIER;
  return null;
}

const change = (p: AutoPriceRow, newPrice: number): PriceChange => ({
  product_id: p.id, title: p.title,
  old_price: p.price, old_price_formatted: formatRub(p.price), new_price: newPrice, new_price_formatted: formatRub(newPrice),
});

export interface RecalcOptions {
  dryRun: boolean;
  now: Date;
  /** Заранее прочитанный список auto-товаров (cron уже читал его для проверки порога); иначе читается здесь. */
  products?: AutoPriceRow[];
  /** Пересчитать только товары этих валют (cron: валюты, у которых курс сдвинулся ≥ порога); по умолчанию все. */
  currencies?: ReadonlySet<PurchaseCurrency>;
}

export async function recalculateAutoPrices(repo: AdminProductsRepo, opts: RecalcOptions): Promise<RecalcResult> {
  const all = opts.products ?? await repo.listAutoPriced();
  const products = opts.currencies ? all.filter((p) => opts.currencies?.has(p.purchase_currency)) : all;
  const rates = new Map<string, number>();
  for (const currency of ["USD", "CNY", "RUB"] as const) {
    if (!products.some((p) => p.purchase_currency === currency)) continue;
    const rate = await rateFor(repo, currency);
    if (rate === null) return { kind: "rate_not_loaded", currency };
    rates.set(currency, rate);
  }
  if (products.length === 0) return { kind: "ok", data: { dry_run: opts.dryRun, changes: [], unchanged: 0, skipped: [] } };
  const settings = await repo.pricingSettings();

  const candidates: Array<{ p: AutoPriceRow; price: number }> = [];
  const skipped: PriceSkipped[] = [];
  const unchangedIds: string[] = [];
  for (const p of products) {
    const r = priceWith(p.purchase_cost, p.purchase_currency, rates.get(p.purchase_currency) as number, settings);
    const reason = skipReason(p, r);
    if (reason !== null || !r.ok) skipped.push({ product_id: p.id, title: p.title, reason: reason ?? SKIP_TOO_LARGE });
    else if (r.price === p.price) unchangedIds.push(p.id);
    else candidates.push({ p, price: r.price });
  }
  const unchanged = unchangedIds.length;

  if (opts.dryRun) return { kind: "ok", data: { dry_run: true, changes: candidates.map((c) => change(c.p, c.price)), unchanged, skipped } };

  const at = opts.now.toISOString();
  const changes: PriceChange[] = [];
  for (const c of candidates) {
    if (await repo.updateAutoPrice(c.p.id, c.p.price, c.price, at)) changes.push(change(c.p, c.price));
    else skipped.push({ product_id: c.p.id, title: c.p.title, reason: SKIP_RACE });
  }
  await repo.touchAutoPrices(unchangedIds, at);
  return { kind: "ok", data: { dry_run: false, changes, unchanged, skipped } };
}
