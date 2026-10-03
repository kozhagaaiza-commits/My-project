"use client";

import { CustomerNote } from "@/components/shop/order/CustomerNote";
import { OrderHeader } from "@/components/shop/order/OrderHeader";
import { OrderItems } from "@/components/shop/order/OrderItems";
import { OrderStateAlert } from "@/components/shop/order/OrderStateAlert";
import { OrderSupport } from "@/components/shop/order/OrderSupport";
import { OrderTimeline } from "@/components/shop/order/OrderTimeline";
import { PaymentBanner } from "@/components/shop/order/PaymentBanner";
import { TelegramBlock } from "@/components/shop/order/TelegramBlock";
import { TrackingCard } from "@/components/shop/order/TrackingCard";
import { useOrderPay } from "@/hooks/use-order-pay";
import { useOrderStatus } from "@/hooks/use-order-status";
import { usePaymentGoal } from "@/hooks/use-payment-goal";
import { expectedDateText, hasTimelineProgress } from "@/lib/order-page-view";
import type { OrderView } from "@/types/order-view";

interface OrderPageContentProps {
  initial: OrderView;
  /** Токен из ?t= (null — доступ владельца по сессии). */
  token: string | null;
  /** Возврат с ЮKassa (?from=payment). */
  fromPayment: boolean;
  /** TELEGRAM_BOT_USERNAME, прочитан на сервере. */
  botUsername: string;
}

/**
 * Статус заказа (Блок 4). Desktop — 2 колонки (таймлайн + трек 7/12, состав 5/12);
 * tablet/mobile — одна колонка: статус, баннер, таймлайн, трек, состав.
 */
export function OrderPageContent({ initial, token, fromPayment, botUsername }: OrderPageContentProps) {
  const { view, setView, phase } = useOrderStatus({ initial, token, fromPayment });
  const { paying, pay } = useOrderPay({ view, token, setView });
  usePaymentGoal(view.number, fromPayment, view.status);

  const expected = expectedDateText(view);
  const showTimeline = hasTimelineProgress(view);
  // Нет ни таймлайна, ни трека (не оплачен / отменён): состав занимает левую колонку, а не пустое место слева.
  const hasMain = showTimeline || view.tracking !== null || view.courier_note !== null;
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 md:gap-6 md:px-6 md:py-8">
      <OrderHeader number={view.number} status={view.status} statusLabel={view.status_label} />
      {view.status === "pending_payment" && <PaymentBanner view={view} phase={phase} paying={paying} onPay={pay} />}
      <OrderStateAlert view={view} />
      {view.customer_visible_note && <CustomerNote note={view.customer_visible_note} />}
      <div className="grid gap-5 md:gap-6 lg:grid-cols-12 lg:gap-8">
        {hasMain && (
          <div className="flex flex-col gap-5 md:gap-6 lg:col-span-7">
            {showTimeline && <OrderTimeline view={view} expected={expected} />}
            <TrackingCard tracking={view.tracking} courierNote={view.courier_note} />
          </div>
        )}
        <div className={`flex flex-col gap-5 md:gap-6 ${hasMain ? "lg:col-span-5" : "lg:col-span-7"}`}>
          <OrderItems view={view} />
          <TelegramBlock subscribed={view.telegram_subscribed} link={view.telegram_link} />
          <OrderSupport botUsername={botUsername} />
        </div>
      </div>
      {token && (
        <p className="text-sm text-muted-foreground" data-testid="save-link-hint">
          Сохраните эту ссылку — по ней всегда виден статус заказа
        </p>
      )}
    </div>
  );
}
