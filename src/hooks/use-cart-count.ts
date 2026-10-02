"use client";

import { useSyncExternalStore } from "react";

const KEY = "fc_cart_v1";

// Считает количество штук в корзине localStorage.fc_cart_v1 { kind, items: [{ product_id, quantity, price_seen }], updated_at }.
// Повреждённые данные = пустая корзина (Edge Case 17). Корзина — День 3, здесь только счётчик для шапки.
function readCount(): number {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return 0;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return 0;
    const items = (value as { items?: unknown }).items;
    if (!Array.isArray(items)) return 0;
    return items.reduce<number>((sum, item) => {
      const q: unknown = typeof item === "object" && item !== null ? (item as { quantity?: unknown }).quantity : 0;
      return sum + (typeof q === "number" && Number.isInteger(q) && q > 0 ? q : 0);
    }, 0);
  } catch {
    return 0;
  }
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("fc:cart-change", onChange); // событие для будущего useCart (День 3)
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("fc:cart-change", onChange);
  };
}

export function useCartCount(): number {
  return useSyncExternalStore(subscribe, readCount, () => 0);
}
