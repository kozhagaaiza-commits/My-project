import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { AdminSummary } from "@/lib/admin-ui/types";

/** «Заканчиваются»: товары с available_qty ≤ 1, ссылка на редактирование. Пусто — «Остатки в норме». */
export function SummaryLowStockCard({ items }: { items: AdminSummary["low_stock"] }) {
  return (
    <Card className="gap-4 p-5">
      <h2 className="text-lg font-semibold">Заканчиваются</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Остатки в норме</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <li key={item.product_id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <Link
                href={`/admin/products/${item.product_id}`}
                className="line-clamp-2 text-sm text-silver underline-offset-4 hover:underline"
              >
                {item.title}
              </Link>
              <span className="shrink-0 font-mono text-sm text-muted-foreground tabular-nums">
                {item.available_qty} шт.
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
