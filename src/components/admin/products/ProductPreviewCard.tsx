"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { ProductCard } from "@/components/shop/ProductCard";
import { useProductPrice } from "@/hooks/use-admin-products-price";
import { buildPreviewItem } from "@/lib/admin-products-ui/preview-item";
import type { ProductFormValues } from "@/lib/admin-products-ui/product-form-values";
import type { AdminImage, AdminSettings } from "@/lib/admin-products-ui/types";

interface ProductPreviewCardProps {
  settings: AdminSettings | null;
  images: readonly AdminImage[];
  reservedQty: number;
}

/** Карточка каталога «как увидит покупатель»; не кликабельна (inert), собирается из текущих значений формы. */
export function ProductPreviewCard({ settings, images, reservedQty }: ProductPreviewCardProps) {
  const { control } = useFormContext<ProductFormValues>();
  const values = useWatch({ control }) as ProductFormValues;
  const { retailKopecks, atelierKopecks } = useProductPrice(control, settings);
  const item = buildPreviewItem({ values, images, priceKopecks: retailKopecks, atelierKopecks, reservedQty });
  return (
    <div inert className="max-w-sm select-none" data-testid="product-preview">
      <ProductCard product={item} sizes="(min-width: 1024px) 320px, 90vw" />
    </div>
  );
}
