"use client";

import Link from "next/link";
import { CartEmpty } from "@/components/shop/cart/CartEmpty";
import { CartLineList } from "@/components/shop/cart/CartLineList";
import { CartTotals } from "@/components/shop/cart/CartTotals";
import { CheckoutAction, checkoutHint } from "@/components/shop/cart/CheckoutAction";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { setCartSheetOpen, useCartSheetOpen } from "@/hooks/use-cart-sheet";
import { useCartView } from "@/hooks/use-cart-view";

const close = () => setCartSheetOpen(false);

/** Тело подключается только при открытом Sheet — validate не вызывается, пока корзину не открыли. */
function CartSheetBody() {
  const view = useCartView();
  const { validation, cart } = view;
  const failed = validation.status === "error";
  const hint = checkoutHint(view);
  const empty = view.ready && cart.items.length === 0;

  return (
    <>
      <SheetHeader>
        <SheetTitle>Корзина</SheetTitle>
        <SheetDescription className="sr-only">Позиции корзины и итог заказа</SheetDescription>
      </SheetHeader>
      {empty ? (
        <CartEmpty onNavigate={close} />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <CartLineList view={view} onNavigate={close} />
          </div>
          <SheetFooter className="border-t border-border">
            <CartTotals
              data={view.data}
              loading={validation.status === "loading"}
              failed={failed}
              refreshing={validation.refreshing}
            />
            <CheckoutAction view={view} onNavigate={close} className="w-full" />
            <Button asChild variant="outline" className="w-full">
              <Link href="/cart" onClick={close}>Перейти в корзину</Link>
            </Button>
            {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
          </SheetFooter>
        </>
      )}
    </>
  );
}

/** Выдвижная корзина (Sheet справа). Открывается из шапки и после «В корзину»; управляется use-cart-sheet. */
export function CartSheet() {
  const open = useCartSheetOpen();
  return (
    <Sheet open={open} onOpenChange={setCartSheetOpen}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        {open && <CartSheetBody />}
      </SheetContent>
    </Sheet>
  );
}
