"use client";

import { useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { CancelOrderDialog } from "@/components/admin/orders/detail/CancelOrderDialog";
import { RefundDialog } from "@/components/admin/orders/detail/RefundDialog";
import { ShipDialog } from "@/components/admin/orders/detail/ShipDialog";
import { Button } from "@/components/ui/button";
import type { OrderActions as Actions } from "@/hooks/use-admin-order-actions";
import { transitionLabel } from "@/lib/admin-ui/order-ui";
import type { AdminOrderDetail, OrderStatus } from "@/lib/admin-ui/types";

interface OrderActionsProps {
  order: AdminOrderDetail;
  actions: Actions;
}

type DialogKind = "ship" | "cancel" | "refund" | null;

/**
 * Кнопки допустимых переходов (основная — default, остальные outline) и «Оформить возврат».
 * Mobile/tablet: панель прибита к низу экрана ([data-sticky-panel]); desktop — в шапке.
 */
export function OrderActions({ order, actions }: OrderActionsProps) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [running, setRunning] = useState<OrderStatus | null>(null);
  const transitions = order.allowed_transitions;
  const primary = transitions.find((t) => t !== "cancelled");
  const canRefund = order.refundable_amount > 0;
  if (transitions.length === 0 && !canRefund) return null;

  async function go(status: OrderStatus) {
    if (status === "shipped") return setDialog("ship");
    if (status === "cancelled") return setDialog("cancel");
    setRunning(status);
    try {
      await actions.changeStatus({ to_status: status }, { success: "Статус обновлён" });
    } finally {
      setRunning(null);
    }
  }

  const close = (open: boolean) => !open && setDialog(null);

  return (
    <>
      <div
        data-sticky-panel
        className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap gap-2 border-t border-border bg-background/95 p-3 backdrop-blur max-md:[&>button]:flex-1 lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
      >
        {transitions.map((status) => (
          <Button
            key={status}
            type="button"
            variant={status === primary ? "default" : "outline"}
            disabled={actions.busy}
            onClick={() => go(status)}
          >
            {running === status && <Loader2 className="animate-spin" aria-hidden />}
            {transitionLabel(status)}
          </Button>
        ))}
        {canRefund && (
          <Button type="button" variant="outline" disabled={actions.busy} onClick={() => setDialog("refund")}>
            <Undo2 aria-hidden />
            Оформить возврат
          </Button>
        )}
      </div>
      {dialog === "ship" && <ShipDialog order={order} open onOpenChange={close} changeStatus={actions.changeStatus} />}
      {dialog === "cancel" && (
        <CancelOrderDialog number={order.number} open onOpenChange={close} changeStatus={actions.changeStatus} />
      )}
      {dialog === "refund" && <RefundDialog order={order} open onOpenChange={close} refund={actions.refund} />}
    </>
  );
}
