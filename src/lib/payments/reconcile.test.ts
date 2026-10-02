import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { FakeYookassa } from "@/lib/payments/__fixtures__/fake-yookassa";
import { MemoryPaymentsRepo, ORDER_ID, fakeClient, makeDeps, sampleItems, sampleOrder } from "@/lib/payments/__fixtures__/memory-repo";
import { createPaymentForOrderWith } from "@/lib/payments/create";
import type { PaymentsDeps } from "@/lib/payments/deps";
import { reconcileOrderPaymentsWith, reconcileStalePaymentsWith } from "@/lib/payments/reconcile";
import type { NotificationInput } from "@/lib/notifications/types";

const T0 = new Date("2026-10-01T12:30:00.000Z");
let fake: FakeYookassa;
let repo: MemoryPaymentsRepo;
let deps: PaymentsDeps;
let notes: NotificationInput[];
let now: Date;
const at = (ms: number) => { now = new Date(T0.getTime() + ms); };
const gets = () => fake.requests.filter((r) => r.method === "GET").length;

async function pendingPayment(): Promise<string> {
  const res = await createPaymentForOrderWith(deps, ORDER_ID);
  assert.ok(res.ok);
  return res.paymentId;
}

before(async () => { fake = await new FakeYookassa().start(); });
after(async () => { await fake.stop(); });
beforeEach(() => {
  fake.reset();
  now = T0;
  repo = new MemoryPaymentsRepo(() => now);
  repo.addOrder(sampleOrder({}, T0), sampleItems());
  ({ deps, notifications: notes } = makeDeps(repo, fakeClient(fake)));
});
afterEach(() => mock.restoreAll());

describe("reconcileOrderPayments: webhook не дошёл (Edge Case 4)", () => {
  it("pending-платёж проверен > 60 с назад, в ЮKassa succeeded → тот же путь, что webhook: paid + уведомления", async () => {
    const id = await pendingPayment();
    fake.succeed(id);
    at(61_000);
    const sum = await reconcileOrderPaymentsWith(deps, ORDER_ID);
    assert.equal(sum.checked, 1);
    assert.equal(sum.paid, 1);
    assert.equal(repo.orders.get(ORDER_ID)?.status, "paid");
    assert.deepEqual(notes.map((n) => n.template), ["admin_order_paid", "customer_order_paid"]);
  });

  it("проверка не чаще раза в 60 с: свежий updated_at → без запроса; после проверки updated_at сдвигается", async () => {
    await pendingPayment();
    at(59_000);
    assert.equal((await reconcileOrderPaymentsWith(deps, ORDER_ID)).checked, 0);
    assert.equal(gets(), 0);
    at(120_000);
    assert.equal((await reconcileOrderPaymentsWith(deps, ORDER_ID)).checked, 1); // всё ещё pending
    assert.equal(gets(), 1);
    at(150_000);
    assert.equal((await reconcileOrderPaymentsWith(deps, ORDER_ID)).checked, 0);
    assert.equal(gets(), 1);
  });

  it("заказ уже оплачен → сверка не нужна; cancelled (бронь истекла) — проверяется (Edge Case 43)", async () => {
    const id = await pendingPayment();
    at(120_000);
    const o = repo.orders.get(ORDER_ID);
    if (!o) throw new Error("no order");
    o.status = "paid";
    assert.equal((await reconcileOrderPaymentsWith(deps, ORDER_ID)).checked, 0);
    o.status = "cancelled";
    fake.succeed(id);
    const sum = await reconcileOrderPaymentsWith(deps, ORDER_ID);
    assert.equal(sum.paid, 1);
    assert.equal(o.status, "paid");
    assert.equal(o.attention_reason, "Оплачен после истечения брони");
  });

  it("ЮKassa недоступна / БД упала → итог с failed, без исключения", async () => {
    mock.method(console, "error", () => {});
    await pendingPayment();
    at(120_000);
    fake.intercept(() => ({ status: 500 }));
    const sum = await reconcileOrderPaymentsWith(deps, ORDER_ID);
    assert.deepEqual([sum.checked, sum.failed, sum.paid], [1, 1, 0]);
    repo.failOnce.set("getOrder", new Error("db down"));
    assert.equal((await reconcileOrderPaymentsWith(deps, ORDER_ID)).failed, 1);
  });
});

describe("reconcileStalePayments (cron, шаг 4)", () => {
  it("все pending младше 48 ч; старше — не проверяются", async () => {
    const order = repo.orders.get(ORDER_ID);
    if (order) order.reserved_until = new Date(T0.getTime() + 3 * 3600_000).toISOString(); // чтобы создать второй платёж позже
    const old = await pendingPayment(); // создан в T0
    at(2 * 3600_000);
    const fresh = await pendingPayment();
    fake.succeed(fresh);
    fake.succeed(old);
    at(49 * 3600_000); // old — 49 ч, fresh — 47 ч
    fake.requests.length = 0;
    const sum = await reconcileStalePaymentsWith(deps);
    assert.equal(sum.checked, 1);
    assert.equal(sum.items[0].payment_id, fresh);
    assert.equal(sum.paid, 1);
    assert.equal(gets(), 1);
  });
  it("ошибка БД при выборке → failed без исключения", async () => {
    mock.method(console, "error", () => {});
    repo.failOnce.set("listPendingPaymentsSince", new Error("db down"));
    assert.equal((await reconcileStalePaymentsWith(deps)).failed, 1);
  });
});
