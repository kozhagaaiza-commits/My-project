import { formatRub } from "@/lib/money";
import { orderStatusLabel } from "@/lib/order-labels";
import { allowedTransitions } from "@/lib/order-status";
import { adminDeliveryLabel, adminVehicleLabel, type VehicleEmbed } from "./labels";
import type { AdminOrderDetail, AdminOrderListItem } from "./order-types";
import { toIsoUtc } from "./timestamps";

// Сборка ответов GET /api/admin/orders и GET /api/admin/orders/[id] (Блок 3). Чистые функции: строки — из orders-db.ts
// (уже проверены Zod), наружу — только поля примеров Чертежа; telegram_chat_id → telegram_subscribed (boolean).

type ListRow = Omit<AdminOrderListItem, "status_label" | "delivery_label" | "total_formatted" | "vehicle_label"> & {
  delivery_method: AdminOrderDetail["delivery"]["method"];
  delivery_city: string;
  cdek_pvz_code: string | null;
  vehicle: VehicleEmbed | null;
};

export function buildAdminOrderListItem(r: ListRow): AdminOrderListItem {
  return {
    id: r.id, number: r.number, created_at: toIsoUtc(r.created_at), kind: r.kind, status: r.status,
    status_label: orderStatusLabel(r.status), price_tier: r.price_tier,
    customer_name: r.customer_name, customer_phone: r.customer_phone, customer_email: r.customer_email,
    delivery_label: adminDeliveryLabel(r), total: r.total, total_formatted: formatRub(r.total),
    needs_attention: r.needs_attention, attention_reason: r.attention_reason, vehicle_label: adminVehicleLabel(r.vehicle),
  };
}

/** Суммы по заказу (US-008, BR-16; логика POST …/refund, шаг 1): refundable = оплачено − возвраты pending|succeeded. */
export function orderMoney(payments: Array<{ status: string; amount: number }>, refunds: Array<{ status: string; amount: number }>) {
  const paid = payments.filter((p) => p.status === "succeeded").reduce((s, p) => s + p.amount, 0);
  const refunded = refunds.filter((r) => r.status === "succeeded").reduce((s, r) => s + r.amount, 0);
  const reserved = refunds.filter((r) => r.status === "pending" || r.status === "succeeded").reduce((s, r) => s + r.amount, 0);
  return { paid_amount: paid, refunded_amount: refunded, refundable_amount: Math.max(paid - reserved, 0) };
}

export interface DetailInput {
  order: {
    id: string; number: string; kind: AdminOrderDetail["kind"]; status: AdminOrderDetail["status"];
    customer_name: string; customer_phone: string; customer_email: string;
    delivery_method: AdminOrderDetail["delivery"]["method"]; delivery_city: string; delivery_address: string | null;
    delivery_postal_code: string | null; cdek_pvz_code: string | null; vin: string | null; customer_comment: string | null;
    total: number; tracking_number: string | null; courier_note: string | null; admin_note: string | null;
    customer_visible_note: string | null; expected_ready_at: string | null; needs_attention: boolean;
    attention_reason: string | null; telegram_subscribed: boolean; consent_pd_at: string; consent_policy_version: string;
    updated_at: string; vehicle: VehicleEmbed | null;
  };
  items: Array<{
    product_id: string | null; title_snapshot: string; sku_snapshot: string; specs_snapshot: Record<string, unknown>;
    unit_price: number; quantity: number; line_total: number;
  }>;
  payments: Array<{ yookassa_payment_id: string; status: string; amount: number; payment_method_type: string | null; created_at: string }>;
  refunds: Array<{
    id: string; yookassa_refund_id: string | null; status: string; amount: number; reason: string; restock: boolean;
    error_message: string | null; created_at: string;
  }>;
  history: Array<{ from_status: string | null; to_status: string; note: string | null; changed_by_name: string | null; created_at: string }>;
}

export function buildAdminOrderDetail({ order: o, items, payments, refunds, history }: DetailInput): AdminOrderDetail {
  return {
    id: o.id, number: o.number, kind: o.kind, status: o.status,
    allowed_transitions: allowedTransitions(o.kind, o.status),
    customer: { name: o.customer_name, phone: o.customer_phone, email: o.customer_email },
    delivery: {
      method: o.delivery_method, city: o.delivery_city, cdek_pvz_code: o.cdek_pvz_code,
      address: o.delivery_address, postal_code: o.delivery_postal_code,
    },
    vehicle_label: adminVehicleLabel(o.vehicle), vin: o.vin, customer_comment: o.customer_comment,
    items: items.map((i) => ({
      product_id: i.product_id, title: i.title_snapshot, sku: i.sku_snapshot, specs: i.specs_snapshot, quantity: i.quantity,
      unit_price_formatted: formatRub(i.unit_price), line_total_formatted: formatRub(i.line_total),
    })),
    total: o.total, total_formatted: formatRub(o.total),
    ...orderMoney(payments, refunds),
    payments: payments.map((p) => ({
      yookassa_payment_id: p.yookassa_payment_id, status: p.status, method: p.payment_method_type,
      amount_formatted: formatRub(p.amount), created_at: toIsoUtc(p.created_at),
    })),
    refunds: refunds.map((r) => ({
      id: r.id, yookassa_refund_id: r.yookassa_refund_id, status: r.status, amount_formatted: formatRub(r.amount),
      reason: r.reason, restock: r.restock, error_message: r.error_message, created_at: toIsoUtc(r.created_at),
    })),
    history: history.map((h) => ({
      from_status: h.from_status, to_status: h.to_status, note: h.note, changed_by_name: h.changed_by_name,
      created_at: toIsoUtc(h.created_at),
    })),
    tracking_number: o.tracking_number, courier_note: o.courier_note, admin_note: o.admin_note,
    customer_visible_note: o.customer_visible_note, expected_ready_at: o.expected_ready_at,
    needs_attention: o.needs_attention, attention_reason: o.attention_reason,
    telegram_subscribed: o.telegram_subscribed, consent_pd_at: toIsoUtc(o.consent_pd_at),
    consent_policy_version: o.consent_policy_version, updated_at: toIsoUtc(o.updated_at),
  };
}
