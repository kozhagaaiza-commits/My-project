import { FEATURE_ATELIER, MOSCOW_DELIVERY_DAYS, REGION_DELIVERY_DAYS } from "@/lib/config";
import { formatRub } from "@/lib/money";
import type { Availability, CatalogContext, Construction, ProductImage, SeatType } from "@/types/catalog";
import type { ListProductRow, ProductRow, PublicProductRow, VehicleRow } from "@/lib/catalog/rows";

// Чистые функции каталога (Чертёж, Блок 3 «Каталог», US-002, BR-10/BR-13/BR-20).
// Без обращений к БД и env — тестируются node:test.

export const PUBLIC_PRODUCT_COLUMNS =
  "id,type,slug,sku,title,manufacturer,description,status,availability_mode,stock_qty," +
  "lead_time_min_days,lead_time_max_days,price,price_atelier,diameter_in,width_front_in,width_rear_in," +
  "et_front_mm,et_rear_mm,pcd,center_bore_mm,seat_type,includes_hub_rings,includes_fasteners," +
  "construction,finish,weight_kg,warranty_months,certifications,claims_verified,created_at";
// purchase_cost, purchase_currency, pricing_mode НЕ входят в список никогда.
// price_atelier удаляется из ответа функцией toPublicProduct(), если ctx.atelierId === null.
// certifications заменяются на [], если claims_verified === false.

/** Список каталога: те же публичные колонки без description (карточка остаётся на PUBLIC_PRODUCT_COLUMNS). */
export const LIST_PRODUCT_COLUMNS = PUBLIC_PRODUCT_COLUMNS.replace(",description,", ",");

// «Конус 60°» и «Кованый моноблок» — из Чертежа; остальные подписи заданы backend-engineer.
export const SEAT_TYPE_LABELS: Record<SeatType, string> = {
  cone60: "Конус 60°",
  ball_r13: "Сфера R13",
  ball_r14: "Сфера R14",
  flat: "Плоская",
};

export const CONSTRUCTION_LABELS: Record<Construction, string> = {
  cast: "Литой",
  flow_formed: "Flow forming",
  forged_monoblock: "Кованый моноблок",
  forged_2pc: "Кованый составной (2 части)",
  forged_3pc: "Кованый составной (3 части)",
};

/**
 * Явно перечисляет публичные поля (а не spread): закупочные поля не попадут дальше,
 * даже если строка пришла с лишними колонками. price_atelier → null без одобренного ателье
 * или при FEATURE_ATELIER = false (BR-10, BR-20); certifications → [] без claims_verified (BR-13).
 */
export function toPublicProduct(row: ProductRow, ctx: CatalogContext, featureAtelier?: boolean): ProductRow;
export function toPublicProduct(row: ListProductRow, ctx: CatalogContext, featureAtelier?: boolean): ListProductRow;
export function toPublicProduct(
  row: ListProductRow & { description?: string }, ctx: CatalogContext, featureAtelier: boolean = FEATURE_ATELIER,
): ListProductRow & { description?: string } {
  const showAtelier = featureAtelier && ctx.atelierId !== null;
  const pub: ListProductRow = {
    id: row.id, type: row.type, slug: row.slug, sku: row.sku, title: row.title,
    manufacturer: row.manufacturer, status: row.status,
    availability_mode: row.availability_mode, stock_qty: row.stock_qty,
    lead_time_min_days: row.lead_time_min_days, lead_time_max_days: row.lead_time_max_days,
    price: row.price, price_atelier: showAtelier ? row.price_atelier : null,
    diameter_in: row.diameter_in, width_front_in: row.width_front_in, width_rear_in: row.width_rear_in,
    et_front_mm: row.et_front_mm, et_rear_mm: row.et_rear_mm, pcd: row.pcd,
    center_bore_mm: row.center_bore_mm, seat_type: row.seat_type,
    includes_hub_rings: row.includes_hub_rings, includes_fasteners: row.includes_fasteners,
    construction: row.construction, finish: row.finish, weight_kg: row.weight_kg,
    warranty_months: row.warranty_months,
    certifications: row.claims_verified ? [...row.certifications] : [],
    claims_verified: row.claims_verified, created_at: row.created_at,
  };
  return typeof row.description === "string" ? { ...pub, description: row.description } : pub;
}

export const formatPrice = (kopecks: number | null): string | null => (kopecks === null ? null : formatRub(kopecks));

/** 8.5 → «8.5», 8 → «8», 66.6 → «66.6» (без лишнего «.0»). */
export const formatDecimal = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** «5x112» → «5×112». */
export const formatPcd = (pcd: string) => pcd.replace("x", "×");

const pair = (front: string, rear: string | null) => (rear === null || rear === front ? front : `${front}/${rear}`);

/** «R20 · 8.5J/9.5J · 5×112 · ET 30/40 · ЦО 66.6»; для карбона (нет дисковых полей) — null. */
export function buildSpecsShort(p: Pick<PublicProductRow,
  "type" | "diameter_in" | "width_front_in" | "width_rear_in" | "et_front_mm" | "et_rear_mm" | "pcd" | "center_bore_mm">): string | null {
  if (p.type !== "wheel_set" || p.diameter_in === null || p.width_front_in === null || p.et_front_mm === null
    || p.pcd === null || p.center_bore_mm === null) return null;
  const width = pair(`${formatDecimal(p.width_front_in)}J`, p.width_rear_in === null ? null : `${formatDecimal(p.width_rear_in)}J`);
  const et = pair(String(p.et_front_mm), p.et_rear_mm === null ? null : String(p.et_rear_mm));
  return `R${p.diameter_in} · ${width} · ${formatPcd(p.pcd)} · ET ${et} · ЦО ${formatDecimal(p.center_bore_mm)}`;
}

export const STOCK_DELIVERY_TEXT =
  `Москва — ${MOSCOW_DELIVERY_DAYS.min}–${MOSCOW_DELIVERY_DAYS.max} дня, ` +
  `регионы — ${REGION_DELIVERY_DAYS.min}–${REGION_DELIVERY_DAYS.max} рабочих дней`;

/**
 * US-002. available_qty = max(stock_qty − брони, 0). lead_time: объект для preorder, null для stock
 * (в списке ключ lead_time для stock убирается — см. availabilityForList).
 */
export function buildAvailability(
  p: Pick<PublicProductRow, "availability_mode" | "stock_qty" | "lead_time_min_days" | "lead_time_max_days">,
  reservedQty: number,
): Availability {
  if (p.availability_mode === "preorder") {
    const lead = p.lead_time_min_days !== null && p.lead_time_max_days !== null
      ? { min_days: p.lead_time_min_days, max_days: p.lead_time_max_days } : null;
    return {
      mode: "preorder", available_qty: null, status: "preorder", label: "Под заказ",
      delivery_text: lead ? `Срок поставки ${lead.min_days}–${lead.max_days} дней · 100% предоплата` : null,
      lead_time: lead,
    };
  }
  const available = Math.max(p.stock_qty - reservedQty, 0);
  return available > 0
    ? { mode: "stock", available_qty: available, status: "in_stock", label: "В наличии в Москве", delivery_text: STOCK_DELIVERY_TEXT, lead_time: null }
    : { mode: "stock", available_qty: 0, status: "out_of_stock", label: "Нет в наличии", delivery_text: null, lead_time: null };
}

/** JSON списка в Чертеже не содержит lead_time для stock; для preorder он нужен UI («Под заказ · 21–35 дней»). */
export function availabilityForList(a: Availability): Availability {
  if (a.lead_time) return a;
  return { mode: a.mode, available_qty: a.available_qty, status: a.status, label: a.label, delivery_text: a.delivery_text };
}

export const soldAs = (type: PublicProductRow["type"]) => (type === "wheel_set" ? "Комплект из 4 дисков" : "1 шт.");

export const publicImageUrl = (supabaseUrl: string, storagePath: string) =>
  `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/product-images/${storagePath}`;

export function toProductImage(supabaseUrl: string, img: { storage_path: string; alt: string }, fallbackAlt: string): ProductImage {
  return { url: publicImageUrl(supabaseUrl, img.storage_path), alt: img.alt.trim() || fallbackAlt };
}

/** «BMW 5 Series G30 · 2017–2023»; без year_to — «BMW M4 G82 · 2021–н.в.». */
export const vehicleLabel = (v: Pick<VehicleRow, "make" | "model" | "generation" | "year_from" | "year_to">) =>
  `${v.make} ${v.model} ${v.generation} · ${v.year_from}–${v.year_to ?? "н.в."}`;

/**
 * Крепёж для блока совместимости диска: «Используйте штатные болты BMW M14×1.25 (конус 60°)».
 * Свой крепёж в комплекте → «Крепёж в комплекте». Не подходит или карбон → null.
 */
export function buildFastenerNote(
  p: Pick<PublicProductRow, "type" | "includes_fasteners">,
  v: Pick<VehicleRow, "make" | "fastener_spec" | "seat_type">,
  fits: boolean,
): string | null {
  if (p.type !== "wheel_set") return null;
  if (p.includes_fasteners) return "Крепёж в комплекте";
  if (!fits) return null;
  const spec = v.fastener_spec.replace(/^Болт\s+/i, "");
  const seat = SEAT_TYPE_LABELS[v.seat_type];
  return `Используйте штатные болты ${v.make} ${spec} (${seat.charAt(0).toLowerCase()}${seat.slice(1)})`;
}
