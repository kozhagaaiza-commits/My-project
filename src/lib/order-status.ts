import { orderStatusLabel } from "@/lib/order-labels";
import type { OrderKind, OrderStatus } from "@/types/order-view";

// Допустимые переходы статусов заказа (Чертёж 5.3; BR-12, BR-19; US-007). Таблица — дословно из Чертежа,
// типы сужены: вместо Record<string, string[]> — статусы заказа. Без server-only: таблицу читают и API, и кнопки админки.
//  - paid ставит только webhook ЮKassa / сверка (mark_order_paid), refunded — только обработчик возврата
//    (из любого статуса после paid) — в таблице этих целей нет;
//  - cancelled — только из pending_payment (BR-19): оплаченный заказ отменяется возвратом.

export const TRANSITIONS: Record<OrderKind, Partial<Record<OrderStatus, readonly OrderStatus[]>>> = {
  stock: {
    pending_payment: ["cancelled"],          // paid — только webhook
    paid: ["confirmed"],
    confirmed: ["shipped"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: [],
    refunded: [],
  },
  preorder: {
    pending_payment: ["cancelled"],
    paid: ["ordered_from_supplier"],
    ordered_from_supplier: ["in_transit"],
    in_transit: ["arrived"],
    arrived: ["shipped"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: [],
    refunded: [],
  },
};
// refunded достигается только из refund-обработчика из любого статуса после paid.

/** Куда админ может перевести заказ из текущего статуса (кнопки на /admin/orders/[id], PATCH …/status). Копия массива. */
export const allowedTransitions = (kind: OrderKind, status: string): OrderStatus[] =>
  [...((TRANSITIONS[kind] as Record<string, readonly OrderStatus[] | undefined>)[status] ?? [])];

export const canTransition = (kind: OrderKind, from: string, to: string): boolean =>
  allowedTransitions(kind, from).some((s) => s === to);

/** Текст 409 INVALID_STATUS_TRANSITION (Блок 3): «Из статуса «Оплачен» нельзя перейти в «Доставлен»». */
export const invalidTransitionMessage = (from: string, to: string): string =>
  `Из статуса «${orderStatusLabel(from)}» нельзя перейти в «${orderStatusLabel(to)}»`;
