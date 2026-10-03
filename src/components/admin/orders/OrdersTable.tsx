"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrderAttentionIcon } from "@/components/admin/orders/OrderAttentionIcon";
import { OrderStatusBadge } from "@/components/admin/orders/OrderStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatOrderDate } from "@/lib/admin-ui/format";
import { KIND_LABELS } from "@/lib/admin-ui/order-ui";
import type { AdminOrderListItem } from "@/lib/admin-ui/types";

/** Desktop/tablet: на tablet скрыты «Доставка» и «Тип». Клик по строке — в карточку заказа. */
export function OrdersTable({ orders }: { orders: AdminOrderListItem[] }) {
  const router = useRouter();
  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Номер</TableHead>
            <TableHead>Дата</TableHead>
            <TableHead>Клиент</TableHead>
            <TableHead className="hidden lg:table-cell">Доставка</TableHead>
            <TableHead className="text-right">Сумма</TableHead>
            <TableHead className="hidden lg:table-cell">Тип</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead className="w-8"><span className="sr-only">Внимание</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => (
            <TableRow key={o.id} className="cursor-pointer" onClick={() => router.push(`/admin/orders/${o.id}`)}>
              <TableCell className="font-mono">
                <Link href={`/admin/orders/${o.id}`} onClick={(e) => e.stopPropagation()} className="text-silver underline-offset-4 hover:underline">
                  {o.number}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-muted-foreground tabular-nums">{formatOrderDate(o.created_at)}</TableCell>
              <TableCell>
                <div className="font-medium">{o.customer_name}</div>
                <div className="font-mono text-xs text-muted-foreground">{o.customer_phone}</div>
              </TableCell>
              <TableCell className="hidden max-w-56 truncate text-muted-foreground lg:table-cell" title={o.delivery_label}>
                {o.delivery_label}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{o.total_formatted}</TableCell>
              <TableCell className="hidden lg:table-cell">
                <Badge variant="outline">{KIND_LABELS[o.kind]}</Badge>
              </TableCell>
              <TableCell><OrderStatusBadge status={o.status} label={o.status_label} /></TableCell>
              <TableCell>{o.needs_attention && <OrderAttentionIcon reason={o.attention_reason} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
