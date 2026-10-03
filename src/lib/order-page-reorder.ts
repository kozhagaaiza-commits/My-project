// «Оформить заново» для отменённого заказа (Блок 4 «Статус заказа»): позиции возвращаются в корзину по product_slug.
// В заказе нет product_id, поэтому товар перечитывается через GET /api/products/[slug] (актуальная цена и id).
// Позиции без slug (товар удалён из каталога) и больше не продающиеся пропускаются. Только для браузера.
import { addItem, emptyCart, maxQuantityFor, type Cart, type CartItem } from "@/lib/cart-store";
import type { CartKind } from "@/types/cart";
import type { ProductType } from "@/types/catalog";
import type { OrderViewItem } from "@/types/order-view";

export const REORDER_NO_ITEMS_MESSAGE = "Товары из этого заказа больше не продаются";
export const REORDER_PARTIAL_MESSAGE = "Часть позиций больше не продаётся и не добавлена в корзину";
export const REORDER_FAILED_MESSAGE = "Не удалось вернуть позиции в корзину. Повторите";

export interface ReorderProduct {
  id: string;
  slug: string;
  title: string;
  type: ProductType;
  kind: CartKind;
  /** Актуальная цена (копейки): price_atelier для одобренного ателье, иначе price. */
  price: number;
}

export interface ReorderLine {
  quantity: number;
  /** null — товара нет в каталоге (нет slug, 404, не разобрался). */
  product: ReorderProduct | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** { data: ProductDetail } → минимум, нужный для позиции корзины. */
export function parseReorderProduct(body: unknown): ReorderProduct | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const d = body.data;
  const mode = isRecord(d.availability) ? d.availability.mode : null;
  const price = typeof d.price_atelier === "number" ? d.price_atelier : d.price;
  if (typeof d.id !== "string" || typeof d.slug !== "string" || typeof d.title !== "string") return null;
  if (d.type !== "wheel_set" && d.type !== "carbon_part") return null;
  if (mode !== "stock" && mode !== "preorder") return null;
  if (typeof price !== "number" || !Number.isSafeInteger(price) || price < 0) return null;
  return { id: d.id, slug: d.slug, title: d.title, type: d.type, kind: mode, price };
}

export interface ReorderPlan {
  cart: Cart;
  added: number;
  skipped: number;
}

/**
 * Корзина после «Оформить заново». Корзина того же kind дополняется (количество суммируется до лимита, BR-04),
 * корзина другого kind заменяется (BR-03 — разные заказы). Позиции без товара считаются пропущенными.
 */
export function planReorder(current: Cart, kind: CartKind, lines: readonly ReorderLine[], now: Date = new Date()): ReorderPlan {
  let cart = current.items.length > 0 && current.kind !== kind ? emptyCart(now) : current;
  let added = 0;
  let skipped = 0;
  for (const { product, quantity } of lines) {
    if (!product) {
      skipped += 1;
      continue;
    }
    const item: CartItem = {
      product_id: product.id,
      quantity: Math.max(1, Math.min(Math.trunc(quantity), maxQuantityFor(product.type))),
      price_seen: product.price,
      title: product.title,
      slug: product.slug,
      type: product.type,
    };
    const result = addItem(cart, { item, kind: product.kind }, now);
    if (result.status === "mixed_kind" || result.status === "too_many_lines") {
      skipped += 1;
      continue;
    }
    cart = result.cart;
    added += 1;
  }
  return { cart, added, skipped };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Товар по slug: null — не найден (404 или нет slug); сеть/5xx → throw (корзина не меняется, toast «Повторите»). */
async function fetchProduct(slug: string | null, fetchImpl: FetchLike): Promise<ReorderProduct | null> {
  if (!slug) return null;
  const res = await fetchImpl(`/api/products/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`products ${res.status}`);
  return parseReorderProduct(await res.json());
}

export async function loadReorderLines(
  items: readonly OrderViewItem[], fetchImpl: FetchLike = (input, init) => fetch(input, init),
): Promise<ReorderLine[]> {
  return Promise.all(
    items.map(async (item) => ({ quantity: item.quantity, product: await fetchProduct(item.product_slug, fetchImpl) })),
  );
}
