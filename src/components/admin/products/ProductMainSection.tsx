"use client";

import { RefreshCw } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { AdminTextField } from "@/components/admin/products/fields/AdminTextField";
import { ProductFormSection } from "@/components/admin/products/ProductFormSection";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import type { ProductFormValues } from "@/lib/admin-products-ui/product-form-values";

const DESCRIPTION_MAX = 5000;

interface ProductMainSectionProps {
  onTitleChange: (title: string) => void;
  onSlugEdit: () => void;
  onRegenerateSlug: () => void;
  /** Подсказка от SLUG_TAKEN; null — нет. */
  slugSuggestion: string | null;
  onApplySuggestion: () => void;
}

export function ProductMainSection({ onTitleChange, onSlugEdit, onRegenerateSlug, slugSuggestion, onApplySuggestion }: ProductMainSectionProps) {
  const { control } = useFormContext<ProductFormValues>();
  const description = useWatch({ control, name: "description" });
  return (
    <ProductFormSection id="product-main" title="Основное">
      <AdminTextField name="title" label="Название" maxLength={140} autoComplete="off" onValueChange={onTitleChange} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminTextField name="manufacturer" label="Производитель" maxLength={60} autoComplete="off" />
        <AdminTextField name="sku" label="Артикул (SKU)" maxLength={40} autoComplete="off" mono />
      </div>
      <div className="space-y-2">
        <AdminTextField
          name="slug"
          label="Адрес (slug)"
          maxLength={120}
          autoComplete="off"
          mono
          onValueChange={onSlugEdit}
          adornment={
            <Button type="button" variant="outline" size="icon" aria-label="Сгенерировать" title="Сгенерировать" onClick={onRegenerateSlug}>
              <RefreshCw aria-hidden />
            </Button>
          }
        />
        {slugSuggestion && (
          <Button type="button" variant="outline" size="sm" onClick={onApplySuggestion}>
            Сгенерировать другой
          </Button>
        )}
      </div>
      <FormField
        control={control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Описание</FormLabel>
            <FormControl>
              <Textarea {...field} rows={6} className="scroll-my-24" />
            </FormControl>
            <div className="flex items-start justify-between gap-2">
              <FormMessage />
              <p className="ml-auto font-mono text-xs text-muted-foreground tabular-nums" aria-live="off">
                {description.length}/{DESCRIPTION_MAX}
              </p>
            </div>
          </FormItem>
        )}
      />
    </ProductFormSection>
  );
}
