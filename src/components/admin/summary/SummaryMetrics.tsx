import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FEATURE_ATELIER } from "@/lib/config";
import type { AdminSummary } from "@/lib/admin-ui/types";
import { cn } from "@/lib/utils";

interface Metric {
  label: string;
  value: number;
  href: string;
  attention?: boolean;
}

function buildMetrics(s: AdminSummary): Metric[] {
  const metrics: Metric[] = [
    { label: "К обработке", value: s.orders_to_process, href: "/admin/orders?status=paid" },
    { label: "Требуют внимания", value: s.orders_attention, href: "/admin/orders?attention=true", attention: true },
    { label: "Под заказ в пути", value: s.preorders_in_progress, href: "/admin/orders?status=preorder" },
  ];
  if (FEATURE_ATELIER) metrics.push({ label: "Заявки ателье", value: s.ateliers_pending, href: "/admin/ateliers" });
  return metrics;
}

/** 4 метрики-ссылки в отфильтрованный список; desktop — 4 колонки, tablet — 2, mobile — 1 (Блок 4). */
export function SummaryMetrics({ summary }: { summary: AdminSummary }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {buildMetrics(summary).map((m) => {
        const alert = m.attention && m.value > 0;
        return (
          <li key={m.label}>
            <Link
              href={m.href}
              className="block rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Card
                className={cn(
                  "gap-2 p-5 transition-colors hover:bg-muted",
                  alert && "border-destructive",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                  {m.label}
                  {m.attention && <TriangleAlert className={cn("size-4", alert && "text-destructive")} aria-hidden />}
                </span>
                <span className={cn("font-mono text-3xl font-semibold tabular-nums", alert && "text-destructive")}>
                  {m.value}
                </span>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
