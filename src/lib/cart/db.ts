import "server-only";
import { z } from "zod";
import { isAtelierPricing, publicImageUrl, tierPrice } from "@/lib/catalog";
import { rows, rpcReservedQtyMap, selectImages, type Db } from "@/lib/catalog/db";
import { pickCovers } from "@/lib/catalog/listing";
import { FEATURE_ATELIER } from "@/lib/config";
import type { CartProduct } from "@/types/cart";
import type { CatalogContext } from "@/types/catalog";

// Чтение товаров для POST /api/cart/validate. Клиент — service-role (Блок 5.10: публичное чтение каталога),
// его создаёт вызывающий код — модуль не импортирует env и тестируется на мок-клиенте.
// Явный список колонок: purchase_cost, purchase_currency, pricing_mode не читаются никогда;
// price_atelier читается, но наружу уходит только как unit_price одобренного ателье (BR-10, BR-20).

export const CART_PRODUCT_COLUMNS = "id,slug,title,type,availability_mode,stock_qty,price,price_atelier,status";

export const cartProductRow = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  type: z.enum(["wheel_set", "carbon_part"]),
  availability_mode: z.enum(["stock", "preorder"]),
  stock_qty: z.number().int(),
  price: z.number().int(),
  price_atelier: z.number().int().nullable(),
  status: z.enum(["draft", "active", "archived"]),
});
export type CartProductRow = z.infer<typeof cartProductRow>;

/** Только active-товары из списка id (≤ 10 по Zod — один запрос с .in()). */
export async function selectCartProducts(c: Db, ids: string[]): Promise<CartProductRow[]> {
  if (ids.length === 0) return [];
  const res = await c.from("products").select(CART_PRODUCT_COLUMNS).in("id", ids).eq("status", "active");
  // Повторный фильтр в коде — защита на случай правки запроса: draft/archived в корзину не попадают (Edge Case 13).
  return rows(cartProductRow, res, "products.cart").filter((p) => p.status === "active");
}

export interface CartProductsDeps {
  supabaseUrl: string;
  featureAtelier?: boolean;
}

/**
 * Товары корзины: unit_price по уровню цены, available_qty = max(stock_qty − брони, 0) для stock, null для preorder,
 * обложка — первое фото по sort_order. Неизвестные / неактивные id в результат не попадают (→ «unavailable»).
 */
export async function loadCartProducts(c: Db, ids: string[], ctx: CatalogContext, deps: CartProductsDeps): Promise<CartProduct[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const atelier = isAtelierPricing(ctx, deps.featureAtelier ?? FEATURE_ATELIER);

  const [products, reserved, images] = await Promise.all([
    selectCartProducts(c, unique),
    rpcReservedQtyMap(c),
    selectImages(c, unique),
  ]);
  const covers = pickCovers(images);

  return products.map((p): CartProduct => {
    const cover = covers.get(p.id);
    return {
      id: p.id, slug: p.slug, title: p.title, type: p.type, availability_mode: p.availability_mode,
      unit_price: tierPrice(p, atelier),
      available_qty: p.availability_mode === "stock" ? Math.max(p.stock_qty - (reserved.get(p.id) ?? 0), 0) : null,
      cover_image_url: cover ? publicImageUrl(deps.supabaseUrl, cover.storage_path) : null,
    };
  });
}
