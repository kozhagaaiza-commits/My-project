import "server-only";
import { cache } from "react";
import { getCatalogContext } from "@/lib/catalog/session";
import { getProductBySlug } from "@/lib/catalog-queries";
import type { ProductDetail, ProductDetailResult } from "@/types/catalog";

export interface LoadedProduct {
  product: ProductDetail;
  /** ?vehicle из URL не найден/неактивен — карточка показана без блока совместимости. */
  vehicleMissing: boolean;
}

/** Единственная точка чтения: один getProductBySlug на (slug, vehicle) за рендер. vehicleId "" — без совместимости. */
const readProduct = cache(async (slug: string, vehicleId: string): Promise<ProductDetailResult> =>
  getProductBySlug(slug, vehicleId || undefined, await getCatalogContext()));

/**
 * Layout (проверка 404), generateMetadata и page читают через readProduct. Без ?vehicle весь просмотр — одно чтение
 * (общий ключ slug). С ?vehicle блок совместимости считает только контракт getProductBySlug, поэтому добавляется
 * ещё одно чтение с vehicle; запасной вариант «vehicle не найден» берёт уже готовое чтение без vehicle из кэша.
 * null — товара нет.
 */
export const loadProduct = cache(async (slug: string, vehicleId: string): Promise<LoadedProduct | null> => {
  let result = await readProduct(slug, vehicleId);
  let vehicleMissing = false;
  if (result.kind === "vehicle_not_found") {
    vehicleMissing = true;
    result = await readProduct(slug, "");
  }
  return result.kind === "ok" ? { product: result.data, vehicleMissing } : null;
});
