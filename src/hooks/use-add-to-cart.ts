"use client";

import { useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { addDialogReducer } from "@/hooks/add-dialog-state";
import { readCart, writeCart } from "@/hooks/use-cart";
import { setCartSheetOpen } from "@/hooks/use-cart-sheet";
import { reachGoal } from "@/lib/analytics";
import { CART_CHECK_FAILED, validateCart } from "@/lib/cart-api";
import {
  addItem, commitAdd, emptyCart, maxQuantityMessage, qtyReducedMessage, type AddInput,
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
  const [dialog, dispatch] = useReducer(addDialogReducer, null);
  const inFlight = useRef(false);
  const wanted = useRef(1);

  /** validate по составу корзины с новой позицией, затем запись поверх СВЕЖЕЙ корзины. */
  const finish = async (input: AddInput, replace: boolean) => {
    inFlight.current = true;
    setBusy(true);
    try {
      const requested = replace ? addItem(emptyCart(), input).cart : addItem(readCart(), input).cart;
      const res = await validateCart(requested.items);
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
      // Корзина могла измениться за время запроса (другая вкладка, Sheet) — добавляем поверх свежей.
      const done = commitAdd(replace ? emptyCart() : readCart(), input, line, res.data);
      if (done.status === "mixed_kind") {
        dispatch({ type: "open", which: "mixed" });
        return;
      }
      if (done.status === "too_many_lines") {
        toast("В заказе не больше 10 позиций", { id: "add-to-cart-max" });
        return;
      }
      writeCart(done.cart);
      reachGoal("add_to_cart");
      setCartSheetOpen(true);
      done.reduced.forEach((r) => toast(qtyReducedMessage(r.quantity, r.type), { id: `qty-reduced-${r.product_id}` }));
      if (done.reduced.length === 0 && done.status === "limited") {
        toast(maxQuantityMessage(done.max, product.type), { id: "add-to-cart-max" });
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const proceed = async (replace: boolean) => {
    const input: AddInput = {
      kind: product.kind,
      item: {
        product_id: product.id, quantity: wanted.current, price_seen: product.price,
        title: product.title, slug: product.slug, type: product.type, specs_short: product.specs_short ?? null,
      },
    };
    if (replace) {
      await finish(input, true);
      return;
    }
    const result = addItem(readCart(), input);
    if (result.status === "mixed_kind") {
      dispatch({ type: "open", which: "mixed" });
    } else if (result.status === "too_many_lines") {
      toast("В заказе не больше 10 позиций", { id: "add-to-cart-max" });
    } else if (result.status === "limited" && result.unchanged) {
      toast(maxQuantityMessage(result.max, product.type), { id: "add-to-cart-max" });
    } else {
      await finish(input, false);
    }
  };

  /** Нажатие «В корзину» с выбранным количеством. */
  const request = (quantity: number) => {
    if (inFlight.current) return;
    wanted.current = quantity;
    if (product.fits === false) dispatch({ type: "open", which: "misfit" });
    else void proceed(false);
  };

  const confirmMisfit = () => {
    dispatch({ type: "close", which: "misfit" });
    void proceed(false);
  };

  const resolveMixed = (replace: boolean) => {
    dispatch({ type: "close", which: "mixed" });
    if (replace) void proceed(true);
  };

  /** Адресное закрытие: onOpenChange(false) от одного диалога не трогает другой. */
  const closeDialog = (which: "misfit" | "mixed") => dispatch({ type: "close", which });

  return { busy, dialog, request, confirmMisfit, resolveMixed, closeDialog };
}
