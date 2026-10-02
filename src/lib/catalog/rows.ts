import { z } from "zod";

// Zod-схемы строк БД каталога (Блок 2: vehicles, products, product_images, product_vehicles, order_items).
// Сгенерированных типов (src/types/database.ts) пока нет, поэтому ответы PostgREST проверяются здесь.
// z.object отбрасывает неизвестные ключи — закупочные поля не пройдут дальше, даже если попадут в select.

/** numeric приходит из PostgREST числом; на случай строки — аккуратное приведение (не coerce: null → 0). */
const num = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]);
const seatType = z.enum(["cone60", "ball_r13", "ball_r14", "flat"]);
const construction = z.enum(["cast", "flow_formed", "forged_monoblock", "forged_2pc", "forged_3pc"]);

export const VEHICLE_OPTION_COLUMNS = "id,make,model,generation,year_from,year_to";
export const VEHICLE_COLUMNS =
  "id,make,model,generation,year_from,year_to,pcd,center_bore_mm,seat_type,fastener_spec," +
  "diameter_min_in,diameter_max_in,width_min_in,width_max_in,et_min_mm,et_max_mm";

export const vehicleOptionRow = z.object({
  id: z.string(),
  make: z.string(),
  model: z.string(),
  generation: z.string(),
  year_from: z.number().int(),
  year_to: z.number().int().nullable(),
});
export type VehicleOptionRow = z.infer<typeof vehicleOptionRow>;

export const vehicleRow = vehicleOptionRow.extend({
  pcd: z.string(),
  center_bore_mm: num,
  seat_type: seatType,
  fastener_spec: z.string(),
  diameter_min_in: z.number().int(),
  diameter_max_in: z.number().int(),
  width_min_in: num,
  width_max_in: num,
  et_min_mm: z.number().int(),
  et_max_mm: z.number().int(),
});
export type VehicleRow = z.infer<typeof vehicleRow>;

/** Ровно колонки PUBLIC_PRODUCT_COLUMNS (src/lib/catalog.ts). */
export const productRow = z.object({
  id: z.string(),
  type: z.enum(["wheel_set", "carbon_part"]),
  slug: z.string(),
  sku: z.string(),
  title: z.string(),
  manufacturer: z.string(),
  description: z.string(),
  status: z.enum(["draft", "active", "archived"]),
  availability_mode: z.enum(["stock", "preorder"]),
  stock_qty: z.number().int(),
  lead_time_min_days: z.number().int().nullable(),
  lead_time_max_days: z.number().int().nullable(),
  price: z.number().int(),
  price_atelier: z.number().int().nullable(),
  diameter_in: z.number().int().nullable(),
  width_front_in: num.nullable(),
  width_rear_in: num.nullable(),
  et_front_mm: z.number().int().nullable(),
  et_rear_mm: z.number().int().nullable(),
  pcd: z.string().nullable(),
  center_bore_mm: num.nullable(),
  seat_type: seatType.nullable(),
  includes_hub_rings: z.boolean(),
  includes_fasteners: z.boolean(),
  construction: construction.nullable(),
  finish: z.string().nullable(),
  weight_kg: num.nullable(),
  warranty_months: z.number().int(),
  certifications: z.array(z.string()),
  claims_verified: z.boolean(),
  created_at: z.string(),
});
export type ProductRow = z.infer<typeof productRow>;
/** Строка после toPublicProduct(): та же форма, но price_atelier/certifications уже отфильтрованы. */
export type PublicProductRow = ProductRow;

export const imageRow = z.object({
  product_id: z.string(),
  storage_path: z.string(),
  alt: z.string(),
  sort_order: z.number().int(),
});
export type ImageRow = z.infer<typeof imageRow>;

export const fitRow = z.object({ product_id: z.string(), needs_hub_rings: z.boolean() });
export type FitRow = z.infer<typeof fitRow>;

export const reservationItemRow = z.object({ product_id: z.string().nullable(), quantity: z.number().int() });
export type ReservationItemRow = z.infer<typeof reservationItemRow>;

export const idRow = z.object({ id: z.string() });
export const productIdRow = z.object({ product_id: z.string() });
export const vehicleIdRow = z.object({ vehicle_id: z.string() });
