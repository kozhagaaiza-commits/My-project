import { Circle, CircleCheck, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatStepDate } from "@/lib/order-page-format";
import { stepStates, type StepState } from "@/lib/order-page-view";
import { cn } from "@/lib/utils";
import type { OrderView } from "@/types/order-view";

interface OrderTimelineProps {
  view: OrderView;
  /** Строка «Ожидаемая доставка: …» под заголовком. */
  expected: string | null;
}

const ICON: Record<StepState, { Icon: typeof Circle; className: string; label: string }> = {
  done: { Icon: CircleCheck, className: "text-silver", label: "Выполнено" },
  current: { Icon: Clock, className: "text-foreground", label: "Текущий шаг" },
  upcoming: { Icon: Circle, className: "text-muted-foreground", label: "Впереди" },
};

/** Вертикальный список шагов: CircleCheck — выполнено, Clock — текущий, Circle — впереди; даты в МСК. */
export function OrderTimeline({ view, expected }: OrderTimelineProps) {
  const states = stepStates(view);
  return (
    <Card className="gap-4 p-5" role="region" aria-label="Ход заказа">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Ход заказа</h2>
        {expected && <p className="text-sm text-silver" data-testid="expected-date">{expected}</p>}
      </div>
      <ol className="flex flex-col">
        {view.timeline.map((step, i) => {
          const state = states[i];
          const { Icon, className, label } = ICON[state];
          const last = i === view.timeline.length - 1;
          const date = step.done ? formatStepDate(step.at) : "";
          return (
            <li
              key={step.status}
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
              className={cn("relative flex gap-3 pb-6", last && "pb-0")}
            >
              {!last && <span aria-hidden className="absolute top-6 bottom-0 left-3 w-px -translate-x-1/2 bg-border" />}
              <Icon className={cn("relative size-6 shrink-0 bg-card", className)} aria-hidden />
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
                <span className={cn("text-sm font-medium", state === "upcoming" && "text-muted-foreground")}>
                  {step.label}
                  <span className="sr-only"> — {label}</span>
                </span>
                {date && <time dateTime={step.at ?? undefined} className="font-mono text-xs text-muted-foreground tabular-nums">{date}</time>}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
