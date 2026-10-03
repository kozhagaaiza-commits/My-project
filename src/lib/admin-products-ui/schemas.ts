import { z } from "zod";
import { kopecks, make, uuid } from "@/lib/schemas/common";

// TODO(backend-engineer, День 6): локальные копии схем Блока 3 («Админка — товары / автомобили»).
// Когда появятся src/lib/schemas/admin-products.ts и admin-vehicles.ts — заменить содержимое файла на
// `export { productUpsertBody, imagesReorderBody } from "@/lib/schemas/admin-products"` и
// `export { vehicleUpsertBody } from "@/lib/schemas/admin-vehicles"` (типы ниже остаются через z.infer).

const wheelFields = z.object({
  diameter_in: z.number().int().min(15).max(24),
  width_front_in: z.number().min(6).max(13).multipleOf(0.5),
  width_rear_in: z.number().min(6).max(13).multipleOf(0.5).nullable(),
  et_front_mm: z.number().int().min(-20).max(70),
  et_rear_mm: z.number().int().min(-20).max(70).nullable(),
  pcd: z.string().regex(/^[4-6]x\d{3}(\.\d)?$/, "Формат 5x112"),
  center_bore_mm: z.number().min(50).max(90).multipleOf(0.1),
  seat_type: z.enum(["cone60", "ball_r13", "ball_r14", "flat"]),
  includes_hub_rings: z.boolean(),
  includes_fasteners: z.boolean(),
  construction: z.enum(["cast", "flow_formed", "forged_monoblock", "forged_2pc", "forged_3pc"]),
  finish: z.string().trim().max(60).nullable(),
  weight_kg: z.number().min(3).max(30).nullable(),
});

export const productUpsertBody = z.object({
  type: z.enum(["wheel_set", "carbon_part"]),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Только латиница, цифры и дефис").max(120),
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,40}$/),
  title: z.string().trim().min(3).max(140),
  manufacturer: z.string().trim().min(2).max(60),
  description: z.string().trim().max(5000),
  status: z.enum(["draft", "active", "archived"]),
  availability_mode: z.enum(["stock", "preorder"]),
  stock_qty: z.number().int().min(0).max(1000),
  lead_time_min_days: z.number().int().min(1).max(180).nullable(),
  lead_time_max_days: z.number().int().min(1).max(180).nullable(),
  purchase_currency: z.enum(["USD", "CNY", "RUB"]),
  purchase_cost: z.number().int().positive(),
  pricing_mode: z.enum(["auto", "manual"]),
  price: kopecks.nullable(),
  price_atelier: kopecks.nullable(),
  wheel: wheelFields.nullable(),
  warranty_months: z.number().int().min(0).max(120),
  certifications: z.array(z.enum(["TÜV", "JWL", "VIA", "KBA"])).max(4),
  claims_verified: z.boolean(),
  compatible_vehicle_ids: z.array(uuid).max(200),
}).superRefine((v, ctx) => {
  if (v.type === "wheel_set" && !v.wheel) ctx.addIssue({ code: "custom", path: ["wheel"], message: "Заполните параметры диска" });
  if (v.type === "carbon_part" && v.availability_mode !== "preorder") ctx.addIssue({ code: "custom", path: ["availability_mode"], message: "Карбон продаётся только под заказ" });
  if (v.availability_mode === "preorder" && (!v.lead_time_min_days || !v.lead_time_max_days || v.lead_time_max_days < v.lead_time_min_days))
    ctx.addIssue({ code: "custom", path: ["lead_time_max_days"], message: "Укажите срок поставки «от» и «до»" });
  if (v.pricing_mode === "manual" && !v.price) ctx.addIssue({ code: "custom", path: ["price"], message: "Укажите цену" });
  if (v.price_atelier && v.price && v.price_atelier > v.price) ctx.addIssue({ code: "custom", path: ["price_atelier"], message: "Цена ателье не может быть выше розничной" });
  if (v.certifications.length > 0 && !v.claims_verified) ctx.addIssue({ code: "custom", path: ["claims_verified"], message: "Сертификации публикуются только после подтверждения" });
});

export const imagesReorderBody = z.object({
  images: z.array(z.object({ id: uuid, sort_order: z.number().int().min(0).max(7), alt: z.string().trim().max(200) })).min(1).max(8),
});

export const vehicleUpsertBody = z.object({
  make,
  model: z.string().trim().min(1).max(60),
  generation: z.string().trim().min(1).max(30),
  year_from: z.number().int().min(1990).max(2100),
  year_to: z.number().int().min(1990).max(2100).nullable(),
  pcd: z.string().regex(/^[4-6]x\d{3}(\.\d)?$/),
  center_bore_mm: z.number().min(50).max(90).multipleOf(0.1),
  seat_type: z.enum(["cone60", "ball_r13", "ball_r14", "flat"]),
  fastener_spec: z.string().trim().min(3).max(60),
  diameter_min_in: z.number().int().min(15).max(24),
  diameter_max_in: z.number().int().min(15).max(24),
  width_min_in: z.number().min(6).max(13).multipleOf(0.5),
  width_max_in: z.number().min(6).max(13).multipleOf(0.5),
  et_min_mm: z.number().int().min(-20).max(70),
  et_max_mm: z.number().int().min(-20).max(70),
  is_active: z.boolean(),
}).refine((v) => v.year_to === null || v.year_to >= v.year_from, { path: ["year_to"], message: "Год окончания раньше года начала" })
  .refine((v) => v.diameter_max_in >= v.diameter_min_in, { path: ["diameter_max_in"], message: "Максимум меньше минимума" })
  .refine((v) => v.width_max_in >= v.width_min_in, { path: ["width_max_in"], message: "Максимум меньше минимума" })
  .refine((v) => v.et_max_mm >= v.et_min_mm, { path: ["et_max_mm"], message: "Максимум меньше минимума" });

export type ProductUpsertBody = z.infer<typeof productUpsertBody>;
export type VehicleUpsertBody = z.infer<typeof vehicleUpsertBody>;
export type WheelBody = z.infer<typeof wheelFields>;
