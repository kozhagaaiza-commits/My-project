import { z } from "zod";
import { make, page } from "./common";

// Схемы «Админка — автомобили» (Чертёж, Блок 3). Одна схема на клиенте (Sheet-форма) и сервере.
//
// FIX(blueprint): PATCH принимает «подмножество vehicleUpsertBody», но в Zod 4 `.partial()` на объекте с refine
// бросает исключение. Поля вынесены в vehicleUpsertFields; vehicleUpsertBody = те же поля + те же refine Чертежа.
// PATCH: vehiclePatchBody (partial полей), refine-проверки сервер выполняет поверх объединения с текущей записью.

export const adminVehiclesQuery = z.object({ make: make.optional(), q: z.string().trim().min(1).max(60).optional(), page });

export const vehicleUpsertFields = z.object({
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
});

export const vehicleUpsertBody = vehicleUpsertFields
  .refine((v) => v.year_to === null || v.year_to >= v.year_from, { path: ["year_to"], message: "Год окончания раньше года начала" })
  .refine((v) => v.diameter_max_in >= v.diameter_min_in, { path: ["diameter_max_in"], message: "Максимум меньше минимума" })
  .refine((v) => v.width_max_in >= v.width_min_in, { path: ["width_max_in"], message: "Максимум меньше минимума" })
  .refine((v) => v.et_max_mm >= v.et_min_mm, { path: ["et_max_mm"], message: "Максимум меньше минимума" });

export type VehicleUpsertBody = z.infer<typeof vehicleUpsertFields>;

/** PATCH /api/admin/vehicles/[id]: подмножество vehicleUpsertBody, например `{ "et_max_mm": 42 }`. */
export const vehiclePatchBody = vehicleUpsertFields.partial();
export type VehiclePatchBody = z.infer<typeof vehiclePatchBody>;
