import { z } from "zod";

// Строки БД админки товаров (Блок 2: products, product_images, product_vehicles, exchange_rates, app_settings).
// Явные списки колонок для каждого запроса PostgREST; ответы проверяются Zod (сгенерированных типов пока нет).
// Закупочные поля здесь читаются намеренно: это админский API (RLS products_select_admin → is_admin()).

/** numeric из PostgREST: число; на случай строки — аккуратное приведение (null не превращается в 0). */
export const num = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]);
const productType = z.enum(["wheel_set", "carbon_part"]);
const productStatus = z.enum(["draft", "active", "archived"]);
const availabilityMode = z.enum(["stock", "preorder"]);
const currency = z.enum(["USD", "CNY", "RUB"]);
const pricingMode = z.enum(["auto", "manual"]);

export const ADMIN_LIST_COLUMNS =
  "id,type,slug,sku,title,status,availability_mode,stock_qty,purchase_currency,purchase_cost,pricing_mode," +
  "price,price_atelier,updated_at";

export const adminListRow = z.object({
  id: z.string(),
  type: productType,
  slug: z.string(),
  sku: z.string(),
  title: z.string(),
  status: productStatus,
  availability_mode: availabilityMode,
  stock_qty: z.number().int(),
  purchase_currency: currency,
  purchase_cost: z.number().int(),
  pricing_mode: pricingMode,
  price: z.number().int(),
  price_atelier: z.number().int().nullable(),
  updated_at: z.string(),
});
export type AdminListRow = z.infer<typeof adminListRow>;

export const ADMIN_PRODUCT_COLUMNS =
  "id,type,slug,sku,title,manufacturer,description,status,availability_mode,stock_qty,lead_time_min_days," +
  "lead_time_max_days,purchase_currency,purchase_cost,pricing_mode,price,price_atelier,price_updated_at," +
  "diameter_in,width_front_in,width_rear_in,et_front_mm,et_rear_mm,pcd,center_bore_mm,seat_type," +
  "includes_hub_rings,includes_fasteners,construction,finish,weight_kg,warranty_months,certifications," +
  "claims_verified,created_at,updated_at";

export const adminProductRow = adminListRow.extend({
  manufacturer: z.string(),
  description: z.string(),
  lead_time_min_days: z.number().int().nullable(),
  lead_time_max_days: z.number().int().nullable(),
  price_updated_at: z.string(),
  diameter_in: z.number().int().nullable(),
  width_front_in: num.nullable(),
  width_rear_in: num.nullable(),
  et_front_mm: z.number().int().nullable(),
  et_rear_mm: z.number().int().nullable(),
  pcd: z.string().nullable(),
  center_bore_mm: num.nullable(),
  seat_type: z.enum(["cone60", "ball_r13", "ball_r14", "flat"]).nullable(),
  includes_hub_rings: z.boolean(),
  includes_fasteners: z.boolean(),
  construction: z.enum(["cast", "flow_formed", "forged_monoblock", "forged_2pc", "forged_3pc"]).nullable(),
  finish: z.string().nullable(),
  weight_kg: num.nullable(),
  warranty_months: z.number().int(),
  certifications: z.array(z.string()),
  claims_verified: z.boolean(),
  created_at: z.string(),
});
export type AdminProductRow = z.infer<typeof adminProductRow>;

/** Колонки, которые возвращает insert/update: достаточно для ответа и следующей блокировки. */
export const PRODUCT_WRITE_RETURN_COLUMNS = "id,slug,status,price,price_updated_at,updated_at";
export const productWriteRow = z.object({
  id: z.string(),
  slug: z.string(),
  status: productStatus,
  price: z.number().int(),
  price_updated_at: z.string(),
  updated_at: z.string(),
});
export type ProductWriteRow = z.infer<typeof productWriteRow>;

export const IMAGE_COLUMNS = "id,product_id,storage_path,alt,sort_order";
export const imageRow = z.object({
  id: z.string(),
  product_id: z.string(),
  storage_path: z.string(),
  alt: z.string(),
  sort_order: z.number().int(),
});
export type AdminImageRow = z.infer<typeof imageRow>;

/** Автопересчёт: только поля, нужные для расчёта и отчёта. */
export const AUTO_PRICE_COLUMNS = "id,title,purchase_currency,purchase_cost,price,price_atelier,price_updated_at";
export const autoPriceRow = z.object({
  id: z.string(),
  title: z.string(),
  purchase_currency: currency,
  purchase_cost: z.number().int(),
  price: z.number().int(),
  price_atelier: z.number().int().nullable(),
  price_updated_at: z.string(),
});
export type AutoPriceRow = z.infer<typeof autoPriceRow>;

export const RATE_COLUMNS = "currency,rate,rate_date";
export const rateRow = z.object({ currency: z.enum(["USD", "CNY"]), rate: num, rate_date: z.string() });
export type RateRow = z.infer<typeof rateRow>;

export const PRICING_SETTINGS_COLUMNS = "markup_multiplier,price_rounding_rub";
export const pricingSettingsRow = z.object({ markup_multiplier: num, price_rounding_rub: z.number().int() });
export type PricingSettings = z.infer<typeof pricingSettingsRow>;

export const idRow = z.object({ id: z.string() });
export const slugRow = z.object({ slug: z.string() });
export const vehicleLinkRow = z.object({ vehicle_id: z.string() });
export const reservedRow = z.object({ product_id: z.string(), reserved: z.number().int() });
export const productStatusRow = z.object({ id: z.string(), type: productType, status: productStatus });
export type ProductStatusRow = z.infer<typeof productStatusRow>;
