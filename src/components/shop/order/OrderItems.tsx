import Link from "next/link";
import { Card } from "@/components/ui/card";
import { OrderDeliveryInfo } from "@/components/shop/order/OrderDeliveryInfo";
import type { OrderView } from "@/types/order-view";

interface OrderItemsProps {
  view: OrderView;
}

/** «Состав заказа»: позиции (со ссылкой на товар, если он ещё в каталоге), итог, доставка и маскированные контакты. */
export function OrderItems({ view }: OrderItemsProps) {
  return (
    <Card className="gap-4 p-5" role="region" aria-label="Состав заказа">
      <h2 className="text-lg font-semibold">Состав заказа</h2>
      <ul className="flex flex-col gap-3">
        {view.items.map((item, i) => (
          <li key={`${item.product_slug ?? item.title}-${i}`} className="flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0">
              {item.product_slug ? (
                <Link href={`/product/${item.product_slug}`} className="text-foreground underline-offset-4 hover:underline">
                  {item.title}
                </Link>
              ) : (
                <span>{item.title}</span>
              )}
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                {item.quantity} × {item.unit_price_formatted}
              </p>
            </div>
            <span className="shrink-0 font-mono tabular-nums">{item.line_total_formatted}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-border pt-4">
        <span className="font-medium">Итого</span>
        <span className="font-mono text-lg font-semibold tabular-nums" data-testid="order-total">{view.total_formatted}</span>
      </div>
      <OrderDeliveryInfo view={view} />
    </Card>
  );
}
