import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { one, rows } from "@/lib/catalog/db";
import {
  ORDER_FOR_PAYMENT_COLUMNS, ORDER_ITEM_COLUMNS, PAYMENT_COLUMNS, REFUND_COLUMNS, UNPAID_ORDER_STATUSES,
  appendAttention, attentionRow, markPaidResult, orderForPaymentRow, orderItemRow, paymentRow, refundRow,
  type MarkPaidResult, type NewPayment, type NewRefund, type OrderForPayment, type OrderItemRow, type PaymentPatch,
  type PaymentRow, type PaymentStatus, type RefundPatch, type RefundRow,
} from "@/lib/payments/db-rows";

// Слой БД платёжного контура (service-role, Блок 5.10: mark_order_paid / webhook'и / cron).
// Клиент передаёт вызывающий код — модуль не читает env и тестируется на мок-клиенте.
// Всегда явные колонки; каждый ответ PostgREST проверяется Zod; ошибка БД → исключение со scope (→ 500 / повтор ЮKassa).

export * from "@/lib/payments/db-rows";
export type Db = SupabaseClient;

const PG_UNIQUE_VIOLATION = "23505";

export interface PaymentsRepo {
  getOrder(orderId: string): Promise<OrderForPayment | null>;
  getOrderItems(orderId: string): Promise<OrderItemRow[]>;
  getAttentionReason(orderId: string): Promise<string | null>;
  /** needs_attention = true, причина дописывается к существующей. */
  flagOrderAttention(orderId: string, reason: string): Promise<void>;
  listOrderPayments(orderId: string): Promise<PaymentRow[]>;
  findPayment(yookassaPaymentId: string): Promise<PaymentRow | null>;
  findPaymentById(paymentId: string): Promise<PaymentRow | null>;
  /** conflict — нарушение уникальности (yookassa_payment_id / idempotence_key): строку уже вставил параллельный запрос. */
  insertPayment(row: NewPayment): Promise<{ row: PaymentRow } | { conflict: true }>;
  /** Обновляет строку, только если её текущий статус ∈ allowedFrom (не откатывает succeeded/canceled). null — не обновлено. */
  updatePayment(yookassaPaymentId: string, patch: PaymentPatch, allowedFrom: readonly PaymentStatus[]): Promise<PaymentRow | null>;
  markOrderPaid(orderId: string, amount: number): Promise<MarkPaidResult>;
  listOrderRefunds(orderId: string): Promise<RefundRow[]>;
  /** conflict — уникальный индекс uq_refunds_duplicate_payment (если применён): возврат уже создаёт другой обработчик. */
  insertRefund(row: NewRefund): Promise<{ row: RefundRow } | { conflict: true }>;
  updateRefund(id: string, patch: RefundPatch): Promise<void>;
  /** pending|failed|canceled → succeeded. true — статус изменил именно этот вызов. */
  markRefundSucceeded(id: string, yookassaRefundId: string): Promise<boolean>;
  findRefundByYookassaId(yookassaRefundId: string): Promise<RefundRow | null>;
  listPaymentRefunds(paymentId: string): Promise<RefundRow[]>;
  /** payments.status = 'pending', созданные не раньше sinceIso (сверка cron, 48 ч). */
  listPendingPaymentsSince(sinceIso: string): Promise<PaymentRow[]>;
  /** payments.status = 'succeeded' у заказов в pending_payment / cancelled (сбой между шагами обработки). */
  listSucceededPaymentsOfUnpaidOrders(): Promise<PaymentRow[]>;
  /** Незавершённые автоматические возвраты (reason, status pending|failed), созданные не раньше sinceIso. */
  listOpenRefundsByReason(reason: string, sinceIso: string): Promise<RefundRow[]>;
}

function check(res: { error: { message: string; code?: string } | null }, scope: string) {
  if (res.error) throw new Error(`${scope}: ${res.error.code ?? ""} ${res.error.message}`);
}

export function createPaymentsRepo(c: Db): PaymentsRepo {
  const readAttention = async (orderId: string) =>
    one(attentionRow, await c.from("orders").select("needs_attention,attention_reason").eq("id", orderId).maybeSingle(), "orders.attention");

  return {
    async getOrder(orderId) {
      return one(orderForPaymentRow, await c.from("orders").select(ORDER_FOR_PAYMENT_COLUMNS).eq("id", orderId).maybeSingle(), "orders.forPayment");
    },
    async getOrderItems(orderId) {
      const res = await c.from("order_items").select(ORDER_ITEM_COLUMNS).eq("order_id", orderId)
        .order("created_at", { ascending: true }).order("id", { ascending: true });
      return rows(orderItemRow, res, "order_items.byOrder");
    },
    async getAttentionReason(orderId) {
      return (await readAttention(orderId))?.attention_reason ?? null;
    },
    async flagOrderAttention(orderId, reason) {
      const cur = await readAttention(orderId);
      if (!cur) throw new Error(`orders.flagAttention: заказ ${orderId} не найден`);
      const res = await c.from("orders")
        .update({ needs_attention: true, attention_reason: appendAttention(cur.attention_reason, reason) }).eq("id", orderId);
      check(res, "orders.flagAttention");
    },
    async listOrderPayments(orderId) {
      const res = await c.from("payments").select(PAYMENT_COLUMNS).eq("order_id", orderId).order("created_at", { ascending: true });
      return rows(paymentRow, res, "payments.byOrder");
    },
    async findPayment(yookassaPaymentId) {
      return one(paymentRow, await c.from("payments").select(PAYMENT_COLUMNS).eq("yookassa_payment_id", yookassaPaymentId).maybeSingle(), "payments.byYookassaId");
    },
    async findPaymentById(paymentId) {
      return one(paymentRow, await c.from("payments").select(PAYMENT_COLUMNS).eq("id", paymentId).maybeSingle(), "payments.byId");
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
      check(res, "rpc.mark_order_paid");
      return markPaidResult.parse(res.data);
    },
    async listOrderRefunds(orderId) {
      const res = await c.from("refunds").select(REFUND_COLUMNS).eq("order_id", orderId).order("created_at", { ascending: true });
      return rows(refundRow, res, "refunds.byOrder");
    },
    async insertRefund(row) {
      const res = await c.from("refunds").insert({ ...row, status: "pending" }).select(REFUND_COLUMNS).single();
      if (res.error?.code === PG_UNIQUE_VIOLATION) return { conflict: true };
      const inserted = one(refundRow, res, "refunds.insert");
      if (!inserted) throw new Error("refunds.insert: пустой ответ");
      return { row: inserted };
    },
    async updateRefund(id, patch) {
      check(await c.from("refunds").update(patch).eq("id", id), "refunds.update");
    },
    async markRefundSucceeded(id, yookassaRefundId) {
      const res = await c.from("refunds")
        .update({ status: "succeeded", yookassa_refund_id: yookassaRefundId, error_message: null })
        .eq("id", id).neq("status", "succeeded").select("id");
      return rows(z.object({ id: z.string() }), res, "refunds.markSucceeded").length > 0;
    },
    async findRefundByYookassaId(yookassaRefundId) {
      return one(refundRow, await c.from("refunds").select(REFUND_COLUMNS).eq("yookassa_refund_id", yookassaRefundId).maybeSingle(), "refunds.byYookassaId");
    },
    async listPaymentRefunds(paymentId) {
      const res = await c.from("refunds").select(REFUND_COLUMNS).eq("payment_id", paymentId)
        .order("created_at", { ascending: true }).order("id", { ascending: true });
      return rows(refundRow, res, "refunds.byPayment");
    },
    async listPendingPaymentsSince(sinceIso) {
      const res = await c.from("payments").select(PAYMENT_COLUMNS).eq("status", "pending")
        .gte("created_at", sinceIso).order("created_at", { ascending: true });
      return rows(paymentRow, res, "payments.pendingSince");
    },
    async listSucceededPaymentsOfUnpaidOrders() {
      // Inner join на orders: фильтр по статусу заказа на стороне PostgREST; поле orders в ответе отбрасывает Zod.
      const res = await c.from("payments").select(`${PAYMENT_COLUMNS},orders!inner(status)`).eq("status", "succeeded")
        .in("orders.status", [...UNPAID_ORDER_STATUSES]).order("created_at", { ascending: true });
      return rows(paymentRow, res, "payments.succeededOfUnpaid");
    },
    async listOpenRefundsByReason(reason, sinceIso) {
      const res = await c.from("refunds").select(REFUND_COLUMNS).eq("reason", reason).in("status", ["pending", "failed"])
        .gte("created_at", sinceIso).order("created_at", { ascending: true });
      return rows(refundRow, res, "refunds.openByReason");
    },
  };
}
