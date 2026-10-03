import { CircleX, Undo2 } from "lucide-react";
import { ReorderButton } from "@/components/shop/order/ReorderButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cancelledText, refundedText } from "@/lib/order-page-view";
import type { OrderView } from "@/types/order-view";

interface OrderStateAlertProps {
  view: OrderView;
}

/** Отменённый заказ: «Заказ отменён: <причина>» + «Оформить заново»; возвращённый: сумма и срок зачисления. */
export function OrderStateAlert({ view }: OrderStateAlertProps) {
  if (view.status === "cancelled") {
    return (
      <Alert variant="destructive" data-testid="cancelled-alert">
        <CircleX aria-hidden />
        <AlertDescription className="text-foreground">
          <p className="font-medium text-destructive">{cancelledText(view.cancel_reason)}</p>
          <ReorderButton view={view} />
        </AlertDescription>
      </Alert>
    );
  }
  if (view.status === "refunded") {
    return (
      <Alert data-testid="refunded-alert">
        <Undo2 aria-hidden />
        <AlertDescription className="text-foreground">{refundedText(view.refunded_amount_formatted)}</AlertDescription>
      </Alert>
    );
  }
  return null;
}
