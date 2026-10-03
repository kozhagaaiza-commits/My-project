import type { OrderMetaPatchBody } from "@/lib/schemas/admin-orders";
import type { AdminMetaPatchResult } from "./order-types";
import type { MetaPatch, MetaResultRow, OrderChangeRow } from "./orders-write";
import { sameInstant, toIsoUtc } from "./timestamps";

// PATCH /api/admin/orders/[id] (Блок 3; Блок 4 «Админка — Заказ»; Edge Cases 14, 21, 46): заметки, трек, ожидаемая дата,
// снятие отметки needs_attention — без смены статуса. Оптимистическая блокировка по updated_at.
//
// Уведомление «Срок поставки изменился» (при изменении expected_ready_at или customer_visible_note): в Чертеже нет шаблона
// для него — список notification_queue.template (2.13) и тексты 5.9.2 содержат только 8 шаблонов, customer_status_changed
// описан как «Заказ …: <статус>. Трек СДЭК: …» (смена статуса). Шаблон не выдумываем:
// TODO(owner, День 6): решение по шаблону (новый template + миграция CHECK, либо явное разрешение переиспользовать
// customer_status_changed) — до этого deps.notifyDeliveryChanged не задан и customer_notified = false.

export interface MetaPatchDeps {
  selectOrder(orderId: string): Promise<OrderChangeRow | null>;
  updateMeta(orderId: string, updatedAt: string, patch: MetaPatch): Promise<MetaResultRow | null>;
  /** «Срок поставки изменился»; не бросает. Не задан — уведомление не отправляется (см. TODO выше). */
  notifyDeliveryChanged?(p: {
    orderNumber: string; customerEmail: string; clientRequestId: string;
    expectedReadyAt: string | null; customerVisibleNote: string | null;
  }): Promise<boolean>;
}

export type MetaPatchResult = { kind: "not_found" } | { kind: "conflict" } | { kind: "ok"; data: AdminMetaPatchResult };

const TEXT_FIELDS = ["customer_visible_note", "admin_note", "courier_note", "tracking_number"] as const;

/** Только переданные поля; пустая строка в текстовом поле = очистка (null). */
export function buildMetaPatch(body: OrderMetaPatchBody): MetaPatch {
  const patch: MetaPatch = {};
  if (body.expected_ready_at !== undefined) patch.expected_ready_at = body.expected_ready_at;
  for (const f of TEXT_FIELDS) {
    const v = body[f];
    if (v !== undefined) patch[f] = v === null || v === "" ? null : v;
  }
  if (body.needs_attention !== undefined) patch.needs_attention = body.needs_attention;
  return patch;
}

export async function patchOrderMeta(deps: MetaPatchDeps, input: { orderId: string; body: OrderMetaPatchBody }): Promise<MetaPatchResult> {
  const order = await deps.selectOrder(input.orderId);
  if (order === null) return { kind: "not_found" };
  if (!sameInstant(order.updated_at, input.body.updated_at)) return { kind: "conflict" };

  const patch = buildMetaPatch(input.body);
  if (Object.keys(patch).length === 0) {
    return {
      kind: "ok",
      data: { id: order.id, expected_ready_at: order.expected_ready_at, customer_notified: false, updated_at: toIsoUtc(order.updated_at) },
    };
  }

  const updated = await deps.updateMeta(order.id, order.updated_at, patch);
  if (updated === null) return { kind: "conflict" };

  const deliveryChanged =
    (patch.expected_ready_at !== undefined && patch.expected_ready_at !== order.expected_ready_at)
    || (patch.customer_visible_note !== undefined && patch.customer_visible_note !== order.customer_visible_note);

  let customerNotified = false;
  if (deliveryChanged && deps.notifyDeliveryChanged) {
    try {
      customerNotified = await deps.notifyDeliveryChanged({
        orderNumber: order.number, customerEmail: order.customer_email, clientRequestId: order.client_request_id,
        expectedReadyAt: updated.expected_ready_at,
        customerVisibleNote: patch.customer_visible_note !== undefined ? patch.customer_visible_note : order.customer_visible_note,
      });
    } catch (err) {
      console.error({ scope: "admin.orders.meta.notify", orderId: order.id, err });
    }
  }

  return {
    kind: "ok",
    data: { id: updated.id, expected_ready_at: updated.expected_ready_at, customer_notified: customerNotified, updated_at: toIsoUtc(updated.updated_at) },
  };
}
