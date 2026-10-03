import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { AdminSummary } from "@/lib/admin-ui/types";

/** «Месяц»: оплаченные заказы «7 из 15» + Progress и выручка (revenue_formatted из ответа). */
export function SummaryMonthCard({ month }: { month: AdminSummary["month"] }) {
  const percent = month.goal_orders > 0 ? Math.min(100, Math.round((month.paid_orders / month.goal_orders) * 100)) : 0;
  return (
    <Card className="gap-4 p-5">
      <h2 className="text-lg font-semibold">Месяц</h2>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Оплаченные заказы</p>
        <p className="font-mono text-2xl font-semibold tabular-nums">
          {month.paid_orders} из {month.goal_orders}
        </p>
        <Progress value={percent} aria-label="Выполнение плана по заказам за месяц" />
      </div>
      <p className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Выручка</span>
        <span className="font-mono text-base font-medium tabular-nums">{month.revenue_formatted}</span>
      </p>
    </Card>
  );
}
