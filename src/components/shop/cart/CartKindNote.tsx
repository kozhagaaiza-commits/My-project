import type { CartKind } from "@/types/cart";

interface CartKindNoteProps {
  kind: CartKind;
}

/** Заметка для корзины с товарами под заказ (Чертёж, Блок 4 «Корзина»). */
export function CartKindNote({ kind }: CartKindNoteProps) {
  if (kind !== "preorder") return null;
  return (
    <p className="rounded-md border border-border bg-card px-3 py-2 text-sm text-silver">
      Под заказ · 100% предоплата · срок поставки до 35 дней
    </p>
  );
}
