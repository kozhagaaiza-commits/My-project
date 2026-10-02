"use client";

import { useCart } from "@/hooks/use-cart";

/** Количество штук в корзине для значка в шапке (до гидратации и на сервере — 0). */
export function useCartCount(): number {
  return useCart().count;
}
