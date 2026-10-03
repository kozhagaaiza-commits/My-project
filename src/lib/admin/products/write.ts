import { apiError } from "@/lib/api-error";
import type { ProductUpsertBody } from "@/lib/schemas/admin-products";
import { PRICE_TOO_LARGE_MESSAGE, rateNotLoadedMessage, type AutoPriceResult } from "./auto-price";
import { fieldError } from "./http";
import type { AdminProductsRepo, ProductColumns } from "./repo";
import { SLUG_TAKEN_MESSAGE, productUniqueViolation, skuTakenMessage, suggestSlug } from "./slug";
import { wheelColumns } from "./format";

// Общие шаги POST и PATCH /api/admin/products*: колонки, проверки сервера поверх Zod, ответы ошибок Блока 3.

export const PRODUCT_NOT_FOUND = "Товар не найден";
export const PHOTO_REQUIRED = "Добавьте хотя бы одно фото";
export const CARBON_ONLY = "Совместимость задаётся только для карбона. Для дисков она рассчитывается по параметрам";
export const PRODUCT_CONFLICT = "Товар изменили в другой вкладке. Обновите страницу";
/** Текстов нет в Чертеже — короткие формулировки для полей формы. */
export const VEHICLE_UNKNOWN = "Автомобиль не найден в справочнике";
export const TYPE_IMMUTABLE = "Тип товара не меняется";
export const ATELIER_ABOVE_RETAIL = "Цена ателье не может быть выше розничной";

export const productNotFound = () => apiError("NOT_FOUND", PRODUCT_NOT_FOUND, 404);

/** BR-14 (Блок 3, PATCH 400): публикация без фото. */
export const photoRequired = () => apiError("VALIDATION_ERROR", PHOTO_REQUIRED, 400, { fields: { images: [PHOTO_REQUIRED] } });

export const productConflict = () => apiError("CONFLICT", PRODUCT_CONFLICT, 409);

/** Ответ на неудачный расчёт автоцены: 422 RATE_NOT_LOADED или 400 по полю закупки. */
export function autoPriceFailure(r: Exclude<AutoPriceResult, { ok: true }>): Response {
  if (r.reason === "rate_not_loaded") return apiError("RATE_NOT_LOADED", rateNotLoadedMessage(r.currency), 422);
  return fieldError({ purchase_cost: [PRICE_TOO_LARGE_MESSAGE] });
}

/** Все колонки products из проверенного тела (цена уже определена сервером). */
export function productColumns(b: ProductUpsertBody, price: number, priceUpdatedAt: string): ProductColumns {
  return {
    type: b.type, slug: b.slug, sku: b.sku, title: b.title, manufacturer: b.manufacturer, description: b.description,
    status: b.status, availability_mode: b.availability_mode, stock_qty: b.stock_qty,
    lead_time_min_days: b.lead_time_min_days, lead_time_max_days: b.lead_time_max_days,
    purchase_currency: b.purchase_currency, purchase_cost: b.purchase_cost, pricing_mode: b.pricing_mode,
    price, price_atelier: b.price_atelier, price_updated_at: priceUpdatedAt,
    ...wheelColumns(b.type, b.wheel),
    warranty_months: b.warranty_months, certifications: b.certifications, claims_verified: b.claims_verified,
  };
}

/** Колонки, значения которых отличаются (массивы сравниваются по содержимому). price_updated_at не сравнивается. */
export function changedColumns(next: ProductColumns, cur: ProductColumns): Partial<ProductColumns> {
  const out: Partial<Record<keyof ProductColumns, unknown>> = {};
  for (const key of Object.keys(next) as Array<keyof ProductColumns>) {
    if (key === "price_updated_at") continue;
    if (JSON.stringify(next[key]) !== JSON.stringify(cur[key])) out[key] = next[key];
  }
  return out as Partial<ProductColumns>;
}

/** Уникальные id в порядке первого появления. */
export const uniqueIds = (ids: string[]) => [...new Set(ids.map((s) => s.toLowerCase()))];

/** Все ли автомобили есть в справочнике; иначе готовый 400 по полю. */
export async function checkVehicles(repo: AdminProductsRepo, ids: string[], field: string): Promise<Response | null> {
  if (ids.length === 0) return null;
  const found = new Set((await repo.existingVehicleIds(ids)).map((s) => s.toLowerCase()));
  const missing = ids.filter((id) => !found.has(id));
  return missing.length === 0 ? null : fieldError({ [field]: [VEHICLE_UNKNOWN] });
}

/** 23505 slug/sku → 409 SLUG_TAKEN (с suggestion) / SKU_TAKEN; иначе null (исключение пробрасывает вызывающий). */
export async function uniqueViolationResponse(err: unknown, repo: AdminProductsRepo, slug: string, sku: string): Promise<Response | null> {
  const which = productUniqueViolation(err);
  if (which === "slug") {
    return apiError("SLUG_TAKEN", SLUG_TAKEN_MESSAGE, 409, { suggestion: suggestSlug(slug, await repo.takenSlugs(slug)) });
  }
  if (which === "sku") return apiError("SKU_TAKEN", skuTakenMessage(sku), 409);
  return null;
}
