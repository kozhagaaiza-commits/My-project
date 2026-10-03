import { orderStatusLabel } from "@/lib/order-labels";
import { allowedTransitions, canTransition } from "@/lib/order-status";
import {
  COURIER_NOTE_REQUIRED_MESSAGE, TRACKING_REQUIRED_MESSAGE, type OrderStatusChangeBody,
} from "@/lib/schemas/admin-orders";
import type { OrderStatus } from "@/types/order-view";
import type { AdminStatusChangeResult } from "./order-types";
import type { OrderChangeRow, StatusHistoryInsert, StatusPatch, StatusResultRow } from "./orders-write";
import { sameInstant, toIsoUtc } from "./timestamps";

// PATCH /api/admin/orders/[id]/status (Блок 3; 5.3; BR-12, BR-19; US-007; Edge Case 14). Без сети и env — зависимости внедряются.
// Порядок: заказ (нет → not_found) → updated_at (устарел → conflict: заказ уже изменили, кнопки на экране неактуальны) →
// переход по таблице 5.3 (→ invalid_transition с allowed) → для shipped: трек СДЭК / заметка курьера (тело или уже
// сохранённое в заказе значение) → update с блокировкой по updated_at и статусу (0 строк → conflict) → история
// (changed_by = админ) → уведомление customer_status_changed. Сбой истории или уведомления статус НЕ откатывает: переход уже
// записан, повтор запроса дал бы CONFLICT; ошибка — в лог.

export interface StatusChangeDeps {
  selectOrder(orderId: string): Promise<OrderChangeRow | null>;
  updateStatus(orderId: string, guard: { updatedAt: string; fromStatus: OrderStatus }, patch: StatusPatch): Promise<StatusResultRow | null>;
  insertHistory(row: StatusHistoryInsert): Promise<void>;
  /** notifyCustomerStatusChanged (src/lib/notifications/customer-status.ts); не бросает. */
  notifyStatusChanged(p: {
    orderNumber: string; customerEmail: string; status: string; trackingNumber: string | null; orderUrl: string | null;
  }): Promise<boolean>;
  /** Ссылка на страницу заказа с токеном (orderPageUrl(orderToken(client_request_id))). */
  orderUrl(orderNumber: string, clientRequestId: string): string;
  now(): Date;
}

export type StatusChangeResult =
  | { kind: "not_found" }
  | { kind: "conflict" }
  | { kind: "invalid_transition"; from: OrderStatus; to: OrderStatus; allowed: OrderStatus[] }
  | { kind: "field_required"; field: "tracking_number" | "courier_note"; message: string }
  | { kind: "ok"; data: AdminStatusChangeResult };

const nonEmpty = (v: string | null | undefined): string | null => (v === null || v === undefined || v.trim() === "" ? null : v.trim());

export async function changeOrderStatus(
  deps: StatusChangeDeps, input: { orderId: string; adminUserId: string; body: OrderStatusChangeBody },
): Promise<StatusChangeResult> {
  const { orderId, adminUserId, body } = input;
  const order = await deps.selectOrder(orderId);
  if (order === null) return { kind: "not_found" };
  if (!sameInstant(order.updated_at, body.updated_at)) return { kind: "conflict" };

  const to = body.to_status;
  if (!canTransition(order.kind, order.status, to)) {
    return { kind: "invalid_transition", from: order.status, to, allowed: allowedTransitions(order.kind, order.status) };
  }

  const nowIso = deps.now().toISOString();
  const patch: StatusPatch = { status: to };
  let trackingForNotice: string | null = null;
  if (to === "shipped") {
    if (order.delivery_method === "moscow_courier") {
      const note = nonEmpty(body.courier_note) ?? nonEmpty(order.courier_note);
      if (note === null) return { kind: "field_required", field: "courier_note", message: COURIER_NOTE_REQUIRED_MESSAGE };
      if (nonEmpty(body.courier_note) !== null) patch.courier_note = note;
    } else {
      const track = nonEmpty(body.tracking_number) ?? nonEmpty(order.tracking_number);
      if (track === null) return { kind: "field_required", field: "tracking_number", message: TRACKING_REQUIRED_MESSAGE };
      if (nonEmpty(body.tracking_number) !== null) patch.tracking_number = track;
      trackingForNotice = track;
    }
    patch.shipped_at = nowIso;
  } else if (to === "delivered") {
    patch.delivered_at = nowIso;
  } else if (to === "cancelled") {
    patch.cancelled_at = nowIso;
  }

  const updated = await deps.updateStatus(orderId, { updatedAt: order.updated_at, fromStatus: order.status }, patch);
  if (updated === null) return { kind: "conflict" };

  await writeHistory(deps, { order_id: orderId, from_status: order.status, to_status: to, changed_by: adminUserId, note: nonEmpty(body.note) });
  await notify(deps, order, to, trackingForNotice);

  return {
    kind: "ok",
    data: {
      id: updated.id, status: updated.status, status_label: orderStatusLabel(updated.status),
      allowed_transitions: allowedTransitions(order.kind, updated.status), updated_at: toIsoUtc(updated.updated_at),
    },
  };
}

/** Одна повторная попытка; затем лог — статус уже изменён, ответ остаётся 200. */
async function writeHistory(deps: StatusChangeDeps, row: StatusHistoryInsert): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await deps.insertHistory(row);
      return;
    } catch (err) {
      if (attempt === 2) {
        console.error({ scope: "admin.orders.status.history", orderId: row.order_id, from: row.from_status, to: row.to_status, err });
      }
    }
  }
}

async function notify(deps: StatusChangeDeps, order: OrderChangeRow, to: OrderStatus, trackingNumber: string | null): Promise<void> {
  try {
    let orderUrl: string | null = null;
    try {
      orderUrl = deps.orderUrl(order.number, order.client_request_id);
    } catch (err) {
      console.error({ scope: "admin.orders.status.orderUrl", orderId: order.id, err });
    }
    const queued = await deps.notifyStatusChanged({
      orderNumber: order.number, customerEmail: order.customer_email, status: to, trackingNumber, orderUrl,
    });
    if (!queued) console.error({ scope: "admin.orders.status.notify", orderId: order.id, to, msg: "уведомление не поставлено" });
  } catch (err) {
    console.error({ scope: "admin.orders.status.notify", orderId: order.id, to, err });
  }
}
