import type { DeliveryMethod, OrderKind, OrderStatus } from "@/types/order-view";

// Подписи статусов для покупателя (Чертёж 5.3) и шаги таймлайна (Блок 4 «Статус заказа»).
// Без server-only: используется и на сервере (страница, бот, письма), и в клиентских компонентах.

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Ожидает оплаты",
  paid: "Оплачен",
  confirmed: "Проверен инженером",
  ordered_from_supplier: "Заказан у поставщика",
  in_transit: "Едет в Москву",
  arrived: "Прибыл на склад",
  shipped: "Передан в доставку",
  delivered: "Доставлен",
  cancelled: "Отменён",
  refunded: "Деньги возвращены",
};

/** Шаги таймлайна по типу заказа (в порядке выполнения). */
export const TIMELINE_STEPS: Record<OrderKind, readonly OrderStatus[]> = {
  stock: ["paid", "confirmed", "shipped", "delivered"],
  preorder: ["paid", "ordered_from_supplier", "in_transit", "arrived", "shipped", "delivered"],
};

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  moscow_courier: "Курьер по Москве",
  cdek_pvz: "СДЭК — пункт выдачи",
  cdek_door: "СДЭК — до двери",
};

export const orderStatusLabel = (status: string): string =>
  (ORDER_STATUS_LABELS as Record<string, string>)[status] ?? status;

/** Статусы платежей и возвратов ЮKassa (админка). */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  succeeded: "Оплачен",
  pending: "В обработке",
  canceled: "Отменён",
  failed: "Ошибка",
};

export const REFUND_STATUS_LABELS: Record<string, string> = {
  succeeded: "Выполнен",
  pending: "В обработке",
  canceled: "Отменён",
  failed: "Ошибка",
};

export const paymentStatusLabel = (status: string): string => PAYMENT_STATUS_LABELS[status] ?? status;
export const refundStatusLabel = (status: string): string => REFUND_STATUS_LABELS[status] ?? status;
