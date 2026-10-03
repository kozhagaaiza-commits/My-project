"use client";

import { CartTotals } from "@/components/shop/cart/CartTotals";
import { CheckoutAction, checkoutHint } from "@/components/shop/cart/CheckoutAction";
import { Card } from "@/components/ui/card";
import type { CartView } from "@/hooks/use-cart-view";

interface CartSummaryProps {
  view: CartView;
}

/**
 * Итог на /cart. Desktop/tablet — sticky Card справа; mobile — панель, прибитая к низу экрана
 * (итог + кнопка). data-sticky-panel добавляет нижний отступ странице (см. ShopLayout), чтобы подвал не перекрывался.
 */
export function CartSummary({ view }: CartSummaryProps) {
  const { validation, data } = view;
  const hint = checkoutHint(view);
  return (
    <Card
      data-sticky-panel
      className="gap-0 py-0 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:bg-background/95 max-md:backdrop-blur md:sticky md:top-20"
    >
      <div className="flex flex-col gap-4 p-4 max-md:flex-row max-md:items-center max-md:justify-between md:p-5">
        <div className="max-md:min-w-0 max-md:flex-1">
          <CartTotals
            data={data}
            loading={validation.status === "loading"}
            failed={validation.status === "error"}
            refreshing={validation.refreshing}
            compactOnMobile
          />
        </div>
        <div className="flex flex-col gap-2 max-md:shrink-0">
          <CheckoutAction view={view} className="w-full" />
          {hint && <p className="text-sm text-muted-foreground max-md:hidden">{hint}</p>}
          <p className="text-center text-xs text-muted-foreground max-md:hidden">Оплата картой или СБП</p>
        </div>
      </div>
      {hint && <p className="px-4 pb-3 text-xs text-muted-foreground md:hidden">{hint}</p>}
    </Card>
  );
}
