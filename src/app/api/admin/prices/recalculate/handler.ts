import { apiError } from "@/lib/api-error";
import { formatRub } from "@/lib/money";
import type { AdminProductsDeps } from "@/lib/admin/products/deps";
import { priceWith, rateFor } from "@/lib/admin/products/auto-price";
import { okJson, readJson, runAdmin, zodError } from "@/lib/admin/products/http";
import type { AutoPriceRow } from "@/lib/admin/products/rows";
import { pricesRecalculateBody } from "@/lib/schemas/admin-products";

// POST /api/admin/prices/recalculate (Блок 3; 5.4): пересчёт всех pricing_mode = 'auto' товаров по последнему курсу
// той же computeAutoPrice. dry_run — только показать изменения. Применение обновляет price и price_updated_at
// только у auto-товаров, у которых цена изменилась (manual не трогается — условие pricing_mode = 'auto' в update).
// Нужен курс только тех валют, в которых есть auto-товары; RUB — курс 1.
//
// Дополнительно к JSON Чертежа: old_price/new_price в копейках (3.0) и `skipped` — товары, которые нельзя
// перевести на новую цену: цена ателье выше новой розничной (BR-09, CHECK 2.4), цена вне integer, либо запись
// изменили во время пересчёта.

interface Change {
  product_id: string; title: string;
  old_price: number; old_price_formatted: string; new_price: number; new_price_formatted: string;
}
interface Skipped { product_id: string; title: string; reason: string }

const SKIP_ATELIER = "Цена ателье выше новой розничной цены";
const SKIP_TOO_LARGE = "Цена получается больше допустимой";
const SKIP_RACE = "Товар изменили во время пересчёта";

const change = (p: AutoPriceRow, newPrice: number): Change => ({
  product_id: p.id, title: p.title,
  old_price: p.price, old_price_formatted: formatRub(p.price), new_price: newPrice, new_price_formatted: formatRub(newPrice),
});

async function recalculate(request: Request, deps: AdminProductsDeps): Promise<Response> {
  const denied = await deps.requireAdmin(request);
  if (denied) return denied;
  const parsed = pricesRecalculateBody.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);
  const { dry_run } = parsed.data;

  const repo = await deps.repo();
  const products = await repo.listAutoPriced();
  const rates = new Map<string, number>();
  for (const currency of ["USD", "CNY", "RUB"] as const) {
    if (!products.some((p) => p.purchase_currency === currency)) continue;
    const rate = await rateFor(repo, currency);
    if (rate === null) return apiError("RATE_NOT_LOADED", `Курс ${currency} не загружен`, 422);
    rates.set(currency, rate);
  }
  if (products.length === 0) return okJson({ dry_run, changes: [], unchanged: 0, skipped: [] });
  const settings = await repo.pricingSettings();

  const candidates: Array<{ p: AutoPriceRow; price: number }> = [];
  const skipped: Skipped[] = [];
  let unchanged = 0;
  for (const p of products) {
    const r = priceWith(p.purchase_cost, p.purchase_currency, rates.get(p.purchase_currency) as number, settings);
    if (!r.ok) skipped.push({ product_id: p.id, title: p.title, reason: SKIP_TOO_LARGE });
    else if (r.price === p.price) unchanged++;
    else if (p.price_atelier !== null && p.price_atelier > r.price) skipped.push({ product_id: p.id, title: p.title, reason: SKIP_ATELIER });
    else candidates.push({ p, price: r.price });
  }

  if (dry_run) return okJson({ dry_run, changes: candidates.map((c) => change(c.p, c.price)), unchanged, skipped });

  const at = deps.now().toISOString();
  const changes: Change[] = [];
  for (const c of candidates) {
    if (await repo.updateAutoPrice(c.p.id, c.p.price, c.price, at)) changes.push(change(c.p, c.price));
    else skipped.push({ product_id: c.p.id, title: c.p.title, reason: SKIP_RACE });
  }
  return okJson({ dry_run, changes, unchanged, skipped });
}

export function createRecalculateHandler(deps: AdminProductsDeps) {
  return { POST: (request: Request) => runAdmin("admin.prices.recalculate", () => recalculate(request, deps)) };
}
