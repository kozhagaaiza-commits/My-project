"use client";

import { useFormContext } from "react-hook-form";
import { AdminCheckboxField } from "@/components/admin/products/fields/AdminCheckboxField";
import { AdminTextField } from "@/components/admin/products/fields/AdminTextField";
import { ProductFormSection } from "@/components/admin/products/ProductFormSection";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { CERTIFICATIONS } from "@/lib/admin-products-ui/labels";
import type { ProductFormValues } from "@/lib/admin-products-ui/product-form-values";

export function CertificationSection() {
  const { control } = useFormContext<ProductFormValues>();
  return (
    <ProductFormSection id="product-warranty" title="Гарантия и сертификации">
      <AdminTextField
        name="warranty_months"
        label="Гарантия, мес."
        type="number"
        step="1"
        inputMode="numeric"
        mono
        className="sm:max-w-xs"
      />
      <FormField
        control={control}
        name="certifications"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Сертификации</FormLabel>
            <FormControl>
              <div className="flex flex-wrap gap-x-6 gap-y-2" role="group" aria-label="Сертификации">
                {CERTIFICATIONS.map((c) => (
                  <Label key={c} className="font-normal">
                    <Checkbox
                      checked={field.value.includes(c)}
                      onCheckedChange={(on) =>
                        field.onChange(on === true ? [...field.value, c] : field.value.filter((x) => x !== c))
                      }
                    />
                    {c}
                  </Label>
                ))}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <AdminCheckboxField
        name="claims_verified"
        label="Заявления подтверждены поставщиком и производителем"
        description="Без отметки сертификации не показываются на сайте"
      />
    </ProductFormSection>
  );
}
