import { ORDER_STATUS_LABELS } from "@/lib/order-labels";
import type { OrderStatus } from "@/types/order-view";

// Вкладки списка заказов (Чертёж, Блок 4 «Админка — Заказы»). key идёт в URL-параметр `status`.
export interface OrderTab {
  key: string;
  label: string;
  /** Статусы для запроса; пусто — «Все». Несколько — через запятую в `status`. */
  statuses: OrderStatus[];
}

export const ORDER_TABS: readonly OrderTab[] = [
  { key: "paid", label: "Оплачен", statuses: ["paid"] },
  { key: "confirmed", label: "Проверен", statuses: ["confirmed"] },
  { key: "preorder", label: "Под заказ", statuses: ["ordered_from_supplier", "in_transit", "arrived"] },
  { key: "shipped", label: "Отправлен", statuses: ["shipped"] },
  { key: "delivered", label: "Доставлен", statuses: ["delivered"] },
  { key: "pending_payment", label: "Ожидает оплаты", statuses: ["pending_payment"] },
  { key: "closed", label: "Отменён/возврат", statuses: ["cancelled", "refunded"] },
  { key: "all", label: "Все", statuses: [] },
];

export const DEFAULT_TAB = "all";
export const MIN_SEARCH_LENGTH = 3; // adminOrdersQuery.q: min(3)
export const ORDERS_PER_PAGE = 20;

export const isTabKey = (value: string | null): value is string => ORDER_TABS.some((t) => t.key === value);

/** Подпись кнопки перехода (Чертёж 5.3); отмена — действие, а не статус. */
export function transitionLabel(status: OrderStatus): string {
  return status === "cancelled" ? "Отменить заказ" : ORDER_STATUS_LABELS[status];
}

/** Вариант Badge статуса: без акцентных цветов (жёлтый — только кнопки, зелёный — только точка наличия). */
export function statusBadgeVariant(status: OrderStatus): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "paid":
      return "default";
    case "cancelled":
    case "refunded":
      return "destructive";
    case "pending_payment":
    case "delivered":
      return "outline";
    default:
      return "secondary";
  }
}

export const KIND_LABELS = { stock: "Наличие", preorder: "Под заказ" } as const;
