import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/types/order-view";

interface OrderHeaderProps {
  number: string;
  status: OrderStatus;
  statusLabel: string;
}

const BADGE_VARIANT: Partial<Record<OrderStatus, "secondary" | "destructive">> = {
  pending_payment: "secondary",
  cancelled: "destructive",
  refunded: "destructive",
};

/** Заголовок «Заказ FC-26-000123» (номер — mono) + Badge статуса. */
export function OrderHeader({ number, status, statusLabel }: OrderHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
        Заказ <span className="font-mono">{number}</span>
      </h1>
      <Badge variant={BADGE_VARIANT[status] ?? "default"} data-testid="order-status-badge">
        {statusLabel}
      </Badge>
    </header>
  );
}
