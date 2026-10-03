import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { notifyDeliveryChanged } from "@/lib/notifications/customer-status";
import type { NotificationInput } from "@/lib/notifications/types";

// notifyDeliveryChanged (A47): customer_status_changed со сроком/заметкой — email и (если подписан) Telegram.

const P = {
  orderNumber: "FC-26-000123", customerEmail: "artem.sokolov@yandex.ru", status: "ordered_from_supplier", trackingNumber: null,
  orderUrl: "https://forgecarbon.vercel.app/orders/FC-26-000123?t=abc", expectedReadyAt: "2026-11-12", customerVisibleNote: "Задержка на таможне",
};

describe("notifyDeliveryChanged", () => {
  afterEach(() => mock.restoreAll());

  it("email + Telegram подписанного покупателя, payload со сроком и заметкой, kick после постановки", async () => {
    const queued: NotificationInput[] = [];
    let kicks = 0;
    const ok = await notifyDeliveryChanged(
      { enqueue: async (n) => { queued.push(n); return true; }, customerChatId: async () => "512398764", kick: async () => { kicks++; } }, P,
    );
    assert.equal(ok, true);
    assert.deepEqual(queued.map((n) => [n.channel, n.template]), [["email", "customer_status_changed"], ["telegram", "customer_status_changed"]]);
    const payload = queued[0].payload as unknown as Record<string, unknown>;
    assert.equal(payload.expected_ready_at, "2026-11-12");
    assert.equal(payload.customer_visible_note, "Задержка на таможне");
    assert.equal(payload.status, "ordered_from_supplier");
    assert.equal(kicks, 1);
  });

  it("без подписки в боте — только email; сбой постановки → false и не бросает", async () => {
    const queued: NotificationInput[] = [];
    assert.equal(await notifyDeliveryChanged({ enqueue: async (n) => { queued.push(n); return true; }, customerChatId: async () => null }, P), true);
    assert.deepEqual(queued.map((n) => n.channel), ["email"]);
    mock.method(console, "error", () => {});
    assert.equal(await notifyDeliveryChanged({ enqueue: async () => { throw new Error("db down"); } }, P), false);
  });
});
