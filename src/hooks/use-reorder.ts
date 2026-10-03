"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { readCart, writeCart } from "@/hooks/use-cart";
import {
  REORDER_FAILED_MESSAGE, REORDER_NO_ITEMS_MESSAGE, REORDER_PARTIAL_MESSAGE, loadReorderLines, planReorder,
} from "@/lib/order-page-reorder";
import type { OrderView } from "@/types/order-view";

/** «Оформить заново»: позиции заказа → корзина (по product_slug) → /cart. Позиции без slug пропускаются с toast. */
export function useReorder(view: OrderView) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const reorder = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const lines = await loadReorderLines(view.items);
      const plan = planReorder(readCart(), view.kind, lines);
      if (plan.added === 0) {
        toast.error(REORDER_NO_ITEMS_MESSAGE);
        return;
      }
      writeCart(plan.cart);
      if (plan.skipped > 0) toast(REORDER_PARTIAL_MESSAGE);
      router.push("/cart");
    } catch {
      toast.error(REORDER_FAILED_MESSAGE);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return { busy, reorder };
}
