import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatOrderDate } from "@/lib/order-page-format";
import type { AccountOrder } from "@/types/account";

/** Позиции: «1 позиция», «2 позиции», «5 позиций». */
export function positionsLabel(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} позиций`;
  if (mod10 === 1) return `${n} позиция`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} позиции`;
  return `${n} позиций`;
}

/** Desktop/tablet: Номер (ссылка), Дата, Состав, Сумма, Статус. На mobile скрыта — список карточек. */
export function OrdersTable({ orders }: { orders: AccountOrder[] }) {
  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Номер</TableHead>
            <TableHead>Дата</TableHead>
            <TableHead>Состав</TableHead>
            <TableHead className="text-right">Сумма</TableHead>
            <TableHead>Статус</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => (
            <TableRow key={o.number}>
              <TableCell>
                <Link href={o.url} className="font-mono underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {o.number}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatOrderDate(o.created_at)}</TableCell>
              <TableCell>{positionsLabel(o.items_count)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{o.total_formatted}</TableCell>
              <TableCell><Badge variant="outline">{o.status_label}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
