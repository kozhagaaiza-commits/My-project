import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant } from "@/lib/admin-ui/order-ui";
import type { OrderStatus } from "@/lib/admin-ui/types";
import { orderStatusLabel } from "@/lib/order-labels";

interface OrderStatusBadgeProps {
  status: OrderStatus;
  label?: string;
}

export function OrderStatusBadge({ status, label }: OrderStatusBadgeProps) {
  return <Badge variant={statusBadgeVariant(status)}>{label ?? orderStatusLabel(status)}</Badge>;
}
