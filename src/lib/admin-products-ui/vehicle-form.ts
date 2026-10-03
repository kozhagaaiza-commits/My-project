// Форма автомобиля (Sheet): значения-строки ↔ vehicleUpsertBody; resolver с той же схемой, что на сервере.
import type { FieldErrors, Resolver, ResolverError, ResolverOptions, ResolverSuccess } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { formatDecimal } from "@/lib/catalog";
import { PCD_PRESETS } from "@/lib/admin-products-ui/labels";
import { parseNumberField } from "@/lib/admin-products-ui/money-input";
import { productErrorMap } from "@/lib/admin-products-ui/product-form-body";
import { vehicleUpsertBody, type VehicleUpsertBody } from "@/lib/admin-products-ui/schemas";
import type { AdminVehicleRow } from "@/lib/admin-products-ui/types";
import type { SeatType } from "@/types/catalog";

type SchemaInput = z.input<typeof vehicleUpsertBody>;

export interface VehicleFormValues {
  make: VehicleUpsertBody["make"] | "";
  model: string;
  generation: string;
  year_from: string;
  /** Пусто — выпускается сейчас (null). */
  year_to: string;
  pcd: string;
  pcd_other: boolean;
  center_bore_mm: string;
  seat_type: SeatType | "";
  fastener_spec: string;
  diameter_min_in: string;
  diameter_max_in: string;
  width_min_in: string;
  width_max_in: string;
  et_min_mm: string;
  et_max_mm: string;
  is_active: boolean;
}

export const EMPTY_VEHICLE_VALUES: VehicleFormValues = {
  make: "", model: "", generation: "", year_from: "", year_to: "", pcd: "", pcd_other: false, center_bore_mm: "",
  seat_type: "", fastener_spec: "", diameter_min_in: "", diameter_max_in: "", width_min_in: "", width_max_in: "",
  et_min_mm: "", et_max_mm: "", is_active: true,
};

const str = (n: number | null) => (n === null ? "" : formatDecimal(n));

export function vehicleValuesFromRow(r: AdminVehicleRow): VehicleFormValues {
  return {
    make: r.make, model: r.model, generation: r.generation, year_from: String(r.year_from), year_to: str(r.year_to),
    pcd: r.pcd, pcd_other: !(PCD_PRESETS as readonly string[]).includes(r.pcd),
    center_bore_mm: str(r.center_bore_mm), seat_type: r.seat_type, fastener_spec: r.fastener_spec,
    diameter_min_in: String(r.diameter_min_in), diameter_max_in: String(r.diameter_max_in),
    width_min_in: str(r.width_min_in), width_max_in: str(r.width_max_in),
    et_min_mm: String(r.et_min_mm), et_max_mm: String(r.et_max_mm), is_active: r.is_active,
  };
}

const req = (s: string): number | undefined => parseNumberField(s) ?? undefined;

export function buildVehicleBody(v: VehicleFormValues): Record<string, unknown> {
  return {
    make: v.make === "" ? undefined : v.make,
    model: v.model,
    generation: v.generation,
    year_from: req(v.year_from),
    year_to: parseNumberField(v.year_to),
    pcd: v.pcd.trim(),
    center_bore_mm: req(v.center_bore_mm),
    seat_type: v.seat_type === "" ? undefined : v.seat_type,
    fastener_spec: v.fastener_spec,
    diameter_min_in: req(v.diameter_min_in),
    diameter_max_in: req(v.diameter_max_in),
    width_min_in: req(v.width_min_in),
    width_max_in: req(v.width_max_in),
    et_min_mm: req(v.et_min_mm),
    et_max_mm: req(v.et_max_mm),
    is_active: v.is_active,
  };
}

export function makeVehicleResolver(): Resolver<VehicleFormValues, unknown, VehicleUpsertBody> {
  const base = zodResolver(vehicleUpsertBody, { error: productErrorMap });
  return async (values, context, options) => {
    const result = await base(
      buildVehicleBody(values) as unknown as SchemaInput,
      context,
      options as unknown as ResolverOptions<SchemaInput>,
    );
    const errors = result.errors as unknown as FieldErrors<VehicleFormValues>;
    if (Object.keys(errors).length > 0) {
      const fail: ResolverError<VehicleFormValues> = { values: {}, errors };
      return fail;
    }
    const ok: ResolverSuccess<VehicleUpsertBody> = { values: result.values as VehicleUpsertBody, errors: {} };
    return ok;
  };
}

/** Диапазон для таблицы: «18–21», одинаковые границы — «19». */
export const rangeText = (a: number, b: number) => (a === b ? formatDecimal(a) : `${formatDecimal(a)}–${formatDecimal(b)}`);

/** «2017–2023» / «2019–н.в.». */
export const yearsText = (from: number, to: number | null) => `${from}–${to ?? "н.в."}`;

/** Запасной текст для 409, если в ответе нет message: «BMW 7 Series G11 уже есть». */
export const duplicateText = (v: Pick<VehicleUpsertBody, "make" | "model" | "generation">) =>
  `${v.make} ${v.model} ${v.generation} уже есть`;
