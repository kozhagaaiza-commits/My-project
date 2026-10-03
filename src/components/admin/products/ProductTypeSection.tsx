"use client";

import { useFormContext } from "react-hook-form";
import { AdminRadioField } from "@/components/admin/products/fields/AdminRadioField";
import { ProductFormSection } from "@/components/admin/products/ProductFormSection";
import { PRODUCT_TYPE_LABELS } from "@/lib/admin-products-ui/labels";
import type { ProductFormValues } from "@/lib/admin-products-ui/product-form-values";

interface ProductTypeSectionProps {
  /** На редактировании тип не меняется. */
  locked: boolean;
}

export function ProductTypeSection({ locked }: ProductTypeSectionProps) {
  const { setValue } = useFormContext<ProductFormValues>();
  return (
    <ProductFormSection id="product-type" title="Тип">
      <AdminRadioField
        name="type"
        label="Тип товара"
        disabled={locked}
        options={[
          { value: "wheel_set", label: PRODUCT_TYPE_LABELS.wheel_set },
          { value: "carbon_part", label: PRODUCT_TYPE_LABELS.carbon_part },
        ]}
        description={locked ? "Тип нельзя изменить после создания товара" : undefined}
        onValueChange={(v) => setValue("availability_mode", v === "carbon_part" ? "preorder" : "stock", { shouldDirty: true })}
      />
    </ProductFormSection>
  );
}
