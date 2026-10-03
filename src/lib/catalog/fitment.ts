import type { PublicProductRow, VehicleRow } from "@/lib/catalog/rows";

// Правила совместимости диска и авто — TS-копия find_wheels_for_vehicle (Блок 2.14, 5.5).
// Используется в карточке товара (там товар один и может быть неактивным для admin — RPC его бы
// отфильтровал по status = 'active'). Список каталога берёт результат из самой RPC.
// Десятичные (ЦО, ширина) сравниваются в десятых долях целыми числами: в JS 66.8 − 66.6 = 0.2000…03.

const tenths = (n: number) => Math.round(n * 10);
const between = (x: number, min: number, max: number) => x >= min && x <= max;

export interface WheelFit {
  fits: boolean;
  needs_hub_rings: boolean;
}

export function wheelFitsVehicle(
  p: Pick<PublicProductRow, "type" | "pcd" | "diameter_in" | "width_front_in" | "width_rear_in" | "et_front_mm"
    | "et_rear_mm" | "center_bore_mm" | "seat_type" | "includes_hub_rings" | "includes_fasteners">,
  v: Pick<VehicleRow, "pcd" | "diameter_min_in" | "diameter_max_in" | "width_min_in" | "width_max_in"
    | "et_min_mm" | "et_max_mm" | "center_bore_mm" | "seat_type">,
): WheelFit {
  const no: WheelFit = { fits: false, needs_hub_rings: false };
  if (p.type !== "wheel_set" || p.pcd === null || p.diameter_in === null || p.width_front_in === null
    || p.et_front_mm === null || p.center_bore_mm === null || p.seat_type === null) return no;

  const wMin = tenths(v.width_min_in);
  const wMax = tenths(v.width_max_in);
  const boreDiff = tenths(p.center_bore_mm) - tenths(v.center_bore_mm); // в десятых мм
  const fits =
    p.pcd === v.pcd
    && between(p.diameter_in, v.diameter_min_in, v.diameter_max_in)
    && between(tenths(p.width_front_in), wMin, wMax)
    && between(tenths(p.width_rear_in ?? p.width_front_in), wMin, wMax)
    && between(p.et_front_mm, v.et_min_mm, v.et_max_mm)
    && between(p.et_rear_mm ?? p.et_front_mm, v.et_min_mm, v.et_max_mm)
    && boreDiff >= 0
    && (boreDiff <= 2 || p.includes_hub_rings)
    && (p.seat_type === v.seat_type || p.includes_fasteners);

  return fits ? { fits: true, needs_hub_rings: boreDiff > 2 } : no;
}
