import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { FakeYookassa, type FakeRequest } from "@/lib/payments/__fixtures__/fake-yookassa";
import {
  ADMIN_CHAT, MemoryPaymentsRepo, ORDER_ID, SITE, WHEEL_TITLE, fakeClient, makeDeps, sampleItems, sampleOrder, testOrderUrl,
} from "@/lib/payments/__fixtures__/memory-repo";
import { PaymentOrderError, createPaymentForOrderWith } from "@/lib/payments/create";

const T0 = new Date("2026-10-01T12:30:00.000Z");
let fake: FakeYookassa;
let repo: MemoryPaymentsRepo;
let now: Date;
const isCreate = (r: FakeRequest) => r.method === "POST" && r.path === "/v3/payments";

function setup(orderOver = {}) {
  now = T0;
  repo = new MemoryPaymentsRepo(() => now);
  repo.addOrder(sampleOrder(orderOver, T0), sampleItems());
  return makeDeps(repo, fakeClient(fake));
}

before(async () => { fake = await new FakeYookassa().start(); });
after(async () => { await fake.stop(); });
beforeEach(() => fake.reset());
afterEach(() => mock.restoreAll());

describe("createPaymentForOrder: успешное создание", () => {
  it("attempt 1: ключ order_<id>_1, return_url со ссылкой заказа и &from=payment, строка payments", async () => {
    const { deps, notifications } = setup();
    const res = await createPaymentForOrderWith(deps, ORDER_ID);
    assert.equal(res.ok, true);
    assert.ok(res.ok);
    assert.equal(res.reused, false);
    const req = fake.requests[0];
    assert.equal(req.headers["idempotence-key"], `order_${ORDER_ID}_1`);
    const body = req.body as { confirmation: { return_url: string }; amount: { value: string }; receipt: { items: Array<{ description: string; quantity: number; amount: { value: string } }> } };
    assert.equal(body.confirmation.return_url, `${testOrderUrl("FC-26-000123", sampleOrder().client_request_id)}&from=payment`);
    assert.equal(body.amount.value, "133700.00");
    assert.deepEqual(body.receipt.items.map((i) => [i.description, i.quantity, i.amount.value]), [[WHEEL_TITLE, 1, "133700.00"]]);

    assert.equal(repo.payments.length, 1);
    const row = repo.payments[0];
    assert.equal(row.yookassa_payment_id, res.paymentId);
    assert.equal(row.idempotence_key, `order_${ORDER_ID}_1`);
    assert.equal(row.status, "pending");
    assert.equal(row.amount, 13370000);
    assert.equal(row.payment_method_type, null);
    assert.equal(res.confirmationUrl, (row.raw as { confirmation: { confirmation_url: string } }).confirmation.confirmation_url);
    assert.deepEqual(notifications, []);
  });

  it("attempt = число строк payments + 1 (повторная оплата после отмены)", async () => {
    const { deps } = setup();
    await createPaymentForOrderWith(deps, ORDER_ID);
    fake.cancel(repo.payments[0].yookassa_payment_id);
    repo.payments[0].status = "canceled";
    await createPaymentForOrderWith(deps, ORDER_ID, { reuseWithinSeconds: 600 });
    assert.deepEqual(fake.requests.filter(isCreate).map((r) => r.headers["idempotence-key"]), [`order_${ORDER_ID}_1`, `order_${ORDER_ID}_2`]);
    assert.equal(repo.payments.length, 2);
  });
});

describe("createPaymentForOrder: повторное использование pending-платежа (POST /pay, 10 мин)", () => {
  it("pending моложе reuseWithinSeconds → тот же confirmation_url без обращения к ЮKassa", async () => {
    const { deps } = setup();
    const first = await createPaymentForOrderWith(deps, ORDER_ID);
    now = new Date(T0.getTime() + 9 * 60_000);
    fake.requests.length = 0;
    const again = await createPaymentForOrderWith(deps, ORDER_ID, { reuseWithinSeconds: 600 });
    assert.ok(first.ok && again.ok);
    assert.equal(again.reused, true);
    assert.equal(again.confirmationUrl, first.confirmationUrl);
    assert.equal(again.paymentId, first.paymentId);
    assert.equal(fake.requests.length, 0);
  });

  it("старше 10 минут → новый платёж с attempt + 1", async () => {
    const { deps } = setup();
    await createPaymentForOrderWith(deps, ORDER_ID);
    now = new Date(T0.getTime() + 11 * 60_000);
    const again = await createPaymentForOrderWith(deps, ORDER_ID, { reuseWithinSeconds: 600 });
    assert.ok(again.ok);
    assert.equal(again.reused, false);
    assert.equal(fake.requests.at(-1)?.headers["idempotence-key"], `order_${ORDER_ID}_2`);
  });

  it("без reuseWithinSeconds (создание заказа) свежий pending не переиспользуется", async () => {
    const { deps } = setup();
    await createPaymentForOrderWith(deps, ORDER_ID);
    const again = await createPaymentForOrderWith(deps, ORDER_ID);
    assert.ok(again.ok && !again.reused);
    assert.equal(repo.payments.length, 2);
  });
});

describe("createPaymentForOrder: заказ не оплачивается", () => {
  it("не pending_payment / бронь истекла / нет брони → ORDER_NOT_PAYABLE без запросов в ЮKassa", async () => {
    for (const over of [{ status: "paid" as const }, { status: "cancelled" as const }, { reserved_until: new Date(T0.getTime() - 1000).toISOString() }, { reserved_until: T0.toISOString() }, { reserved_until: null }]) {
      const { deps } = setup(over);
      await assert.rejects(createPaymentForOrderWith(deps, ORDER_ID), (e: unknown) => e instanceof PaymentOrderError && e.code === "ORDER_NOT_PAYABLE", JSON.stringify(over));
    }
    assert.equal(fake.requests.length, 0);
  });
  it("нет заказа → ORDER_NOT_FOUND", async () => {
    const { deps } = setup();
    await assert.rejects(createPaymentForOrderWith(deps, "00000000-0000-4000-8000-000000000000"), (e: unknown) => e instanceof PaymentOrderError && e.code === "ORDER_NOT_FOUND");
  });
});

describe("createPaymentForOrder: ошибки ЮKassa (Edge Cases 2, 39)", () => {
  it("4xx → provider_rejected с description/code + admin_attention «Ошибка создания платежа»; строки payments нет", async () => {
    mock.method(console, "error", () => {});
    fake.intercept((r) => (isCreate(r) ? { status: 400, json: { type: "error", code: "invalid_request", description: "Invalid receipt: vat_code is invalid", parameter: "receipt.items[0].vat_code" } } : undefined));
    const { deps, notifications } = setup();
    const res = await createPaymentForOrderWith(deps, ORDER_ID);
    assert.deepEqual(res, { ok: false, kind: "provider_rejected", message: "Invalid receipt: vat_code is invalid", yookassaCode: "invalid_request" });
    assert.equal(fake.requests.length, 1, "4xx не повторяется");
    assert.equal(repo.payments.length, 0);
    assert.deepEqual(notifications, [{
      channel: "telegram", recipient: ADMIN_CHAT, template: "admin_attention",
      payload: { order_id: ORDER_ID, order_number: "FC-26-000123", kind: "payment_create_failed", reason: "Invalid receipt: vat_code is invalid", admin_url: `${SITE}/admin/orders/${ORDER_ID}` },
    }]);
  });

  it("5xx × 3 → provider_unavailable (→ 502 с order_url), без admin_attention; следующий вызов — тот же ключ", async () => {
    mock.method(console, "error", () => {});
    fake.interceptTimes(3, isCreate, { status: 500, json: { type: "error", code: "internal_server_error" } });
    const { deps, notifications } = setup();
    const res = await createPaymentForOrderWith(deps, ORDER_ID);
    assert.deepEqual(res, { ok: false, kind: "provider_unavailable", message: "Платёжный сервис временно недоступен" });
    assert.equal(fake.requests.length, 3);
    assert.deepEqual(notifications, []);
    assert.equal(repo.payments.length, 0);
    const retry = await createPaymentForOrderWith(deps, ORDER_ID);
    assert.ok(retry.ok);
    assert.equal(fake.requests.at(-1)?.headers["idempotence-key"], `order_${ORDER_ID}_1`);
  });

  it("таймаут → provider_unavailable", async () => {
    mock.method(console, "error", () => {});
    fake.intercept(() => "hang");
    repo = new MemoryPaymentsRepo(() => T0);
    repo.addOrder(sampleOrder({}, T0), sampleItems());
    const { deps } = makeDeps(repo, fakeClient(fake, { timeoutMs: 30 }));
    const res = await createPaymentForOrderWith(deps, ORDER_ID);
    assert.equal(res.ok, false);
    assert.equal(!res.ok && res.kind, "provider_unavailable");
  });

  it("ошибка постановки admin_attention не ломает ответ", async () => {
    mock.method(console, "error", () => {});
    fake.intercept(() => ({ status: 400, json: { type: "error", code: "invalid_request", description: "bad" } }));
    const { deps } = setup();
    const res = await createPaymentForOrderWith({ ...deps, enqueue: async () => { throw new Error("queue down"); } }, ORDER_ID);
    assert.equal(!res.ok && res.kind, "provider_rejected");
  });
});

describe("createPaymentForOrder: общий бюджет deadlineMs", () => {
  it("deadlineMs передаётся в клиент (остаток бюджета); без него — без ограничения", async () => {
    const { deps } = setup();
    const seen: Array<number | undefined> = [];
    const spy = { ...deps.yookassa, createPayment: async (...a: Parameters<typeof deps.yookassa.createPayment>) => {
      seen.push(a[1]?.deadlineMs);
      return deps.yookassa.createPayment(...a);
    } };
    await createPaymentForOrderWith({ ...deps, yookassa: spy }, ORDER_ID, { deadlineMs: 25_000 });
    await createPaymentForOrderWith({ ...deps, yookassa: spy }, ORDER_ID);
    assert.ok(seen[0] !== undefined && seen[0] <= 25_000 && seen[0] > 24_000, String(seen[0]));
    assert.equal(seen[1], undefined);
  });

  it("ЮKassa не отвечает: бюджет исчерпан → provider_unavailable, без ожидания полных 3 × 15 с", async () => {
    mock.method(console, "error", () => {});
    fake.intercept(() => "hang");
    repo = new MemoryPaymentsRepo(() => T0);
    repo.addOrder(sampleOrder({}, T0), sampleItems());
    const { deps, notifications } = makeDeps(repo, fakeClient(fake, { timeoutMs: 15_000 }));
    const started = Date.now();
    const res = await createPaymentForOrderWith(deps, ORDER_ID, { deadlineMs: 200 });
    assert.deepEqual(res, { ok: false, kind: "provider_unavailable", message: "Платёжный сервис временно недоступен" });
    assert.ok(Date.now() - started < 3000);
    assert.deepEqual(notifications, []);
  });
});

describe("createPaymentForOrder: гонка вставки payments", () => {
  it("два параллельных вызова с одним attempt → один платёж ЮKassa, одна строка, оба ok с одной ссылкой", async () => {
    const { deps } = setup();
    const [a, b] = await Promise.all([createPaymentForOrderWith(deps, ORDER_ID), createPaymentForOrderWith(deps, ORDER_ID)]);
    assert.ok(a.ok && b.ok);
    assert.equal(a.confirmationUrl, b.confirmationUrl);
    assert.equal(repo.payments.length, 1);
    assert.equal(fake.payments.size, 1);
  });
});
