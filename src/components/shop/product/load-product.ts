import "server-only";
import { cache } from "react";
import { getCatalogContext } from "@/lib/catalog/session";
import { getProductBySlug } from "@/lib/catalog-queries";
import type { ProductDetail } from "@/types/catalog";

export interface LoadedProduct {
  product: ProductDetail;
  /** ?vehicle из URL не найден/неактивен — карточка показана без блока совместимости. */
  vehicleMissing: boolean;
}

/** Один запрос на (slug, vehicle) за рендер: layout, generateMetadata и page не дублируют чтение. null — товара нет. */
export const loadProduct = cache(async (slug: string, vehicleId: string): Promise<LoadedProduct | null> => {
  const ctx = await getCatalogContext();
  let result = await getProductBySlug(slug, vehicleId || undefined, ctx);
  let vehicleMissing = false;
  if (result.kind === "vehicle_not_found") {
    vehicleMissing = true;
    result = await getProductBySlug(slug, undefined, ctx);
  }
  return result.kind === "ok" ? { product: result.data, vehicleMissing } : null;
});
