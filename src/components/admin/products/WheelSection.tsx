"use client";

import { useFormContext } from "react-hook-form";
import { AdminCheckboxField } from "@/components/admin/products/fields/AdminCheckboxField";
import { AdminSelectField } from "@/components/admin/products/fields/AdminSelectField";
import { AdminTextField } from "@/components/admin/products/fields/AdminTextField";
import { PcdField } from "@/components/admin/products/fields/PcdField";
import { ProductFormSection } from "@/components/admin/products/ProductFormSection";
import { WheelFitList } from "@/components/admin/products/WheelFitList";
import { CONSTRUCTION_LABELS, SEAT_TYPE_LABELS } from "@/lib/catalog";
import { CONSTRUCTIONS, DIAMETERS, SEAT_TYPES } from "@/lib/admin-products-ui/labels";
import type { ProductFormValues } from "@/lib/admin-products-ui/product-form-values";
import type { AdminVehicleRow } from "@/lib/admin-products-ui/types";

interface WheelSectionProps {
  vehicles: readonly AdminVehicleRow[];
  vehiclesStatus: "loading" | "error" | "ready";
  onRetryVehicles: () => void;
}

const REAR_HINT = "Пусто — как спереди";

export function WheelSection({ vehicles, vehiclesStatus, onRetryVehicles }: WheelSectionProps) {
  const { control } = useFormContext<ProductFormValues>();
  return (
    <ProductFormSection id="product-wheel" title="Параметры диска">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AdminSelectField
          name="wheel.diameter_in"
          label="Диаметр, дюймы"
          mono
          options={DIAMETERS.map((d) => ({ value: String(d), label: `R${d}` }))}
        />
        <AdminTextField name="wheel.width_front_in" label="Ширина перед, J" type="number" step="0.5" inputMode="decimal" mono />
        <AdminTextField name="wheel.width_rear_in" label="Ширина зад, J" type="number" step="0.5" inputMode="decimal" mono description={REAR_HINT} />
        <AdminTextField name="wheel.et_front_mm" label="Вылет перед (ET), мм" type="number" step="1" inputMode="numeric" mono />
        <AdminTextField name="wheel.et_rear_mm" label="Вылет зад (ET), мм" type="number" step="1" inputMode="numeric" mono description={REAR_HINT} />
        <PcdField name="wheel.pcd" otherName="wheel.pcd_other" />
        <AdminTextField name="wheel.center_bore_mm" label="ЦО, мм" type="number" step="0.1" inputMode="decimal" mono />
        <AdminSelectField
          name="wheel.seat_type"
          label="Посадка крепежа"
          options={SEAT_TYPES.map((s) => ({ value: s, label: SEAT_TYPE_LABELS[s] }))}
        />
        <AdminSelectField
          name="wheel.construction"
          label="Конструкция"
          options={CONSTRUCTIONS.map((c) => ({ value: c, label: CONSTRUCTION_LABELS[c] }))}
        />
        <AdminTextField name="wheel.finish" label="Покрытие" maxLength={60} autoComplete="off" />
        <AdminTextField name="wheel.weight_kg" label="Вес одного диска, кг" type="number" step="0.1" inputMode="decimal" mono />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
        <AdminCheckboxField name="wheel.includes_hub_rings" label="Кольца в комплекте" />
        <AdminCheckboxField name="wheel.includes_fasteners" label="Крепёж в комплекте" />
      </div>
      <WheelFitList control={control} vehicles={vehicles} vehiclesStatus={vehiclesStatus} onRetry={onRetryVehicles} />
    </ProductFormSection>
  );
}
