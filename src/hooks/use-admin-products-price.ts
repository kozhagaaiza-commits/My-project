"use client";

import { useWatch, type Control, type FieldValues } from "react-hook-form";
import { parseMoneyToMinor } from "@/lib/admin-products-ui/money-input";
import { buildPricePreview, type PricePreview } from "@/lib/admin-products-ui/price-preview";
import type { ProductFormValues } from "@/lib/admin-products-ui/product-form-values";
import type { AdminSettings } from "@/lib/admin-products-ui/types";

export interface ProductPriceState {
  mode: "auto" | "manual";
  preview: PricePreview;
  /** Розничная цена в копейках: авто — расчёт по курсу, вручную — ввод; null — не известна. */
  retailKopecks: number | null;
  atelierKopecks: number | null;
  /** Режим «Авто» без курса: публикация заблокирована до загрузки курса (US-006, п. 8). */
  autoBlocked: boolean;
}

/** Живой расчёт цены из значений формы и настроек (курс, множитель, округление). */
export function useProductPrice<TContext, TOut extends FieldValues>(
  control: Control<ProductFormValues, TContext, TOut>,
  settings: AdminSettings | null,
): ProductPriceState {
  const [mode, currency, cost, price, atelier] = useWatch({
    control,
    name: ["pricing_mode", "purchase_currency", "purchase_cost", "price", "price_atelier"],
  });
  const preview = buildPricePreview(parseMoneyToMinor(cost), currency, settings);
  const retailKopecks = mode === "auto" ? (preview.kind === "ok" ? preview.priceKopecks : null) : (parseMoneyToMinor(price) ?? null);
  return {
    mode,
    preview,
    retailKopecks,
    atelierKopecks: atelier.trim() === "" ? null : (parseMoneyToMinor(atelier) ?? null),
    autoBlocked: mode === "auto" && preview.kind === "no_rate",
  };
}
