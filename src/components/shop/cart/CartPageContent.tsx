"use client";

import { CartEmpty } from "@/components/shop/cart/CartEmpty";
import { CartLineList } from "@/components/shop/cart/CartLineList";
import { CartSummary } from "@/components/shop/cart/CartSummary";
import { Skeleton } from "@/components/ui/skeleton";
import { useCartView } from "@/hooks/use-cart-view";

function CartHydrating() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Загрузка корзины">
      {[0, 1].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-20 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Содержимое /cart: позиции из localStorage показываются сразу, цены — после ответа validate. */
export function CartPageContent() {
  const view = useCartView();
  if (!view.ready) return <CartHydrating />;
  if (view.cart.items.length === 0) return <CartEmpty />;
  return (
    <div className="grid gap-6 md:grid-cols-[7fr_5fr] md:items-start lg:grid-cols-[8fr_4fr] lg:gap-8">
      <CartLineList view={view} />
      <CartSummary view={view} />
    </div>
  );
}
