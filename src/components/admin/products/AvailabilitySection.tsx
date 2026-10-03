"use client";

import { useWatch, useFormContext } from "react-hook-form";
import { AdminRadioField } from "@/components/admin/products/fields/AdminRadioField";
import { AdminTextField } from "@/components/admin/products/fields/AdminTextField";
import { ProductFormSection } from "@/components/admin/products/ProductFormSection";
import type { ProductFormValues } from "@/lib/admin-products-ui/product-form-values";

interface AvailabilitySectionProps {
  /** Для сохранённого товара: «Забронировано: N». */
  reservedQty: number | null;
}

export function AvailabilitySection({ reservedQty }: AvailabilitySectionProps) {
  const { control } = useFormContext<ProductFormValues>();
  const [type, mode] = useWatch({ control, name: ["type", "availability_mode"] });
  const carbon = type === "carbon_part";
  const preorder = carbon || mode === "preorder";
  return (
    <ProductFormSection id="product-availability" title="Наличие">
      <AdminRadioField
        name="availability_mode"
        label="Режим"
        disabled={carbon}
        options={[
          { value: "stock", label: "Склад в Москве", disabled: carbon },
          { value: "preorder", label: "Под заказ" },
        ]}
        description={carbon ? "Карбон продаётся только под заказ" : undefined}
      />
      {preorder ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminTextField name="lead_time_min_days" label="Срок поставки от, дней" type="number" step="1" inputMode="numeric" mono />
          <AdminTextField name="lead_time_max_days" label="Срок поставки до, дней" type="number" step="1" inputMode="numeric" mono />
        </div>
      ) : (
        <AdminTextField
          name="stock_qty"
          label="Остаток, комплектов"
          type="number"
          step="1"
          inputMode="numeric"
          mono
          className="sm:max-w-xs"
          description={reservedQty !== null ? `Забронировано под неоплаченные заказы: ${reservedQty}` : undefined}
        />
      )}
    </ProductFormSection>
  );
}
