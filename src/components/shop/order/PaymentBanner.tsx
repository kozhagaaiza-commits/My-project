"use client";

import { CircleAlert, Loader2 } from "lucide-react";
import { ReorderButton } from "@/components/shop/order/ReorderButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useNowMs } from "@/hooks/use-now";
import { ORDER_NOT_PAYABLE_MESSAGE } from "@/lib/order-page-api";
import { reserveText } from "@/lib/order-page-format";
import { unpaidBannerText } from "@/lib/order-page-view";
import { POLL_FAILED_MESSAGE, type PollPhase } from "@/lib/order-page-poll";
import type { OrderView } from "@/types/order-view";

interface PaymentBannerProps {
  view: OrderView;
  phase: PollPhase;
  /** Покупатель вернулся с ЮKassa (?from=payment). */
  fromPayment: boolean;
  paying: boolean;
  onPay: () => void;
}

/**
 * Блок оплаты для заказа в pending_payment. После возврата с ЮKassa — «Проверяем оплату…» (опрос), затем
 * «Оплата пока не поступила» (без возврата с ЮKassa — нейтральное «Заказ ожидает оплаты») + единственная жёлтая «Оплатить» и таймер брони. Бронь истекла — «Оформить заново».
 */
export function PaymentBanner({ view, phase, fromPayment, paying, onPay }: PaymentBannerProps) {
  const nowMs = useNowMs();
  const now = nowMs === null ? null : new Date(nowMs);
  const timer = now ? reserveText(view.reserved_until, now) : null;
  const reserveEnded = now !== null && view.reserved_until !== null && timer === null;

  if (phase === "checking") {
    return (
      <Alert role="status" aria-live="polite" data-testid="payment-banner-checking">
        <Loader2 className="animate-spin" aria-hidden />
        <AlertDescription className="text-foreground">Проверяем оплату…</AlertDescription>
      </Alert>
    );
  }
  if (phase === "failed") {
    return (
      <Alert variant="destructive" data-testid="payment-banner-failed">
        <CircleAlert aria-hidden />
        <AlertDescription className="text-destructive">{POLL_FAILED_MESSAGE}</AlertDescription>
      </Alert>
    );
  }
  const expired = !view.can_pay || reserveEnded;
  return (
    <Alert data-testid="payment-banner-unpaid">
      <CircleAlert aria-hidden />
      <AlertDescription className="text-foreground">
        <p className="font-medium">{expired ? ORDER_NOT_PAYABLE_MESSAGE : unpaidBannerText(fromPayment)}</p>
        {!expired && timer && <p className="text-muted-foreground" data-testid="reserve-timer">{timer}</p>}
        {expired ? (
          <ReorderButton view={view} />
        ) : (
          <Button type="button" disabled={paying} onClick={onPay} className="mt-2 w-full sm:w-fit">
            {paying && <Loader2 className="animate-spin" aria-hidden />}
            Оплатить
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
