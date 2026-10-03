import Link from "next/link";
import { OrderAttentionIcon } from "@/components/admin/orders/OrderAttentionIcon";
import { OrderStatusBadge } from "@/components/admin/orders/OrderStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatOrderDate } from "@/lib/admin-ui/format";
import { KIND_LABELS } from "@/lib/admin-ui/order-ui";
import type { AdminOrderListItem } from "@/lib/admin-ui/types";

/** Mobile (< md): список Card вместо таблицы. */
export function OrdersCardList({ orders }: { orders: AdminOrderListItem[] }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/admin/orders/${o.id}`} className="block rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
            <Card className="gap-2 p-4 transition-colors hover:bg-muted">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-mono text-sm">
                  {o.number}
                  {o.needs_attention && <OrderAttentionIcon reason={o.attention_reason} />}
                </span>
                <OrderStatusBadge status={o.status} label={o.status_label} />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{o.customer_name}</span>
                <span className="font-mono text-sm tabular-nums">{o.total_formatted}</span>
              </div>
              <p className="truncate text-xs text-muted-foreground">{o.delivery_label}</p>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">{formatOrderDate(o.created_at)}</span>
                <Badge variant="outline">{KIND_LABELS[o.kind]}</Badge>
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
