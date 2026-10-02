import { vehicleLabel } from "@/lib/catalog";
import type { VehicleOptionRow, VehicleRow } from "@/lib/catalog/rows";
import type { VehicleDetail, VehicleOption } from "@/types/catalog";

// Чистые функции подбора по авто (Блок 3 «Подбор по авто», 5.5). Вход — активные строки vehicles.

/** Текущий год по Москве (год в Чертеже везде считается по Europe/Moscow). */
export function currentYearMoscow(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Moscow", year: "numeric" }).format(now));
}

const uniqueSorted = (values: string[]) => [...new Set(values)].sort();

export const distinctMakes = (rows: Pick<VehicleOptionRow, "make">[]) => uniqueSorted(rows.map((r) => r.make));
export const distinctModels = (rows: Pick<VehicleOptionRow, "model">[]) => uniqueSorted(rows.map((r) => r.model));

/**
 * Годы от минимального year_from до максимального coalesce(year_to, текущий год), по убыванию.
 * Нет записей → null (404 «Модель не найдена»).
 */
export function yearsForModel(rows: Pick<VehicleOptionRow, "year_from" | "year_to">[], currentYear: number): number[] | null {
  if (rows.length === 0) return null;
  const from = Math.min(...rows.map((r) => r.year_from));
  const to = Math.max(...rows.map((r) => r.year_to ?? currentYear));
  const years: number[] = [];
  for (let y = to; y >= from; y -= 1) years.push(y);
  return years;
}

/** Поколения, у которых year_from ≤ year ≤ coalesce(year_to, текущий год); по возрастанию year_from. */
export function generationsForYear(rows: VehicleOptionRow[], year: number, currentYear: number): VehicleOption[] {
  return rows
    .filter((r) => r.year_from <= year && year <= (r.year_to ?? currentYear))
    .sort((a, b) => a.year_from - b.year_from || a.generation.localeCompare(b.generation))
    .map(toVehicleOption);
}

export function toVehicleOption(r: VehicleOptionRow): VehicleOption {
  return {
    id: r.id, make: r.make, model: r.model, generation: r.generation,
    year_from: r.year_from, year_to: r.year_to, label: vehicleLabel(r),
  };
}

export function toVehicleDetail(r: VehicleRow): VehicleDetail {
  return {
    ...toVehicleOption(r),
    pcd: r.pcd, center_bore_mm: r.center_bore_mm, seat_type: r.seat_type, fastener_spec: r.fastener_spec,
    diameter_min_in: r.diameter_min_in, diameter_max_in: r.diameter_max_in,
    width_min_in: r.width_min_in, width_max_in: r.width_max_in,
    et_min_mm: r.et_min_mm, et_max_mm: r.et_max_mm,
  };
}
