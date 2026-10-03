"use client";

import { useFormContext } from "react-hook-form";
import { AdminRadioField } from "@/components/admin/products/fields/AdminRadioField";
import { AdminSelectField } from "@/components/admin/products/fields/AdminSelectField";
import { MoneyField } from "@/components/admin/products/fields/MoneyField";
import { PriceCalcLine } from "@/components/admin/products/PriceCalcLine";
import { ProductFormSection } from "@/components/admin/products/ProductFormSection";
import { useProductPrice } from "@/hooks/use-admin-products-price";
import { FEATURE_ATELIER } from "@/lib/config";
import { CURRENCIES } from "@/lib/admin-products-ui/labels";
import type { ProductFormValues } from "@/lib/admin-products-ui/product-form-values";
import type { AdminSettings } from "@/lib/admin-products-ui/types";

interface PriceSectionProps {
  settings: AdminSettings | null;
  rateError: string | null;
  refreshing: boolean;
  onRefreshRates: () => void;
  onRateErrorClear: () => void;
}

export function PriceSection({ settings, rateError, refreshing, onRefreshRates, onRateErrorClear }: PriceSectionProps) {
  const { control, watch } = useFormContext<ProductFormValues>();
  const { mode, preview } = useProductPrice(control, settings);
  const currency = watch("purchase_currency");
  return (
    <ProductFormSection id="product-price" title="Цена">
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminSelectField
          name="purchase_currency"
          label="Валюта закупки"
          mono
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          onValueChange={onRateErrorClear}
        />
        <MoneyField name="purchase_cost" label={`Закупка, ${currency}`} placeholder="800.00" description="За комплект или 1 шт., с копейками" />
      </div>
      <AdminRadioField
        name="pricing_mode"
        label="Режим цены"
        options={[
          { value: "auto", label: "Авто по курсу ЦБ" },
          { value: "manual", label: "Вручную" },
        ]}
        onValueChange={onRateErrorClear}
      />
      {mode === "auto" ? (
        <PriceCalcLine preview={preview} serverError={rateError} refreshing={refreshing} onRefreshRates={onRefreshRates} />
      ) : (
        <MoneyField name="price" label="Цена, ₽" placeholder="133700" className="sm:max-w-xs" />
      )}
      {FEATURE_ATELIER && (
        <MoneyField name="price_atelier" label="Цена для ателье, ₽" placeholder="118000" description="Необязательно. Не выше розничной" className="sm:max-w-xs" />
      )}
    </ProductFormSection>
  );
}
