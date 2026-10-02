"use client";

import { CartCheckError } from "@/components/shop/cart/CartCheckError";
import { CartKindNote } from "@/components/shop/cart/CartKindNote";
import { CartLineItem } from "@/components/shop/cart/CartLineItem";
import type { CartView } from "@/hooks/use-cart-view";

interface CartLineListProps {
  view: CartView;
  onNavigate?: () => void;
}

/** Заметка по виду корзины, ошибка проверки и позиции — общий блок /cart и CartSheet. */
export function CartLineList({ view, onNavigate }: CartLineListProps) {
  const { validation, rows, cart } = view;
  const failed = validation.status === "error";
  return (
    <div className="flex flex-col gap-3">
      <CartKindNote kind={cart.kind} />
      {failed && <CartCheckError onRetry={validation.retry} />}
      <ul aria-label="Позиции корзины">
        {rows.map((row) => (
          <CartLineItem
            key={row.item.product_id}
            row={row}
            pricesLoading={validation.status === "loading"}
            refreshing={validation.refreshing}
            onQuantity={view.changeQuantity}
            onRemove={view.remove}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </div>
  );
}
