import { publicImageUrl } from "@/lib/catalog";
import { formatRub } from "@/lib/money";
import type { ProductUpsertBody } from "@/lib/schemas/admin-products";
import type { ProductColumns } from "./repo";
import type { AdminImageRow, AdminListRow, AdminProductRow } from "./rows";
import { dbTimestamp } from "./timestamps";

// Ответы админки товаров (Блок 3 «Админка — товары»). Деньги — копейки + *_formatted (3.0).
// Админский API: purchase_cost / purchase_currency / pricing_mode / price_atelier отдаются намеренно.

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const cny = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Закупка в минимальных единицах: USD 80000 → «$800.00» (пример Блока 3); CNY → «¥5,600.00»; RUB → formatRub. */
export function formatPurchaseCost(minor: number, currency: "USD" | "CNY" | "RUB"): string {
  if (currency === "RUB") return formatRub(minor);
  if (currency === "USD") return usd.format(minor / 100);
  return `¥${cny.format(minor / 100)}`;
}

const formatOptionalRub = (k: number | null) => (k === null ? null : formatRub(k));

/** Элемент GET /api/admin/products + slug и cover_url (нужны «Открыть на сайте» и миниатюре 48×48, Блок 4). */
export function toAdminListItem(r: AdminListRow, reserved: number, images: AdminImageRow[], supabaseUrl: string) {
  const sorted = [...images].sort((a, b) => a.sort_order - b.sort_order);
  return {
    id: r.id, type: r.type, sku: r.sku, slug: r.slug,
    title: r.title, status: r.status,
    availability_mode: r.availability_mode, stock_qty: r.stock_qty, reserved_qty: reserved,
    available_qty: Math.max(r.stock_qty - reserved, 0),
    purchase_currency: r.purchase_currency, purchase_cost: r.purchase_cost,
    purchase_cost_formatted: formatPurchaseCost(r.purchase_cost, r.purchase_currency),
    pricing_mode: r.pricing_mode, price: r.price, price_formatted: formatRub(r.price),
    price_atelier: r.price_atelier, price_atelier_formatted: formatOptionalRub(r.price_atelier),
    images_count: images.length,
    cover_url: sorted[0] ? publicImageUrl(supabaseUrl, sorted[0].storage_path) : null,
    updated_at: dbTimestamp(r.updated_at),
  };
}

/** Параметры диска строки БД → объект `wheel` тела productUpsertBody (null для карбона). */
export function wheelOf(p: AdminProductRow): ProductUpsertBody["wheel"] {
  if (p.type !== "wheel_set" || p.diameter_in === null || p.width_front_in === null || p.et_front_mm === null
    || p.pcd === null || p.center_bore_mm === null || p.seat_type === null || p.construction === null) return null;
  return {
    diameter_in: p.diameter_in, width_front_in: p.width_front_in, width_rear_in: p.width_rear_in,
    et_front_mm: p.et_front_mm, et_rear_mm: p.et_rear_mm, pcd: p.pcd, center_bore_mm: p.center_bore_mm,
    seat_type: p.seat_type, includes_hub_rings: p.includes_hub_rings, includes_fasteners: p.includes_fasteners,
    construction: p.construction, finish: p.finish, weight_kg: p.weight_kg,
  };
}

/**
 * Строка БД → форма тела productUpsertBody (для GET и для проверки PATCH поверх текущей записи).
 * certifications из БД не сужаются здесь: неизвестное значение отклонит productUpsertBody при PATCH.
 */
export function toUpsertShape(p: AdminProductRow, vehicleIds: string[]) {
  return {
    type: p.type, slug: p.slug, sku: p.sku, title: p.title, manufacturer: p.manufacturer, description: p.description,
    status: p.status, availability_mode: p.availability_mode, stock_qty: p.stock_qty,
    lead_time_min_days: p.lead_time_min_days, lead_time_max_days: p.lead_time_max_days,
    purchase_currency: p.purchase_currency, purchase_cost: p.purchase_cost, pricing_mode: p.pricing_mode,
    price: p.price as number | null, price_atelier: p.price_atelier, wheel: wheelOf(p),
    warranty_months: p.warranty_months, certifications: p.certifications, claims_verified: p.claims_verified,
    compatible_vehicle_ids: vehicleIds,
  };
}

export const toAdminImage = (img: AdminImageRow, supabaseUrl: string) => ({
  id: img.id, url: publicImageUrl(supabaseUrl, img.storage_path), alt: img.alt, sort_order: img.sort_order,
});

/** GET /api/admin/products/[id]: тело POST + id, price, price_updated_at, reserved/available, images, даты. */
export function toAdminDetail(
  p: AdminProductRow, vehicleIds: string[], images: AdminImageRow[], reserved: number, supabaseUrl: string,
) {
  return {
    id: p.id,
    ...toUpsertShape(p, vehicleIds),
    price: p.price,
    price_formatted: formatRub(p.price),
    price_atelier_formatted: formatOptionalRub(p.price_atelier),
    purchase_cost_formatted: formatPurchaseCost(p.purchase_cost, p.purchase_currency),
    price_updated_at: dbTimestamp(p.price_updated_at),
    reserved_qty: reserved,
    available_qty: Math.max(p.stock_qty - reserved, 0),
    images: [...images].sort((a, b) => a.sort_order - b.sort_order).map((i) => toAdminImage(i, supabaseUrl)),
    created_at: dbTimestamp(p.created_at),
    updated_at: dbTimestamp(p.updated_at),
  };
}

/** Колонки диска из `wheel` (для carbon_part — все NULL и false: chk_carbon_fields, 2.4). */
export function wheelColumns(type: ProductColumns["type"], wheel: ProductUpsertBody["wheel"]) {
  const w = type === "wheel_set" ? wheel : null;
  return {
    diameter_in: w?.diameter_in ?? null, width_front_in: w?.width_front_in ?? null, width_rear_in: w?.width_rear_in ?? null,
    et_front_mm: w?.et_front_mm ?? null, et_rear_mm: w?.et_rear_mm ?? null, pcd: w?.pcd ?? null,
    center_bore_mm: w?.center_bore_mm ?? null, seat_type: w?.seat_type ?? null,
    includes_hub_rings: w?.includes_hub_rings ?? false, includes_fasteners: w?.includes_fasteners ?? false,
    construction: w?.construction ?? null, finish: w?.finish ?? null, weight_kg: w?.weight_kg ?? null,
  };
}
