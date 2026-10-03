"use client";

import { useFormContext } from "react-hook-form";
import { AdminSelectField } from "@/components/admin/products/fields/AdminSelectField";
import { AdminTextField } from "@/components/admin/products/fields/AdminTextField";
import { PcdField } from "@/components/admin/products/fields/PcdField";
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { SEAT_TYPE_LABELS } from "@/lib/catalog";
import { MAKES, SEAT_TYPES } from "@/lib/admin-products-ui/labels";

const num = { type: "number", inputMode: "decimal", mono: true } as const;

/** Поля vehicleUpsertBody. Диапазоны «от/до» — допустимые значения без доработок кузова и подвески. */
export function VehicleFormFields() {
  const { control } = useFormContext();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <AdminSelectField name="make" label="Марка" options={MAKES.map((m) => ({ value: m, label: m }))} />
      <AdminTextField name="model" label="Модель" maxLength={60} autoComplete="off" />
      <AdminTextField name="generation" label="Поколение" maxLength={30} autoComplete="off" />
      <AdminTextField name="year_from" label="Год с" step="1" {...num} />
      <AdminTextField name="year_to" label="Год по" step="1" {...num} description="Пусто — выпускается сейчас" />
      <PcdField name="pcd" otherName="pcd_other" />
      <AdminTextField name="center_bore_mm" label="ЦО, мм" step="0.1" {...num} />
      <AdminSelectField name="seat_type" label="Посадка крепежа" options={SEAT_TYPES.map((s) => ({ value: s, label: SEAT_TYPE_LABELS[s] }))} />
      <AdminTextField name="fastener_spec" label="Крепёж" maxLength={60} autoComplete="off" placeholder="Болт M14×1.25" className="sm:col-span-2" />
      <AdminTextField name="diameter_min_in" label="Диаметр от, R" step="1" {...num} />
      <AdminTextField name="diameter_max_in" label="Диаметр до, R" step="1" {...num} />
      <AdminTextField name="width_min_in" label="Ширина от, J" step="0.5" {...num} />
      <AdminTextField name="width_max_in" label="Ширина до, J" step="0.5" {...num} />
      <AdminTextField name="et_min_mm" label="Вылет от, мм" step="1" {...num} />
      <AdminTextField name="et_max_mm" label="Вылет до, мм" step="1" {...num} />
      <FormField
        control={control}
        name="is_active"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-3 sm:col-span-2">
            <FormControl>
              <Switch checked={field.value === true} onCheckedChange={field.onChange} />
            </FormControl>
            <FormLabel>Активен</FormLabel>
          </FormItem>
        )}
      />
    </div>
  );
}
