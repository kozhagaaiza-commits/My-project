import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/admin-ui/format";
import type { AdminOrderDetail } from "@/lib/admin-ui/types";
import { formatRub } from "@/lib/money";
import { cn } from "@/lib/utils";

const PAYMENT_METHODS: Record<string, string> = { sbp: "СБП", bank_card: "Карта" };

/** «Платежи и возвраты»: сводка сумм и две таблицы. */
export function OrderPaymentsCard({ order, className }: { order: AdminOrderDetail; className?: string }) {
  return (
    <Card className={cn("gap-4 p-5", className)}>
      <h2 className="text-lg font-semibold">Платежи и возвраты</h2>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {[
          ["Оплачено", order.paid_amount],
          ["Возвращено", order.refunded_amount],
          ["К возврату", order.refundable_amount],
        ].map(([term, kopecks]) => (
          <div key={term} className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{term}</dt>
            <dd className="font-mono whitespace-nowrap tabular-nums">{formatRub(Number(kopecks))}</dd>
          </div>
        ))}
      </dl>
      {order.payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Платежей нет</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Платёж</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.payments.map((p) => (
              <TableRow key={p.yookassa_payment_id}>
                <TableCell className="whitespace-normal">
                  <div className="font-mono text-xs break-all">{p.yookassa_payment_id}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.status}{p.method ? ` · ${PAYMENT_METHODS[p.method] ?? p.method}` : ""} · {formatDateTime(p.created_at)}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono whitespace-nowrap tabular-nums">{p.amount_formatted}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {order.refunds.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Возврат</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.refunds.map((r, i) => (
              <TableRow key={`${r.created_at}-${i}`}>
                <TableCell className="whitespace-normal">
                  <div className="text-sm">{r.reason ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.status} · {formatDateTime(r.created_at)}
                  </div>
                  {r.error_message && <div className="text-xs text-destructive">{r.error_message}</div>}
                </TableCell>
                <TableCell className="text-right font-mono whitespace-nowrap tabular-nums">{r.amount_formatted}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
