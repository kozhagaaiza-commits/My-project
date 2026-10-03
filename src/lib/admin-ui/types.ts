import type { DeliveryMethod, OrderKind, OrderStatus } from "@/types/order-view";

// Контракты ответов /api/admin/* (Чертёж, Блок 3 «Админка — заказы» и «Админка — ателье, настройки, сводка»).
// Деньги — целые копейки + *_formatted; на клиенте выводим только *_formatted либо formatRub.

export type { DeliveryMethod, OrderKind, OrderStatus };

export interface ListMeta {
  total: number;
  page: number;
  per_page: number;
}

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

export interface AdminOrderItem {
  product_id: string;
  title: string;
  sku: string;
  specs: Record<string, unknown>;
  quantity: number;
  unit_price_formatted: string;
  line_total_formatted: string;
}

export interface AdminOrderPayment {
  yookassa_payment_id: string;
  status: string;
  method: string | null;
  amount_formatted: string;
  created_at: string;
}

// В Чертеже refunds: [] без примера записи — поля уточнить по ответу бэкенда.
export interface AdminOrderRefund {
  status: string;
  amount_formatted: string;
  reason?: string | null;
  error_message?: string | null;
  created_at: string;
}

export interface AdminOrderHistoryEntry {
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  note: string | null;
  changed_by_name: string | null;
  created_at: string;
}

export interface AdminOrderDetail {
  id: string;
  number: string;
  kind: OrderKind;
  status: OrderStatus;
  allowed_transitions: OrderStatus[];
  customer: { name: string; phone: string; email: string };
  delivery: {
    method: DeliveryMethod;
    city: string;
    cdek_pvz_code: string | null;
    address: string | null;
    postal_code: string | null;
  };
  vehicle_label: string | null;
  vin: string | null;
  customer_comment: string | null;
  items: AdminOrderItem[];
  total: number;
  total_formatted: string;
  paid_amount: number;
  refunded_amount: number;
  refundable_amount: number;
  payments: AdminOrderPayment[];
  refunds: AdminOrderRefund[];
  history: AdminOrderHistoryEntry[];
  tracking_number: string | null;
  courier_note: string | null;
  admin_note: string | null;
  customer_visible_note: string | null;
  expected_ready_at: string | null;
  needs_attention: boolean;
  attention_reason: string | null;
  telegram_subscribed: boolean;
  consent_pd_at: string | null;
  consent_policy_version: string | null;
  updated_at: string; // Даты создания в ответе нет — в шапке берём первую запись history.
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
  expected_ready_at?: string | null;
  customer_notified?: boolean;
  updated_at: string;
}

export interface AdminRefundResult {
  refund_id: string;
  yookassa_refund_id: string;
  status: "succeeded" | "pending";
  amount_formatted: string;
  order_status: OrderStatus;
  restocked?: boolean;
}

export interface AdminSummary {
  orders_to_process: number;
  orders_attention: number;
  preorders_in_progress: number;
  ateliers_pending: number;
  low_stock: Array<{ product_id: string; title: string; available_qty: number }>;
  month: { paid_orders: number; revenue: number; revenue_formatted: string; goal_orders: number };
  rates_date: string | null;
  notifications_failed: number;
}

export interface RateEntry {
  rate: number;
  date: string;
}

export interface AdminSettings {
  markup_multiplier: number;
  price_rounding_rub: number;
  auto_reprice: boolean;
  reprice_threshold: number;
  rates: Partial<Record<"USD" | "CNY", RateEntry>>;
  updated_at: string;
}

export type AdminRatesRefresh = Record<"USD" | "CNY", RateEntry & { inserted: boolean }>;

export interface RepriceChange {
  product_id: string;
  title: string;
  old_price_formatted: string;
  new_price_formatted: string;
}

export interface AdminRecalculateResult {
  dry_run: boolean;
  changes: RepriceChange[];
  unchanged: number;
}
