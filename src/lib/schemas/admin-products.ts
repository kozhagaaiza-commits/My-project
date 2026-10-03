import { z } from "zod";
import { kopecks, page, uuid } from "./common";

// Схемы «Админка — товары» (Чертёж, Блок 3). Одна схема на клиенте (формы) и сервере (Route Handlers).
//
// FIX(blueprint): в Zod 4 `.partial()` бросает исключение на объекте с refinements («.partial() cannot be used on
// object schemas containing refinements»), поэтому `productUpsertBody.partial()` из Чертежа не работает. Поля и
// проверки разнесены: productUpsertFields (z.object Чертежа) + refineProductUpsert (тот же superRefine дословно);
// productUpsertBody = productUpsertFields.superRefine(refineProductUpsert) — ровно схема Чертежа.

export const adminProductsQuery = z.object({
  type: z.enum(["wheel_set", "carbon_part"]).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  q: z.string().trim().min(2).max(60).optional(),
  page,
});

export const wheelFields = z.object({
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

export const productUpsertFields = z.object({
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
});

export type ProductUpsertBody = z.infer<typeof productUpsertFields>;

/** superRefine из Чертежа (Блок 3, POST /api/admin/products) дословно. */
export function refineProductUpsert(v: ProductUpsertBody, ctx: z.RefinementCtx): void {
  if (v.type === "wheel_set" && !v.wheel) ctx.addIssue({ code: "custom", path: ["wheel"], message: "Заполните параметры диска" });
  if (v.type === "carbon_part" && v.availability_mode !== "preorder") ctx.addIssue({ code: "custom", path: ["availability_mode"], message: "Карбон продаётся только под заказ" });
  if (v.availability_mode === "preorder" && (!v.lead_time_min_days || !v.lead_time_max_days || v.lead_time_max_days < v.lead_time_min_days))
    ctx.addIssue({ code: "custom", path: ["lead_time_max_days"], message: "Укажите срок поставки «от» и «до»" });
  if (v.pricing_mode === "manual" && !v.price) ctx.addIssue({ code: "custom", path: ["price"], message: "Укажите цену" });
  if (v.price_atelier && v.price && v.price_atelier > v.price) ctx.addIssue({ code: "custom", path: ["price_atelier"], message: "Цена ателье не может быть выше розничной" });
  if (v.certifications.length > 0 && !v.claims_verified) ctx.addIssue({ code: "custom", path: ["claims_verified"], message: "Сертификации публикуются только после подтверждения" });
}

export const productUpsertBody = productUpsertFields.superRefine(refineProductUpsert);

/**
 * PATCH /api/admin/products/[id]: `productUpsertBody.partial().extend({ updated_at: z.iso.datetime() })`;
 * superRefine-проверки сервер выполняет поверх объединения с текущей записью (productUpsertBody.safeParse(merged)).
 */
export const productPatchBody = productUpsertFields.partial().extend({ updated_at: z.iso.datetime() });
export type ProductPatchBody = z.infer<typeof productPatchBody>;

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export const imageUploadForm = z.object({
  file: z.instanceof(File)
    .refine((f) => f.size <= 5 * 1024 * 1024, "Файл больше 5 МБ")
    .refine((f) => ["image/jpeg", "image/png", "image/webp"].includes(f.type), "Только JPG, PNG или WebP"),
  alt: z.string().trim().max(200).default(""),
});

export const imagesReorderBody = z.object({
  images: z.array(z.object({ id: uuid, sort_order: z.number().int().min(0).max(7), alt: z.string().trim().max(200) })).min(1).max(8),
});
export type ImagesReorderBody = z.infer<typeof imagesReorderBody>;

/** PUT /api/admin/products/[id]/vehicles. */
export const productVehiclesBody = z.object({ vehicle_ids: z.array(uuid).max(200) });

/** POST /api/admin/prices/recalculate. */
export const pricesRecalculateBody = z.object({ dry_run: z.boolean() });
