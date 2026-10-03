import { z } from "zod";
import { num } from "@/lib/admin/products/rows";
import type { VehicleUpsertBody } from "@/lib/schemas/admin-vehicles";

// Контракт доступа к справочнику автомобилей для админки (Блок 2.3, Блок 3 «Админка — автомобили»).
// Реальная реализация — ./db.ts (сессионный клиент, RLS is_admin(); service-role — только RPC
// find_wheels_for_vehicle, она выдана одному service_role, A21). В тестах — in-memory подмена.

export const ADMIN_VEHICLE_COLUMNS =
  "id,make,model,generation,year_from,year_to,pcd,center_bore_mm,seat_type,fastener_spec," +
  "diameter_min_in,diameter_max_in,width_min_in,width_max_in,et_min_mm,et_max_mm,is_active";

export const adminVehicleRow = z.object({
  id: z.string(),
  make: z.enum(["Audi", "BMW", "Mercedes-Benz"]),
  model: z.string(),
  generation: z.string(),
  year_from: z.number().int(),
  year_to: z.number().int().nullable(),
  pcd: z.string(),
  center_bore_mm: num,
  seat_type: z.enum(["cone60", "ball_r13", "ball_r14", "flat"]),
  fastener_spec: z.string(),
  diameter_min_in: z.number().int(),
  diameter_max_in: z.number().int(),
  width_min_in: num,
  width_max_in: num,
  et_min_mm: z.number().int(),
  et_max_mm: z.number().int(),
  is_active: z.boolean(),
});
export type AdminVehicleRow = z.infer<typeof adminVehicleRow>;

export interface VehicleListFilter {
  make?: "Audi" | "BMW" | "Mercedes-Benz";
  q?: string;
  page: number;
  perPage: number;
}

export interface AdminVehiclesRepo {
  list(filter: VehicleListFilter): Promise<{ rows: AdminVehicleRow[]; total: number }>;
  get(id: string): Promise<AdminVehicleRow | null>;
  /** 23505 (unique make+model+generation) → DbError. */
  insert(v: VehicleUpsertBody): Promise<AdminVehicleRow>;
  /** 0 строк → null. */
  update(id: string, patch: Partial<VehicleUpsertBody>): Promise<AdminVehicleRow | null>;
  /** false — строки нет. */
  delete(id: string): Promise<boolean>;
  /** «Подходящих дисков»: число строк find_wheels_for_vehicle (active-диски; для скрытого авто — 0). */
  fittingWheelsCount(vehicleId: string): Promise<number>;
}
