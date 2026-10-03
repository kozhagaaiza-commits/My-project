"use client";

import { toast } from "sonner";
import { readCart, removeCartItem, restoreCartItem, setCartQuantity, useCart, writeCart } from "@/hooks/use-cart";
import { useCartValidation, type CartValidationState } from "@/hooks/use-cart-validation";
import { reachGoal } from "@/lib/analytics";
import { acknowledgePrices, type Cart, type CartItem } from "@/lib/cart-store";
import type { CartValidateItem, CartValidation } from "@/types/cart";

export interface CartRow {
  item: CartItem;
  /** Строка ответа validate; null, пока ответа нет. */
  line: CartValidateItem | null;
}

export interface CartView {
  cart: Cart;
  ready: boolean;
  validation: CartValidationState;
  data: CartValidation | null;
  rows: CartRow[];
  /** Есть позиции out_of_stock / unavailable — оформление заблокировано до удаления. */
  hasUnavailable: boolean;
  /** Есть позиции другого типа (mixed_kind). */
  hasMixed: boolean;
  canCheckout: boolean;
  changeQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  /** «Оформить заказ»: цель Метрики + актуальные цены считаются увиденными. */
  startCheckout: () => void;
}

export const isUnavailableLine = (l: CartValidateItem | null): boolean =>
  l !== null && (l.problem === "out_of_stock" || l.problem === "unavailable");

/** Состояние корзины для /cart и CartSheet: позиции из localStorage + ответ validate + действия. */
export function useCartView(): CartView {
  const { cart, ready } = useCart();
  const validation = useCartValidation();
  const data = validation.status === "error" ? null : validation.data;

  const rows: CartRow[] = cart.items.map((item) => ({
    item,
    line: data?.items.find((l) => l.product_id === item.product_id) ?? null,
  }));
  const hasUnavailable = rows.some((r) => isUnavailableLine(r.line));
  const hasMixed = rows.some((r) => r.line?.problem === "mixed_kind");
  const canCheckout =
    validation.status === "ready" && !validation.refreshing && data !== null && data.can_checkout &&
    !hasUnavailable && !hasMixed;

  const remove = (productId: string) => {
    const removed = removeCartItem(productId);
    if (!removed) return;
    toast("Удалено", {
      id: `cart-removed-${productId}`,
      duration: 5000,
      action: { label: "Вернуть", onClick: () => restoreCartItem(removed) },
    });
  };

  const startCheckout = () => {
    reachGoal("checkout_started");
    if (data) writeCart(acknowledgePrices(readCart(), data));
  };

  return { cart, ready, validation, data, rows, hasUnavailable, hasMixed, canCheckout, changeQuantity: setCartQuantity, remove, startCheckout };
}
