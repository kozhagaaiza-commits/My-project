"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { readCart, writeCart } from "@/hooks/use-cart";
import { setCartSheetOpen } from "@/hooks/use-cart-sheet";
import { reachGoal } from "@/lib/analytics";
import { CART_CHECK_FAILED, validateCart } from "@/lib/cart-api";
import {
  addItem, maxQuantityMessage, qtyReducedMessage, reconcileCart, replaceWith, type AddResult, type Cart,
} from "@/lib/cart-store";
import type { CartKind } from "@/types/cart";
import type { ProductType } from "@/types/catalog";

export interface AddToCartProduct {
  id: string;
  slug: string;
  title: string;
  type: ProductType;
  /** availability.mode: корзина содержит товары одного kind (BR-03). */
  kind: CartKind;
  /** Актуальная цена (price_atelier ?? price), копейки — идёт в price_seen. */
  price: number;
  specs_short?: string | null;
  /** FitmentNote: false → сначала AlertDialog «не подходит». */
  fits: boolean | null;
}

export type AddDialog = "misfit" | "mixed" | null;

export const LAST_SET_BOOKED = "Последний комплект только что забронирован. Проверьте через 30 минут";
const MIXED_KIND = "Детали под заказ и диски из наличия оформляются разными заказами";

interface Options {
  /** Сервер вернул out_of_stock / available_qty = 0 — бейдж на странице меняется на «Нет в наличии». */
  onSoldOut: () => void;
}

/**
 * «В корзину» (US-002, Блок 4): подтверждение несовместимости → конфликт kind → validate с новой позицией →
 * запись в localStorage, CartSheet, цель Метрики. Повторные клики во время запроса игнорируются.
 */
export function useAddToCart(product: AddToCartProduct, { onSoldOut }: Options) {
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<AddDialog>(null);
  const inFlight = useRef(false);
  const wanted = useRef(1);

  const finish = async (candidate: AddResult) => {
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await validateCart(candidate.cart.items);
      if (!res.ok) {
        toast.error(res.kind === "api" ? res.message : CART_CHECK_FAILED, { id: "add-to-cart-error" });
        return;
      }
      const line = res.data.items.find((l) => l.product_id === product.id);
      if (!line || line.problem === "unavailable") {
        toast.error("Товар больше не продаётся", { id: "add-to-cart-error" });
        return;
      }
      if (line.problem === "out_of_stock" || line.available_qty === 0) {
        toast(LAST_SET_BOOKED, { id: "add-to-cart-error" });
        onSoldOut();
        return;
      }
      if (line.problem === "mixed_kind") {
        toast.error(MIXED_KIND, { id: "add-to-cart-error" });
        return;
      }
      // Количество — по ответу сервера (qty_reduced), цена, которую видит покупатель, — из ответа.
      const { cart: reconciled, reduced } = reconcileCart(candidate.cart, res.data);
      const cart: Cart = {
        ...reconciled,
        items: reconciled.items.map((i) => (i.product_id === product.id ? { ...i, price_seen: line.unit_price } : i)),
      };
      writeCart(cart);
      reachGoal("add_to_cart");
      setCartSheetOpen(true);
      reduced.forEach((r) => toast(qtyReducedMessage(r.quantity, r.type), { id: `qty-reduced-${r.product_id}` }));
      if (reduced.length === 0 && candidate.status === "limited") {
        toast(maxQuantityMessage(candidate.max, product.type), { id: "add-to-cart-max" });
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const proceed = async (replace: boolean) => {
    const item = {
      product_id: product.id, quantity: wanted.current, price_seen: product.price,
      title: product.title, slug: product.slug, type: product.type, specs_short: product.specs_short ?? null,
    };
    if (replace) {
      const cart = replaceWith(product.kind, [item]);
      await finish({ status: "added", cart, quantity: item.quantity, max: item.quantity, unchanged: false });
      return;
    }
    const result = addItem(readCart(), { item, kind: product.kind });
    if (result.status === "mixed_kind") {
      setDialog("mixed");
    } else if (result.status === "too_many_lines") {
      toast("В заказе не больше 10 позиций", { id: "add-to-cart-max" });
    } else if (result.status === "limited" && result.unchanged) {
      toast(maxQuantityMessage(result.max, product.type), { id: "add-to-cart-max" });
    } else {
      await finish(result);
    }
  };

  /** Нажатие «В корзину» с выбранным количеством. */
  const request = (quantity: number) => {
    if (inFlight.current) return;
    wanted.current = quantity;
    if (product.fits === false) setDialog("misfit");
    else void proceed(false);
  };

  const confirmMisfit = () => {
    setDialog(null);
    void proceed(false);
  };

  const resolveMixed = (replace: boolean) => {
    setDialog(null);
    if (replace) void proceed(true);
  };

  return { busy, dialog, request, confirmMisfit, resolveMixed, closeDialog: () => setDialog(null) };
}
