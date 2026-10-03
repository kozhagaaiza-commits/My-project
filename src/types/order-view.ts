// Контракт страницы заказа (Чертёж, Блок 3: GET /api/orders/[number]; Блок 4 «Статус заказа»; US-004, US-005).
// Деньги — целые копейки + *_formatted. Ответ: { data: OrderView }.

export type OrderStatus =
  | "pending_payment" | "paid" | "confirmed" | "ordered_from_supplier" | "in_transit"
  | "arrived" | "shipped" | "delivered" | "cancelled" | "refunded";
export type OrderKind = "stock" | "preorder";
export type DeliveryMethod = "moscow_courier" | "cdek_pvz" | "cdek_door";

export interface OrderTimelineStep {
  status: OrderStatus;
  label: string; // «Оплачен», «Проверен инженером», …
  at: string | null; // ISO, когда шаг выполнен
  done: boolean;
}

export interface OrderViewItem {
  title: string;
  quantity: number;
  unit_price_formatted: string;
  line_total_formatted: string;
  product_slug: string | null; // null, если товар удалён из каталога (для «Оформить заново»)
}

export interface OrderView {
  number: string; // FC-26-000123
  kind: OrderKind;
  status: OrderStatus;
  status_label: string;
  timeline: OrderTimelineStep[]; // stock: Оплачен → Проверен инженером → Передан в доставку → Доставлен; preorder: + Заказан у поставщика → Едет в Москву → Прибыл на склад
  items: OrderViewItem[];
  total: number;
  total_formatted: string;
  delivery: {
    method: DeliveryMethod;
    method_label: string;
    city: string;
    cdek_pvz_code: string | null;
    address: string | null;
  };
  tracking: { number: string; url: string } | null; // ссылка только для СДЭК
  courier_note: string | null; // для «Курьер по Москве»
  expected_delivery: { from: string; to: string } | null; // YYYY-MM-DD, после shipped
  expected_ready_at: string | null; // YYYY-MM-DD, для preorder
  customer_visible_note: string | null;
  reserved_until: string | null; // ISO, пока pending_payment
  can_pay: boolean; // pending_payment && reserved_until > now
  telegram_subscribed: boolean;
  telegram_link: string | null; // только при доступе по токену (в ссылке токен)
  customer: { name: string; email_masked: string; phone_masked: string };
  // Аддитивные поля (решение Дня 5, для состояний «Отменён» / «Возвращён» из Блока 4):
  cancel_reason: string | null;
  refunded_amount_formatted: string | null; // сумма успешных возвратов, если были
}
