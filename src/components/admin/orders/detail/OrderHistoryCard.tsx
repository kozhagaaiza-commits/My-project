import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/admin-ui/format";
import type { AdminOrderDetail } from "@/lib/admin-ui/types";
import { orderStatusLabel } from "@/lib/order-labels";
import { cn } from "@/lib/utils";

/** «История»: таймлайн history (новые сверху). */
export function OrderHistoryCard({ order, className }: { order: AdminOrderDetail; className?: string }) {
  const entries = [...order.history].reverse();
  return (
    <Card className={cn("gap-4 p-5", className)}>
      <h2 className="text-lg font-semibold">История</h2>
      <ol className="flex flex-col">
        {entries.map((h, i) => (
          <li key={`${h.created_at}-${h.to_status}`} className="relative flex gap-3 pb-5 last:pb-0">
            {i < entries.length - 1 && <span aria-hidden className="absolute top-3 bottom-0 left-[5px] w-px bg-border" />}
            <span aria-hidden className={cn("relative mt-1.5 size-[11px] shrink-0 rounded-full border border-silver bg-card", i === 0 && "bg-silver")} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium">{orderStatusLabel(h.to_status)}</span>
                <time dateTime={h.created_at} className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(h.created_at)}
                </time>
              </div>
              {h.note && <p className="text-sm text-muted-foreground">{h.note}</p>}
              <p className="text-xs text-muted-foreground">{h.changed_by_name ?? "Система"}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
