import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { one, rows } from "@/lib/catalog/db";

// Слой БД платёжного контура (service-role, Блок 5.10: create_order / mark_order_paid / webhook'и / cron).
// Клиент передаёт вызывающий код — модуль не читает env и тестируется на мок-клиенте.
// Всегда явные колонки; каждый ответ PostgREST проверяется Zod; ошибка БД → исключение со scope (→ 500 / повтор ЮKassa).
// Служебные колонки orders читаются точечно: client_request_id (токен ссылки, A28) — для return_url и писем,
// attention_reason / needs_attention — только при отметке «требует внимания». admin_note, telegram_chat_id,
// public_token_hash здесь не читаются.

export type Db = SupabaseClient;

const isoTs = z.string().min(10);
const orderStatus = z.enum([
  "pending_payment", "paid", "confirmed", "ordered_from_supplier", "in_transit", "arrived",
  "shipped", "delivered", "cancelled", "refunded",
]);
export const paymentStatus = z.enum(["pending", "waiting_for_capture", "succeeded", "canceled"]);
export type PaymentStatus = z.infer<typeof paymentStatus>;
const refundStatus = z.enum(["pending", "succeeded", "canceled", "failed"]);
export type RefundStatus = z.infer<typeof refundStatus>;

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

export const REFUND_COLUMNS = "id,order_id,payment_id,yookassa_refund_id,amount,status,reason";
export const refundRow = z.object({
  id: z.string(),
  order_id: z.string(),
  payment_id: z.string(),
  yookassa_refund_id: z.string().nullable(),
  amount: z.number().int().positive(),
  status: refundStatus,
  reason: z.string(),
});
export type RefundRow = z.infer<typeof refundRow>;

const attentionRow = z.object({ needs_attention: z.boolean(), attention_reason: z.string().nullable() });
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
}
export interface RefundPatch {
  status: RefundStatus;
  yookassa_refund_id?: string | null;
  error_message?: string | null;
}

/** Атрибуты платёжного контура, которые нужны бизнес-логике (in-memory реализация — в тестах). */
export interface PaymentsRepo {
  getOrder(orderId: string): Promise<OrderForPayment | null>;
  getOrderItems(orderId: string): Promise<OrderItemRow[]>;
  getAttentionReason(orderId: string): Promise<string | null>;
  /** needs_attention = true, причина дописывается к существующей (≤ 300 символов, CHECK 2.7). */
  flagOrderAttention(orderId: string, reason: string): Promise<void>;
  listOrderPayments(orderId: string): Promise<PaymentRow[]>;
  findPayment(yookassaPaymentId: string): Promise<PaymentRow | null>;
  /** conflict — нарушение уникальности (yookassa_payment_id / idempotence_key): строку уже вставил параллельный запрос. */
  insertPayment(row: NewPayment): Promise<{ row: PaymentRow } | { conflict: true }>;
  /** Обновляет строку, только если её текущий статус ∈ allowedFrom (не откатывает succeeded/canceled). null — не обновлено. */
  updatePayment(yookassaPaymentId: string, patch: PaymentPatch, allowedFrom: readonly PaymentStatus[]): Promise<PaymentRow | null>;
  markOrderPaid(orderId: string, amount: number): Promise<MarkPaidResult>;
  listOrderRefunds(orderId: string): Promise<RefundRow[]>;
  insertRefund(row: NewRefund): Promise<RefundRow>;
  updateRefund(id: string, patch: RefundPatch): Promise<void>;
  /** pending|failed|canceled → succeeded. true — статус изменил именно этот вызов. */
  markRefundSucceeded(id: string, yookassaRefundId: string): Promise<boolean>;
  findRefundByYookassaId(yookassaRefundId: string): Promise<RefundRow | null>;
  listPaymentRefunds(paymentId: string): Promise<RefundRow[]>;
  /** payments.status = 'pending', созданные не раньше sinceIso (сверка cron, 48 ч). */
  listPendingPaymentsSince(sinceIso: string): Promise<PaymentRow[]>;
}

const ATTENTION_MAX = 300;
const PG_UNIQUE_VIOLATION = "23505";

export function appendAttention(existing: string | null, reason: string): string {
  const combined = existing ? `${existing}; ${reason}` : reason;
  return combined.length <= ATTENTION_MAX ? combined : `${combined.slice(0, ATTENTION_MAX - 1)}…`;
}

export function createPaymentsRepo(c: Db): PaymentsRepo {
  return {
    async getOrder(orderId) {
      const res = await c.from("orders").select(ORDER_FOR_PAYMENT_COLUMNS).eq("id", orderId).maybeSingle();
      return one(orderForPaymentRow, res, "orders.forPayment");
    },

    async getOrderItems(orderId) {
      const res = await c.from("order_items").select(ORDER_ITEM_COLUMNS).eq("order_id", orderId)
        .order("created_at", { ascending: true }).order("id", { ascending: true });
      return rows(orderItemRow, res, "order_items.byOrder");
    },

    async getAttentionReason(orderId) {
      const res = await c.from("orders").select("needs_attention,attention_reason").eq("id", orderId).maybeSingle();
      return one(attentionRow, res, "orders.attention")?.attention_reason ?? null;
    },

    async flagOrderAttention(orderId, reason) {
      const cur = one(attentionRow, await c.from("orders").select("needs_attention,attention_reason").eq("id", orderId).maybeSingle(), "orders.attention");
      if (!cur) throw new Error(`orders.flagAttention: заказ ${orderId} не найден`);
      const res = await c.from("orders")
        .update({ needs_attention: true, attention_reason: appendAttention(cur.attention_reason, reason) })
        .eq("id", orderId);
      if (res.error) throw new Error(`orders.flagAttention: ${res.error.code ?? ""} ${res.error.message}`);
    },

    async listOrderPayments(orderId) {
      const res = await c.from("payments").select(PAYMENT_COLUMNS).eq("order_id", orderId).order("created_at", { ascending: true });
      return rows(paymentRow, res, "payments.byOrder");
    },

    async findPayment(yookassaPaymentId) {
      const res = await c.from("payments").select(PAYMENT_COLUMNS).eq("yookassa_payment_id", yookassaPaymentId).maybeSingle();
      return one(paymentRow, res, "payments.byYookassaId");
    },

    async insertPayment(row) {
      const res = await c.from("payments").insert(row).select(PAYMENT_COLUMNS).single();
      if (res.error?.code === PG_UNIQUE_VIOLATION) return { conflict: true };
      const inserted = one(paymentRow, res, "payments.insert");
      if (!inserted) throw new Error("payments.insert: пустой ответ");
      return { row: inserted };
    },

    async updatePayment(yookassaPaymentId, patch, allowedFrom) {
      const res = await c.from("payments").update(patch).eq("yookassa_payment_id", yookassaPaymentId)
        .in("status", [...allowedFrom]).select(PAYMENT_COLUMNS);
      return rows(paymentRow, res, "payments.update")[0] ?? null;
    },

    async markOrderPaid(orderId, amount) {
      const res = await c.rpc("mark_order_paid", { p_order_id: orderId, p_amount: amount });
      if (res.error) throw new Error(`rpc.mark_order_paid: ${res.error.code ?? ""} ${res.error.message}`);
      return markPaidResult.parse(res.data);
    },

    async listOrderRefunds(orderId) {
      const res = await c.from("refunds").select(REFUND_COLUMNS).eq("order_id", orderId).order("created_at", { ascending: true });
      return rows(refundRow, res, "refunds.byOrder");
    },

    async insertRefund(row) {
      const res = await c.from("refunds").insert({ ...row, status: "pending" }).select(REFUND_COLUMNS).single();
      const inserted = one(refundRow, res, "refunds.insert");
      if (!inserted) throw new Error("refunds.insert: пустой ответ");
      return inserted;
    },

    async updateRefund(id, patch) {
      const res = await c.from("refunds").update(patch).eq("id", id);
      if (res.error) throw new Error(`refunds.update: ${res.error.code ?? ""} ${res.error.message}`);
    },

    async markRefundSucceeded(id, yookassaRefundId) {
      const res = await c.from("refunds")
        .update({ status: "succeeded", yookassa_refund_id: yookassaRefundId, error_message: null })
        .eq("id", id).neq("status", "succeeded").select("id");
      return rows(z.object({ id: z.string() }), res, "refunds.markSucceeded").length > 0;
    },

    async findRefundByYookassaId(yookassaRefundId) {
      const res = await c.from("refunds").select(REFUND_COLUMNS).eq("yookassa_refund_id", yookassaRefundId).maybeSingle();
      return one(refundRow, res, "refunds.byYookassaId");
    },

    async listPaymentRefunds(paymentId) {
      const res = await c.from("refunds").select(REFUND_COLUMNS).eq("payment_id", paymentId).order("created_at", { ascending: true });
      return rows(refundRow, res, "refunds.byPayment");
    },

    async listPendingPaymentsSince(sinceIso) {
      const res = await c.from("payments").select(PAYMENT_COLUMNS).eq("status", "pending")
        .gte("created_at", sinceIso).order("created_at", { ascending: true });
      return rows(paymentRow, res, "payments.pendingSince");
    },
  };
}
