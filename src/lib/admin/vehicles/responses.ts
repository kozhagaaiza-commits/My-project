import { apiError } from "@/lib/api-error";
import { DbError } from "@/lib/orders/errors";
import type { VehicleUpsertBody } from "@/lib/schemas/admin-vehicles";
import type { AdminVehicleRow } from "./repo";

// Ответы «Админка — автомобили» (Блок 3). Тексты — дословно.

export const VEHICLE_NOT_FOUND = "Автомобиль не найден";
export const vehicleNotFound = () => apiError("NOT_FOUND", VEHICLE_NOT_FOUND, 404);

/** 409 при дубликате make + model + generation (unique 2.3): «BMW 7 Series G11 уже есть в справочнике». */
export const vehicleDuplicate = (v: Pick<VehicleUpsertBody, "make" | "model" | "generation">) =>
  apiError("CONFLICT", `${v.make} ${v.model} ${v.generation} уже есть в справочнике`, 409);

export const isUniqueViolation = (err: unknown) => err instanceof DbError && err.pgCode === "23505";

/** Колонки строки в форме vehicleUpsertBody (для проверки PATCH поверх текущей записи). */
export function toVehicleShape(r: AdminVehicleRow): VehicleUpsertBody {
  return {
    make: r.make, model: r.model, generation: r.generation, year_from: r.year_from, year_to: r.year_to, pcd: r.pcd,
    center_bore_mm: r.center_bore_mm, seat_type: r.seat_type, fastener_spec: r.fastener_spec,
    diameter_min_in: r.diameter_min_in, diameter_max_in: r.diameter_max_in, width_min_in: r.width_min_in,
    width_max_in: r.width_max_in, et_min_mm: r.et_min_mm, et_max_mm: r.et_max_mm, is_active: r.is_active,
  };
}

/** Элемент GET /api/admin/vehicles. */
export const toAdminVehicle = (r: AdminVehicleRow, fitting: number) => ({ id: r.id, ...toVehicleShape(r), fitting_products_count: fitting });
