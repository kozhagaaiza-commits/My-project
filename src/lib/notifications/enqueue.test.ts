import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertNotification } from "@/lib/notifications/enqueue";
import { NOTIFICATION_TEMPLATES, type NotificationInput } from "@/lib/notifications/types";

const N: NotificationInput = {
  channel: "email", recipient: "artem.sokolov@yandex.ru", template: "customer_refund",
  payload: { order_number: "FC-26-000123", amount: 13370000, amount_formatted: "133 700 ₽", order_url: null },
};

function client(error: { message: string; code?: string } | null) {
  const inserts: Array<[string, unknown]> = [];
  const c = { from: (t: string) => ({ insert: async (row: unknown) => { inserts.push([t, row]); return { data: null, error }; } }) };
  return { inserts, c: c as unknown as SupabaseClient };
}

describe("enqueueNotification → notification_queue (2.13)", () => {
  afterEach(() => mock.restoreAll());

  it("insert строки pending; next_attempt_at и attempts — значения по умолчанию таблицы", async () => {
    const { inserts, c } = client(null);
    assert.equal(await insertNotification(c, N), true);
    assert.deepEqual(inserts, [["notification_queue", { channel: "email", recipient: "artem.sokolov@yandex.ru", template: "customer_refund", payload: N.payload, status: "pending" }]]);
  });

  it("ошибка БД не пробрасывается: false + структурный лог без получателя", async () => {
    const log = mock.method(console, "error", () => {});
    const { c } = client({ message: "new row violates check constraint", code: "23514" });
    assert.equal(await insertNotification(c, N), false);
    assert.equal(log.mock.callCount(), 1);
    const entry = log.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(entry.scope, "notifications.enqueue");
    assert.doesNotMatch(JSON.stringify(entry), /artem\.sokolov/);
  });

  it("шаблоны — ровно из CHECK таблицы", () => {
    assert.deepEqual([...NOTIFICATION_TEMPLATES].sort(), [
      "admin_atelier_applied", "admin_attention", "admin_order_paid", "atelier_approved", "atelier_rejected",
      "customer_order_paid", "customer_refund", "customer_status_changed",
    ]);
  });
});
