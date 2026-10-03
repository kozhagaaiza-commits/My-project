"use client";

import { SummaryLowStockCard } from "@/components/admin/summary/SummaryLowStockCard";
import { SummaryMetrics } from "@/components/admin/summary/SummaryMetrics";
import { SummaryMonthCard } from "@/components/admin/summary/SummaryMonthCard";
import { SummaryRates } from "@/components/admin/summary/SummaryRates";
import { SummarySkeleton } from "@/components/admin/summary/SummarySkeleton";
import { SummaryNotifications } from "@/components/admin/summary/SummaryNotifications";
import { AdminErrorAlert } from "@/components/admin/layout/AdminErrorAlert";
import { useAdminResource } from "@/hooks/use-admin-resource";
import type { AdminSummary } from "@/lib/admin-ui/types";

export function SummaryScreen() {
  const { status, data, reload } = useAdminResource<AdminSummary, never>("/api/admin/summary");

  if (status === "error") return <AdminErrorAlert title="Не удалось загрузить сводку" onRetry={reload} />;
  if (!data) return <SummarySkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <SummaryNotifications failed={data.notifications_failed} />
      <SummaryRates ratesDate={data.rates_date} onRefreshed={reload} />
      <SummaryMetrics summary={data} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryMonthCard month={data.month} />
        <SummaryLowStockCard items={data.low_stock} />
      </div>
    </div>
  );
}
