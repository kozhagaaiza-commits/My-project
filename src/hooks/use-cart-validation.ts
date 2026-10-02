"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { readCart, useCart, writeCart } from "@/hooks/use-cart";
import { validateCart } from "@/lib/cart-api";
import { qtyReducedMessage, reconcileCart, validationKey } from "@/lib/cart-store";
import type { CartValidation } from "@/types/cart";

export const QUANTITY_DEBOUNCE_MS = 400;

export interface CartValidationState {
  /** idle — корзина пуста; loading — ответа ещё не было; ready — данные актуальны; error — validate не ответил. */
  status: "idle" | "loading" | "ready" | "error";
  /** Последний успешный ответ (при refreshing — уже устаревший для текущего количества). */
  data: CartValidation | null;
  /** Количество изменилось, ответ на новое состояние ещё не пришёл. */
  refreshing: boolean;
  retry: () => void;
}

interface Settled {
  key: string;
  failed: boolean;
  data: CartValidation | null;
}

/**
 * Проверка корзины (POST /api/cart/validate) при открытии и после каждого изменения состава/количества
 * (debounce 400 мс). Ответ приводит корзину в порядок: уменьшенное количество записывается обратно + toast.
 * Статус выводится из ключа запроса (без setState в теле эффекта).
 */
export function useCartValidation(): CartValidationState {
  const { cart, ready } = useCart();
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const hasData = useRef(false);
  const skipKey = useRef<string | null>(null);

  const key = !ready || cart.items.length === 0 ? null : `${attempt}:${validationKey(cart)}`;

  useEffect(() => {
    if (key === null) return;
    if (skipKey.current === key) {
      skipKey.current = null; // ответ на этот состав уже получен (количество скорректировано по ответу)
      return;
    }
    const controller = new AbortController();
    const delay = hasData.current ? QUANTITY_DEBOUNCE_MS : 0;
    const timer = setTimeout(async () => {
      const items = readCart().items;
      if (items.length === 0) return;
      const result = await validateCart(items, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setSettled((prev) => ({ key, failed: true, data: prev?.data ?? null }));
        return;
      }
      hasData.current = true;
      const { cart: next, changed, reduced } = reconcileCart(readCart(), result.data);
      let settledKey = key;
      if (changed) {
        const nextKey = `${attempt}:${validationKey(next)}`;
        if (nextKey !== key) {
          skipKey.current = nextKey;
          settledKey = nextKey;
        }
        writeCart(next);
      }
      reduced.forEach((r) => toast(qtyReducedMessage(r.quantity, r.type), { id: `qty-reduced-${r.product_id}` }));
      setSettled({ key: settledKey, failed: false, data: result.data });
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (key === null) return { status: "idle", data: null, refreshing: false, retry };
  if (settled?.key !== key) {
    const data = settled?.data ?? null;
    return data
      ? { status: "ready", data, refreshing: true, retry }
      : { status: "loading", data: null, refreshing: false, retry };
  }
  return settled.failed
    ? { status: "error", data: settled.data, refreshing: false, retry }
    : { status: "ready", data: settled.data, refreshing: false, retry };
}
