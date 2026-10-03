import { z } from "zod";

// Колонки и Zod-схемы строк платёжного контура (ответы PostgREST проверяются, а не приводятся типом).
// Служебные колонки orders: client_request_id — для ссылки заказа (A28); attention_reason / needs_attention — только
// при отметке «требует внимания». admin_note, telegram_chat_id, public_token_hash не читаются.

const isoTs = z.string().min(10);
export const orderStatus = z.enum([
  "pending_payment", "paid", "confirmed", "ordered_from_supplier", "in_transit", "arrived",
  "shipped", "delivered", "cancelled", "refunded",
]);
export type OrderStatus = z.infer<typeof orderStatus>;
export const paymentStatus = z.enum(["pending", "waiting_for_capture", "succeeded", "canceled"]);
export type PaymentStatus = z.infer<typeof paymentStatus>;
export const refundStatus = z.enum(["pending", "succeeded", "canceled", "failed"]);
export type RefundStatus = z.infer<typeof refundStatus>;

/** Заказы, по которым деньги ещё не учтены: сверка подхватывает и succeeded-платежи таких заказов. */
export const UNPAID_ORDER_STATUSES = ["pending_payment", "cancelled"] as const;

export const ORDER_FOR_PAYMENT_COLUMNS =
  "id,number,status,kind,total,reserved_until,customer_email,customer_phone,client_request_id," +
  "delivery_method,delivery_city,delivery_address,cdek_pvz_code,vin,vehicle:vehicles(make,model,generation)";

export const orderForPaymentRow = z.object({
  id: z.string(),
  number: z.string(),
  status: orderStatus,
  kind: z.enum(["stock", "preorder"]),
  total: z.number().int().positive(),
  reserved_until: isoTs.nullable(),
  customer_email: z.string(),
  customer_phone: z.string(),
  client_request_id: z.string(),
  delivery_method: z.enum(["moscow_courier", "cdek_pvz", "cdek_door"]),
  delivery_city: z.string(),
  delivery_address: z.string().nullable(),
  cdek_pvz_code: z.string().nullable(),
  vin: z.string().nullable(),
  vehicle: z.object({ make: z.string(), model: z.string(), generation: z.string() }).nullable(),
});
export type OrderForPayment = z.infer<typeof orderForPaymentRow>;

export const ORDER_ITEM_COLUMNS = "title_snapshot,quantity,unit_price";
export const orderItemRow = z.object({
  title_snapshot: z.string(),
  quantity: z.number().int().positive(),
  unit_price: z.number().int().positive(),
});
export type OrderItemRow = z.infer<typeof orderItemRow>;

// confirmation_url и captured_at — из последнего ответа ЮKassa (payments.raw), JSON-путями PostgREST.
export const PAYMENT_COLUMNS =
  "id,order_id,yookassa_payment_id,status,amount,created_at,updated_at," +
  "confirmation_url:raw->confirmation->>confirmation_url,captured_at:raw->>captured_at";
export const paymentRow = z.object({
  id: z.string(),
  order_id: z.string(),
  yookassa_payment_id: z.string(),
  status: paymentStatus,
  amount: z.number().int().positive(),
  created_at: isoTs,
  updated_at: isoTs,
  confirmation_url: z.string().nullable(),
  captured_at: z.string().nullable(),
});
export type PaymentRow = z.infer<typeof paymentRow>;

export const REFUND_COLUMNS = "id,order_id,payment_id,yookassa_refund_id,amount,status,reason,error_message,created_at,restock,created_by";
export const refundRow = z.object({
  id: z.string(),
  order_id: z.string(),
  payment_id: z.string(),
  yookassa_refund_id: z.string().nullable(),
  amount: z.number().int().positive(),
  status: refundStatus,
  reason: z.string(),
  error_message: z.string().nullable(),
  created_at: isoTs,
  // Всегда есть в ответе PostgREST (REFUND_COLUMNS); optional — для совместимости моков Дня 4. Нужны при завершении
  // возврата: restock (BR-17) и автор возврата для order_status_history.changed_by.
  restock: z.boolean().optional(),
  created_by: z.string().nullable().optional(),
});
export type RefundRow = z.infer<typeof refundRow>;

export const attentionRow = z.object({ needs_attention: z.boolean(), attention_reason: z.string().nullable() });
export const markPaidResult = z.enum(["paid", "already_paid", "paid_needs_attention"]);
export type MarkPaidResult = z.infer<typeof markPaidResult>;

export type PaymentMethodType = "bank_card" | "sbp" | null;

export interface NewPayment {
  order_id: string;
  yookassa_payment_id: string;
  idempotence_key: string;
  status: PaymentStatus;
  amount: number;
  payment_method_type: PaymentMethodType;
  cancellation_reason: string | null;
  raw: unknown;
}
export interface PaymentPatch {
  status: PaymentStatus;
  payment_method_type: PaymentMethodType;
  cancellation_reason: string | null;
  raw: unknown;
}
export interface NewRefund {
  order_id: string;
  payment_id: string;
  amount: number;
  reason: string;
  restock: boolean;
  /** auth.users.id админа (ручной возврат); автоматический возврат — без поля (null). */
  created_by?: string | null;
}
export interface RefundPatch {
  status: RefundStatus;
  yookassa_refund_id?: string | null;
  error_message?: string | null;
  reason?: string;
  restock?: boolean;
}

const ATTENTION_MAX = 300;

/** Причина дописывается к существующей; ≤ 300 символов (CHECK orders.attention_reason). */
export function appendAttention(existing: string | null, reason: string): string {
  const combined = existing ? `${existing}; ${reason}` : reason;
  return combined.length <= ATTENTION_MAX ? combined : `${combined.slice(0, ATTENTION_MAX - 1)}…`;
}
