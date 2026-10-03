"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReorder } from "@/hooks/use-reorder";
import type { OrderView } from "@/types/order-view";

interface ReorderButtonProps {
  view: OrderView;
}

/** default «Оформить заново»: позиции заказа возвращаются в корзину по product_slug. */
export function ReorderButton({ view }: ReorderButtonProps) {
  const { busy, reorder } = useReorder(view);
  return (
    <Button type="button" disabled={busy} onClick={() => void reorder()} className="mt-2 w-full sm:w-fit">
      {busy && <Loader2 className="animate-spin" aria-hidden />}
      Оформить заново
    </Button>
  );
}
