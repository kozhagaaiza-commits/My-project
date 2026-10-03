import { randomUUID } from "node:crypto";
import {
  appendAttention,
  type MarkPaidResult, type NewPayment, type NewRefund, type OrderForPayment, type OrderItemRow, type OrderStatus, type PaymentPatch,
  type PaymentRow, type PaymentStatus, type PaymentsRepo, type RefundPatch, type RefundRow,
} from "@/lib/payments/db";
import type { PaymentsDeps } from "@/lib/payments/deps";
import type { NotificationInput } from "@/lib/notifications/types";
import { createYookassaClient, type YookassaClient } from "@/lib/yookassa";
import { FAKE_SECRET_KEY, FAKE_SHOP_ID, type FakeYookassa } from "./fake-yookassa";

// In-memory реализация PaymentsRepo для тестов: уникальность payments (yookassa_payment_id, idempotence_key),
// moddatetime для updated_at и mark_order_paid — по SQL Чертежа 2.14 (без списания остатка: оно не влияет на результат,
// кроме нехватки, которую тест задаёт флагом stockShortage).

export type MemOrder = OrderForPayment & {
  needs_attention: boolean;
  attention_reason: string | null;
  paid_at: string | null;
  stockShortage?: boolean;
};
type MemPayment = Omit<PaymentRow, "confirmation_url" | "captured_at"> & {
  idempotence_key: string; payment_method_type: string | null; cancellation_reason: string | null; raw: unknown;
};
type MemRefund = RefundRow & { restock: boolean; created_by: string | null };

const pick = (raw: unknown, ...path: string[]): string | null => {
  let cur: unknown = raw;
  for (const k of path) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined;
  return typeof cur === "string" ? cur : null;
};

export class MemoryPaymentsRepo implements PaymentsRepo {
  readonly orders = new Map<string, MemOrder>();
  readonly items = new Map<string, OrderItemRow[]>();
  readonly payments: MemPayment[] = [];
  readonly refunds: MemRefund[] = [];
  readonly history: Array<{ order_id: string; from: string; to: string; note: string; changed_by?: string | null }> = [];
  readonly markPaidCalls: Array<{ orderId: string; amount: number }> = [];
  /** Вызовы rpc restock_order (по SQL 2.14 — только kind = 'stock'; остатки в памяти не моделируются). */
  readonly restockCalls: string[] = [];
  /** Имитация миграции uq_refunds_duplicate_payment: unique (payment_id) where reason = 'Повторная оплата'. */
  duplicateRefundIndex = false;
  private refundSeq = 0;
  /** Имя метода → ошибка, которую он бросит один раз (имитация сбоя БД). */
  readonly failOnce = new Map<keyof PaymentsRepo, Error>();

  constructor(public clock: () => Date = () => new Date()) {}

  private iso() { return this.clock().toISOString(); }
  private maybeFail(name: keyof PaymentsRepo) {
    const e = this.failOnce.get(name);
    if (e) { this.failOnce.delete(name); throw e; }
  }
  private view(p: MemPayment): PaymentRow {
    return {
      id: p.id, order_id: p.order_id, yookassa_payment_id: p.yookassa_payment_id, status: p.status, amount: p.amount,
      created_at: p.created_at, updated_at: p.updated_at,
      confirmation_url: pick(p.raw, "confirmation", "confirmation_url"), captured_at: pick(p.raw, "captured_at"),
    };
  }
  private refundView(r: MemRefund): RefundRow {
    return {
      id: r.id, order_id: r.order_id, payment_id: r.payment_id, yookassa_refund_id: r.yookassa_refund_id, amount: r.amount,
      status: r.status, reason: r.reason, error_message: r.error_message, created_at: r.created_at,
      restock: r.restock, created_by: r.created_by,
    };
  }

  addOrder(o: MemOrder, items: OrderItemRow[]) {
    this.orders.set(o.id, o);
    this.items.set(o.id, items);
  }
  paymentRaw(yookassaId: string) { return this.payments.find((p) => p.yookassa_payment_id === yookassaId); }

  async getOrder(orderId: string) {
    this.maybeFail("getOrder");
    const o = this.orders.get(orderId);
    if (!o) return null;
    const view: OrderForPayment = {
      id: o.id, number: o.number, status: o.status, kind: o.kind, total: o.total, reserved_until: o.reserved_until,
      customer_email: o.customer_email, customer_phone: o.customer_phone, client_request_id: o.client_request_id,
      delivery_method: o.delivery_method, delivery_city: o.delivery_city, delivery_address: o.delivery_address,
      cdek_pvz_code: o.cdek_pvz_code, vin: o.vin, vehicle: o.vehicle,
    };
    return structuredClone(view);
  }
  async getOrderItems(orderId: string) { this.maybeFail("getOrderItems"); return structuredClone(this.items.get(orderId) ?? []); }
  async getAttentionReason(orderId: string) { return this.orders.get(orderId)?.attention_reason ?? null; }
  async flagOrderAttention(orderId: string, reason: string) {
    this.maybeFail("flagOrderAttention");
    const o = this.orders.get(orderId);
    if (!o) throw new Error("orders.flagAttention: not found");
    o.needs_attention = true;
    o.attention_reason = appendAttention(o.attention_reason, reason);
  }
  async listOrderPayments(orderId: string) {
    this.maybeFail("listOrderPayments");
    return this.payments.filter((p) => p.order_id === orderId).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((p) => this.view(p));
  }
  async findPayment(id: string) {
    this.maybeFail("findPayment");
    const p = this.payments.find((x) => x.yookassa_payment_id === id);
    return p ? this.view(p) : null;
  }
  async insertPayment(row: NewPayment) {
    this.maybeFail("insertPayment");
    if (this.payments.some((p) => p.yookassa_payment_id === row.yookassa_payment_id || p.idempotence_key === row.idempotence_key)) {
      return { conflict: true as const };
    }
    const now = this.iso();
    const p: MemPayment = { id: randomUUID(), created_at: now, updated_at: now, ...structuredClone(row) };
    this.payments.push(p);
    return { row: this.view(p) };
  }
  async updatePayment(id: string, patch: PaymentPatch, allowedFrom: readonly PaymentStatus[]) {
    this.maybeFail("updatePayment");
    const p = this.payments.find((x) => x.yookassa_payment_id === id && allowedFrom.includes(x.status));
    if (!p) return null;
    Object.assign(p, structuredClone(patch), { updated_at: this.iso() });
    return this.view(p);
  }
  async markOrderPaid(orderId: string, amount: number): Promise<MarkPaidResult> {
    this.maybeFail("markOrderPaid");
    this.markPaidCalls.push({ orderId, amount });
    const o = this.orders.get(orderId);
    if (!o) throw new Error("ORDER_NOT_FOUND");
    if (o.status !== "pending_payment" && o.status !== "cancelled") return "already_paid";
    let attention: string | null = null;
    if (amount !== o.total) attention = `Сумма платежа ${amount} коп. не равна сумме заказа ${o.total} коп.`;
    if (o.status === "cancelled") attention = (attention ? `${attention}; ` : "") + "Оплачен после истечения брони";
    if (o.kind === "stock" && o.stockShortage) attention = (attention ? `${attention}; ` : "") + "Не хватило остатка по товару x";
    this.history.push({ order_id: orderId, from: o.status, to: "paid", note: attention ?? "Оплата подтверждена ЮKassa" });
    Object.assign(o, { status: "paid", paid_at: this.iso(), reserved_until: null, needs_attention: attention !== null, attention_reason: attention });
    return attention === null ? "paid" : "paid_needs_attention";
  }
  async listOrderRefunds(orderId: string) { return this.refunds.filter((r) => r.order_id === orderId).map((r) => this.refundView(r)); }
  async insertRefund(row: NewRefund) {
    this.maybeFail("insertRefund");
    if (this.duplicateRefundIndex && row.reason === "Повторная оплата"
      && this.refunds.some((x) => x.payment_id === row.payment_id && x.reason === "Повторная оплата")) {
      return { conflict: true as const };
    }
    // created_at строго растёт (как now() разных транзакций): микросекунды = порядковый номер вставки.
    const created_at = this.iso().replace("Z", `${String(++this.refundSeq).padStart(3, "0")}+00:00`);
    const r: MemRefund = { id: randomUUID(), yookassa_refund_id: null, status: "pending", error_message: null, created_at, ...row, created_by: row.created_by ?? null };
    this.refunds.push(r);
    return { row: this.refundView(r) };
  }
  async updateRefund(id: string, patch: RefundPatch) {
    this.maybeFail("updateRefund");
    const r = this.refunds.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  }
  async markRefundSucceeded(id: string, yookassaRefundId: string) {
    this.maybeFail("markRefundSucceeded");
    const r = this.refunds.find((x) => x.id === id && x.status !== "succeeded");
    if (!r) return false;
    Object.assign(r, { status: "succeeded", yookassa_refund_id: yookassaRefundId, error_message: null });
    return true;
  }
  async findRefundByYookassaId(id: string) {
    const r = this.refunds.find((x) => x.yookassa_refund_id === id);
    return r ? this.refundView(r) : null;
  }
  async listPaymentRefunds(paymentId: string) { return this.refunds.filter((r) => r.payment_id === paymentId).map((r) => this.refundView(r)); }
  async listPendingPaymentsSince(sinceIso: string) {
    this.maybeFail("listPendingPaymentsSince");
    return this.payments.filter((p) => p.status === "pending" && p.created_at >= sinceIso).map((p) => this.view(p));
  }
  async findPaymentById(id: string) {
    const p = this.payments.find((x) => x.id === id);
    return p ? this.view(p) : null;
  }
  async listSucceededPaymentsOfUnpaidOrders() {
    this.maybeFail("listSucceededPaymentsOfUnpaidOrders");
    return this.payments.filter((p) => p.status === "succeeded" && ["pending_payment", "cancelled"].includes(this.orders.get(p.order_id)?.status ?? ""))
      .map((p) => this.view(p));
  }
  async listOpenRefundsByReason(reason: string, sinceIso: string) {
    return this.refunds.filter((r) => r.reason === reason && (r.status === "pending" || r.status === "failed") && r.created_at >= sinceIso)
      .map((r) => this.refundView(r));
  }
  async listPendingRefundsSince(sinceIso: string) {
    this.maybeFail("listPendingRefundsSince");
    return this.refunds.filter((r) => r.status === "pending" && r.created_at >= sinceIso).map((r) => this.refundView(r));
  }
  async markOrderRefunded(orderId: string, fromStatus: OrderStatus, changedBy: string | null, note: string) {
    this.maybeFail("markOrderRefunded");
    const o = this.orders.get(orderId);
    if (!o || o.status !== fromStatus) return false;
    o.status = "refunded";
    this.history.push({ order_id: orderId, from: fromStatus, to: "refunded", note: note.slice(0, 500), changed_by: changedBy });
    return true;
  }
  async restockOrder(orderId: string) {
    this.maybeFail("restockOrder");
    if (this.orders.get(orderId)?.kind === "stock") this.restockCalls.push(orderId);
  }
}

// ---------- Заказ-образец (пример Блока 3) ----------

export const ORDER_ID = "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68";
export const CLIENT_REQUEST_ID = "0e7c4a19-5b2d-4f8e-9a63-1d0c8b7e2f45";
export const WHEEL_TITLE = "Кованый моноблок M-01 R20, 5×112, графит";

export function sampleOrder(over: Partial<MemOrder> = {}, now: Date = new Date()): MemOrder {
  return {
    id: ORDER_ID, number: "FC-26-000123", status: "pending_payment", kind: "stock", total: 13370000,
    reserved_until: new Date(now.getTime() + 30 * 60_000).toISOString(),
    customer_email: "artem.sokolov@yandex.ru", customer_phone: "+79165551234", client_request_id: CLIENT_REQUEST_ID,
    delivery_method: "cdek_pvz", delivery_city: "Казань", delivery_address: null, cdek_pvz_code: "KZN45",
    vin: "WBAJA11050B123456", vehicle: { make: "BMW", model: "5 Series", generation: "G30" },
    needs_attention: false, attention_reason: null, paid_at: null,
    ...over,
  };
}
export const sampleItems = (): OrderItemRow[] => [{ title_snapshot: WHEEL_TITLE, quantity: 1, unit_price: 13370000 }];

// ---------- Зависимости ----------

export const SITE = "https://forgecarbon.vercel.app";
export const ADMIN_CHAT = "-100123";
export const testOrderUrl = (n: string, crid: string) => `${SITE}/orders/${n}?t=tok_${crid.slice(0, 8)}`;

export function fakeClient(fake: FakeYookassa, over: { timeoutMs?: number } = {}): YookassaClient {
  return createYookassaClient({ baseUrl: fake.url, shopId: FAKE_SHOP_ID, secretKey: FAKE_SECRET_KEY, sleep: async () => {}, ...over });
}

export function makeDeps(repo: MemoryPaymentsRepo, yookassa: YookassaClient, over: Partial<PaymentsDeps> = {}) {
  const notifications: NotificationInput[] = [];
  const deps: PaymentsDeps = {
    repo, yookassa,
    enqueue: async (n) => { notifications.push(structuredClone(n)); return true; },
    siteUrl: SITE, adminChatId: ADMIN_CHAT, orderUrl: testOrderUrl, now: repo.clock,
    ...over,
  };
  return { deps, notifications };
}
