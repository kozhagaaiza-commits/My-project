import { wheelFitsVehicle } from "@/lib/catalog/fitment";
import type { PublicProductRow } from "@/lib/catalog/rows";
import { parseNumberField } from "@/lib/admin-products-ui/money-input";
import type { ProductFormValues } from "@/lib/admin-products-ui/product-form-values";
import type { AdminVehicleRow } from "@/lib/admin-products-ui/types";

type WheelProbe = Parameters<typeof wheelFitsVehicle>[0];

const PCD_RE = /^[4-6]x\d{3}(\.\d)?$/;

/**
 * Параметры диска из формы для проверки совместимости; null, пока обязательные поля не заполнены.
 * Пустые «зад» = как спереди (так же трактует find_wheels_for_vehicle).
 */
export function wheelProbeFromValues(v: ProductFormValues): WheelProbe | null {
  const w = v.wheel;
  const diameter = parseNumberField(w.diameter_in);
  const widthFront = parseNumberField(w.width_front_in);
  const etFront = parseNumberField(w.et_front_mm);
  const bore = parseNumberField(w.center_bore_mm);
  if (v.type !== "wheel_set" || diameter == null || widthFront == null || etFront == null || bore == null
    || w.seat_type === "" || !PCD_RE.test(w.pcd.trim())) return null;
  const widthRear = parseNumberField(w.width_rear_in);
  const etRear = parseNumberField(w.et_rear_mm);
  return {
    type: "wheel_set",
    pcd: w.pcd.trim(),
    diameter_in: diameter,
    width_front_in: widthFront,
    width_rear_in: widthRear ?? null,
    et_front_mm: etFront,
    et_rear_mm: etRear ?? null,
    center_bore_mm: bore,
    seat_type: w.seat_type,
    includes_hub_rings: w.includes_hub_rings,
    includes_fasteners: w.includes_fasteners,
  } satisfies Pick<PublicProductRow, keyof WheelProbe>;
}

/** Активные автомобили справочника, под которые подходит диск (клиентская копия find_wheels_for_vehicle). */
export function fittingVehicles(v: ProductFormValues, vehicles: readonly AdminVehicleRow[]): AdminVehicleRow[] | null {
  const probe = wheelProbeFromValues(v);
  if (!probe) return null;
  return vehicles.filter((veh) => veh.is_active && wheelFitsVehicle(probe, veh).fits);
}

/** «BMW 5 Series G30» — без годов, как в строке «Подходит для…». */
export const vehicleShortName = (v: Pick<AdminVehicleRow, "make" | "model" | "generation">) =>
  `${v.make} ${v.model} ${v.generation}`;
