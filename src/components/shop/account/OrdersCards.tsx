import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatOrderDate } from "@/lib/order-page-format";
import type { AccountOrder } from "@/types/account";

/** Mobile: таблица превращается в список Card (номер, статус, сумма, дата). */
export function OrdersCards({ orders }: { orders: AccountOrder[] }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {orders.map((o) => (
        <li key={o.number}>
          <Card className="relative py-4 transition-colors focus-within:ring-2 focus-within:ring-ring hover:border-silver/40">
            <CardContent className="flex flex-col gap-2 px-4">
              <div className="flex items-center justify-between gap-2">
                <Link href={o.url} className="font-mono text-sm after:absolute after:inset-0 focus-visible:outline-none">
                  {o.number}
                </Link>
                <Badge variant="outline">{o.status_label}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{formatOrderDate(o.created_at)}</span>
                <span className="font-mono tabular-nums">{o.total_formatted}</span>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
