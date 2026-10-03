import Link from "next/link";
import type { ReactNode } from "react";
import { OrderStatusBadge } from "@/components/admin/orders/OrderStatusBadge";
import { formatDateTime } from "@/lib/admin-ui/format";
import type { AdminOrderDetail } from "@/lib/admin-ui/types";

interface OrderHeaderProps {
  order: AdminOrderDetail;
  actions: ReactNode;
}

/** Шапка: номер, Badge статуса, дата (создания — первая запись истории), кнопки переходов. */
export function OrderHeader({ order, actions }: OrderHeaderProps) {
  const created = formatDateTime(order.history[0]?.created_at ?? null);
  return (
    <header className="flex flex-col gap-3">
      <Link href="/admin/orders" className="w-fit text-sm text-silver underline-offset-4 hover:underline">
        К списку
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{order.number}</h1>
          <OrderStatusBadge status={order.status} />
          {created && <span className="font-mono text-sm text-muted-foreground tabular-nums">{created}</span>}
        </div>
        {actions}
      </div>
    </header>
  );
}
