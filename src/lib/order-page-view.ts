// Чистые функции представления страницы заказа (Блок 4 «Статус заказа»). Без React — тестируется node:test.
import { expectedDeliveryText, expectedReadyText } from "@/lib/order-page-format";
import { ORDER_STATUS_LABELS } from "@/lib/order-labels";
import type { OrderStatus, OrderView } from "@/types/order-view";

export type StepState = "done" | "current" | "upcoming";

/** Таймлайн показываем, если хоть один шаг выполнен (у не оплаченного/отменённого заказа он только шумит). */
export const hasTimelineProgress = (view: OrderView): boolean => view.timeline.some((s) => s.done);

/**
 * Состояние шагов: done — выполнен; current — первый невыполненный (ожидается), если заказ живой;
 * у отменённого и возвращённого заказа «текущего» шага нет.
 */
export function stepStates(view: OrderView): StepState[] {
  const terminal = view.status === "cancelled" || view.status === "refunded";
  let currentTaken = terminal;
  return view.timeline.map((step) => {
    if (step.done) return "done";
    if (currentTaken) return "upcoming";
    currentTaken = true;
    return "current";
  });
}

const BEFORE_ARRIVAL: ReadonlySet<OrderStatus> = new Set<OrderStatus>(["paid", "ordered_from_supplier", "in_transit"]);

/** «Ожидаемая доставка: 4–7 октября» (после отгрузки) или «Ожидаем на складе к 5 ноября» (preorder до прибытия). */
export function expectedDateText(view: OrderView, now: Date = new Date()): string | null {
  if (view.status === "cancelled" || view.status === "refunded" || view.status === "delivered") return null;
  const delivery = expectedDeliveryText(view.expected_delivery, now);
  if (delivery) return delivery;
  if (view.kind === "preorder" && BEFORE_ARRIVAL.has(view.status)) return expectedReadyText(view.expected_ready_at, now);
  return null;
}

/** Адрес или пункт выдачи одной строкой: «Казань · ПВЗ СДЭК KZN45» / «Москва · ул. Тверская, 12». */
export function deliveryPlace(view: OrderView): string {
  const { city, address, cdek_pvz_code } = view.delivery;
  const place = address ?? (cdek_pvz_code ? `ПВЗ СДЭК ${cdek_pvz_code}` : null);
  return place ? `${city} · ${place}` : city;
}

export const CANCELLED_FALLBACK = "Не оплачен за 30 минут";

/** 409 ORDER_NOT_PAYABLE: бронь истекла — заказ показывается отменённым (до следующей перезагрузки данных). */
export function markOrderExpired(view: OrderView): OrderView {
  return {
    ...view, status: "cancelled", status_label: ORDER_STATUS_LABELS.cancelled, can_pay: false, reserved_until: null,
    cancel_reason: view.cancel_reason ?? CANCELLED_FALLBACK,
  };
}

export const cancelledText = (reason: string | null): string => (reason ? `Заказ отменён: ${reason}` : "Заказ отменён");

export const refundedText = (formatted: string | null): string =>
  `Деньги возвращены${formatted ? `: ${formatted}` : ""}. Срок зачисления зависит от банка, обычно до 10 рабочих дней`;
