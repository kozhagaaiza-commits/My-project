import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { specLines } from "@/lib/admin-ui/specs";
import type { AdminOrderDetail } from "@/lib/admin-ui/types";
import { cn } from "@/lib/utils";

/** «Позиции»: таблица с specs (mono) для сверки инженером. */
export function OrderItemsCard({ order, className }: { order: AdminOrderDetail; className?: string }) {
  return (
    <Card className={cn("min-w-0 gap-4 p-5", className)}>
      <h2 className="text-lg font-semibold">Позиции</h2>
      <Table className="min-w-[34rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Позиция</TableHead>
            <TableHead className="text-right">Кол-во</TableHead>
            <TableHead className="text-right">Цена</TableHead>
            <TableHead className="text-right">Сумма</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {order.items.map((item, i) => (
            <TableRow key={`${item.sku}-${i}`}>
              <TableCell className="max-w-80 whitespace-normal">
                <div className="font-medium">{item.title}</div>
                <div className="font-mono text-xs text-muted-foreground">{item.sku}</div>
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs text-silver">
                  {specLines(item.specs).map((s) => (
                    <li key={s.key}>
                      {s.label} {s.value}
                    </li>
                  ))}
                </ul>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{item.quantity}</TableCell>
              <TableCell className="text-right font-mono whitespace-nowrap tabular-nums">{item.unit_price_formatted}</TableCell>
              <TableCell className="text-right font-mono whitespace-nowrap tabular-nums">{item.line_total_formatted}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3} className="text-right">Итого</TableCell>
            <TableCell className="text-right font-mono whitespace-nowrap tabular-nums">{order.total_formatted}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Card>
  );
}
