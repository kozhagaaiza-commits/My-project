import { MAX_CARBON_QTY_PER_LINE, MAX_WHEEL_SETS_PER_LINE } from "@/lib/config";
import { formatRub } from "@/lib/money";
import type { CartKind, CartProblem, CartProduct, CartRequestItem, CartValidateItem, CartValidation } from "@/types/cart";
import type { ProductType } from "@/types/catalog";

// Чистая логика POST /api/cart/validate (Блок 3; BR-03, BR-04, BR-05, BR-07, BR-11; Edge Cases 12, 13).
// Без БД и env: товары приходят из getCartProducts() (только active, unit_price уже по уровню цены).
//
// Приоритет проблем позиции: unavailable > mixed_kind > out_of_stock > qty_reduced.
// can_checkout = false при любой проблеме, кроме qty_reduced, и для пустой корзины.
// subtotal — только по позициям, которые можно купить (problem null или qty_reduced);
// у исключённых (out_of_stock, mixed_kind) line_total показывает цену позиции, но в сумму не входит.

/** Лимит количества одной позиции по типу товара (BR-04). */
export const qtyLimitFor = (type: ProductType): number =>
  type === "wheel_set" ? MAX_WHEEL_SETS_PER_LINE : MAX_CARBON_QTY_PER_LINE;

/** Позиция, товара которой нет среди active (снят с продажи / не существует): title и slug подставит клиент. */
function unavailableItem(item: CartRequestItem): CartValidateItem {
  return {
    product_id: item.product_id, slug: "", title: "", cover_image_url: null,
    quantity: item.quantity, max_quantity: 0,
    unit_price: 0, unit_price_formatted: formatRub(0), line_total: 0, line_total_formatted: formatRub(0),
    available: false, available_qty: 0, problem: "unavailable",
  };
}

function productItem(item: CartRequestItem, p: CartProduct, kind: CartKind): CartValidateItem {
  const isStock = p.availability_mode === "stock";
  const availableQty = isStock ? Math.max(p.available_qty ?? 0, 0) : null;
  const maxQuantity = availableQty === null ? qtyLimitFor(p.type) : Math.min(qtyLimitFor(p.type), availableQty);
  const available = availableQty === null || availableQty > 0;

  let problem: CartProblem | null = null;
  let quantity = item.quantity;
  if (p.availability_mode !== kind) problem = "mixed_kind";
  else if (!available) problem = "out_of_stock";
  // Количество уменьшается до допустимого всегда, кроме out_of_stock (там допустимо 0 — позицию удаляют).
  if (available && quantity > maxQuantity) {
    quantity = maxQuantity;
    problem ??= "qty_reduced";
  }

  const lineTotal = p.unit_price * quantity;
  return {
    product_id: p.id, slug: p.slug, title: p.title, cover_image_url: p.cover_image_url,
    quantity, max_quantity: maxQuantity,
    unit_price: p.unit_price, unit_price_formatted: formatRub(p.unit_price),
    line_total: lineTotal, line_total_formatted: formatRub(lineTotal),
    available, available_qty: availableQty, problem,
  };
}

const purchasable = (i: CartValidateItem) => i.problem === null || i.problem === "qty_reduced";

export function buildCartValidation(
  items: CartRequestItem[],
  products: CartProduct[],
  priceTier: CartValidation["price_tier"],
): CartValidation {
  const byId = new Map(products.map((p) => [p.id, p] as const));
  // Тип корзины — по первому найденному товару в порядке запроса (BR-03); ни одного — "stock".
  const first = items.map((i) => byId.get(i.product_id)).find((p) => p !== undefined);
  const kind: CartKind = first?.availability_mode ?? "stock";

  const lines = items.map((item) => {
    const p = byId.get(item.product_id);
    return p ? productItem(item, p, kind) : unavailableItem(item);
  });

  const subtotal = lines.filter(purchasable).reduce((sum, i) => sum + i.line_total, 0);
  const deliveryPrice = 0 as const; // BR-11: доставка бесплатна
  const total = subtotal + deliveryPrice;
  return {
    kind,
    items: lines,
    subtotal, subtotal_formatted: formatRub(subtotal),
    delivery_price: deliveryPrice,
    total, total_formatted: formatRub(total),
    can_checkout: lines.length > 0 && lines.every(purchasable),
    price_tier: priceTier,
  };
}
