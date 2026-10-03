import type { DeliveryMethod, OrderKind, OrderStatus } from "@/types/order-view";

// Ответы «Админка — заказы» (Чертёж, Блок 3). Деньги — копейки + *_formatted. Время — ISO UTC с «Z»
// (updated_at — со всеми цифрами дробной части: его клиент возвращает в PATCH для оптимистической блокировки).

export interface AdminOrderListItem {
  id: string;
  number: string;
  created_at: string;
  kind: OrderKind;
  status: OrderStatus;
  status_label: string;
  price_tier: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  delivery_label: string;
  total: number;
  total_formatted: string;
  needs_attention: boolean;
  attention_reason: string | null;
  vehicle_label: string | null;
}

export interface AdminOrderDetail {
  id: string;
  number: string;
  kind: OrderKind;
  status: OrderStatus;
  allowed_transitions: OrderStatus[];
  customer: { name: string; phone: string; email: string };
  delivery: { method: DeliveryMethod; city: string; cdek_pvz_code: string | null; address: string | null; postal_code: string | null };
  vehicle_label: string | null;
  vin: string | null;
  customer_comment: string | null;
  items: Array<{
    product_id: string | null; // null — товар удалён из каталога (снапшот позиции остаётся)
    title: string;
    sku: string;
    specs: Record<string, unknown>;
    quantity: number;
    unit_price_formatted: string;
    line_total_formatted: string;
  }>;
  total: number;
  total_formatted: string;
  paid_amount: number;
  refunded_amount: number;
  refundable_amount: number;
  payments: Array<{ yookassa_payment_id: string; status: string; method: string | null; amount_formatted: string; created_at: string }>;
  /** В Чертеже пример пустой ([]); поля — из таблицы refunds (2.10), без служебных created_by. */
  refunds: Array<{
    id: string;
    yookassa_refund_id: string | null;
    status: string;
    amount_formatted: string;
    reason: string;
    restock: boolean;
    error_message: string | null;
    created_at: string;
  }>;
  history: Array<{ from_status: string | null; to_status: string; note: string | null; changed_by_name: string | null; created_at: string }>;
  tracking_number: string | null;
  courier_note: string | null;
  admin_note: string | null;
  customer_visible_note: string | null;
  expected_ready_at: string | null;
  needs_attention: boolean;
  attention_reason: string | null;
  telegram_subscribed: boolean;
  consent_pd_at: string;
  consent_policy_version: string;
  updated_at: string;
}

export interface AdminStatusChangeResult {
  id: string;
  status: OrderStatus;
  status_label: string;
  allowed_transitions: OrderStatus[];
  updated_at: string;
}

export interface AdminMetaPatchResult {
  id: string;
  expected_ready_at: string | null;
  customer_notified: boolean;
  updated_at: string;
}
