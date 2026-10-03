import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { FakeYookassa } from "@/lib/payments/__fixtures__/fake-yookassa";
import {
  ADMIN_CHAT, MemoryPaymentsRepo, ORDER_ID, SITE, WHEEL_TITLE, fakeClient, makeDeps, sampleItems, sampleOrder, testOrderUrl,
} from "@/lib/payments/__fixtures__/memory-repo";
import { createPaymentForOrderWith } from "@/lib/payments/create";
import { processPaymentObjectWith, processRefundObjectWith } from "@/lib/payments/process";
import type { PaymentsDeps } from "@/lib/payments/deps";
import type { NotificationInput } from "@/lib/notifications/types";
import type { YookassaClient } from "@/lib/yookassa";

const T0 = new Date("2026-10-01T12:30:00.000Z");
let fake: FakeYookassa;
let repo: MemoryPaymentsRepo;
let yk: YookassaClient;
let deps: PaymentsDeps;
let notes: NotificationInput[];
let now: Date;

function setup(orderOver = {}) {
  now = T0;
  repo = new MemoryPaymentsRepo(() => now);
  repo.addOrder(sampleOrder(orderOver, T0), sampleItems());
  yk = fakeClient(fake);
  ({ deps, notifications: notes } = makeDeps(repo, yk));
}

/** Создать платёж нашим кодом и вернуть его id в ЮKassa. */
async function newPayment(): Promise<string> {
  const res = await createPaymentForOrderWith(deps, ORDER_ID);
  assert.ok(res.ok);
  return res.paymentId;
}
/** Покупатель оплатил на странице ЮKassa → объект, полученный НАШИМ GET. */
async function payAndFetch(id: string, extra: Record<string, unknown> = {}) {
  fake.succeed(id, "sbp", extra);
  return yk.getPayment(id);
}
const templates = () => notes.map((n) => n.template);

before(async () => { fake = await new FakeYookassa().start(); });
after(async () => { await fake.stop(); });
beforeEach(() => { fake.reset(); setup(); });
afterEach(() => mock.restoreAll());

describe("processPaymentObject: succeeded → mark_order_paid → уведомления", () => {
  it("paid: заказ оплачен, payments обновлён, admin_order_paid + customer_order_paid", async () => {
    const id = await newPayment();
    const res = await processPaymentObjectWith(deps, await payAndFetch(id));
    assert.deepEqual(res, { kind: "paid", orderId: ORDER_ID, mark: "paid" });
    assert.equal(repo.orders.get(ORDER_ID)?.status, "paid");
    assert.deepEqual(repo.markPaidCalls, [{ orderId: ORDER_ID, amount: 13370000 }]);
    const row = repo.paymentRaw(id);
    assert.equal(row?.status, "succeeded");
    assert.equal(row?.payment_method_type, "sbp");
    assert.equal((row?.raw as { status: string }).status, "succeeded");

    assert.deepEqual(templates(), ["admin_order_paid", "customer_order_paid"]);
    assert.deepEqual(notes[0], {
      channel: "telegram", recipient: ADMIN_CHAT, template: "admin_order_paid",
      payload: {
        order_id: ORDER_ID, order_number: "FC-26-000123", total: 13370000, total_formatted: notes[0].template === "admin_order_paid" ? notes[0].payload.total_formatted : "",
        items: [{ title: WHEEL_TITLE, quantity: 1 }], vehicle_label: "BMW 5 Series G30", vin: "WBAJA11050B123456",
        delivery_label: "Казань · СДЭК ПВЗ KZN45", admin_url: `${SITE}/admin/orders/${ORDER_ID}`, needs_attention: false,
      },
    });
    assert.match(notes[0].template === "admin_order_paid" ? notes[0].payload.total_formatted : "", /^133\s700\s₽$/);
    const customer = notes[1];
    assert.equal(customer.channel, "email");
    assert.equal(customer.recipient, "artem.sokolov@yandex.ru");
    assert.ok(customer.template === "customer_order_paid");
    assert.equal(customer.payload.order_url, testOrderUrl("FC-26-000123", sampleOrder().client_request_id));
    assert.equal(customer.payload.delivery_method_label, "СДЭК — пункт выдачи");
    assert.equal(customer.payload.items[0].line_total, 13370000);
  });

  it("повторный вызов (дубликат webhook / сверка) → already_paid, уведомления не дублируются (Edge Case 16)", async () => {
    const id = await newPayment();
    const p = await payAndFetch(id);
    await processPaymentObjectWith(deps, p);
    const again = await processPaymentObjectWith(deps, p);
    assert.deepEqual(again, { kind: "already_paid", orderId: ORDER_ID });
    assert.deepEqual(templates(), ["admin_order_paid", "customer_order_paid"]);
    assert.equal(repo.refunds.length, 0);
  });

  it("сумма — из ответа API: расхождение → paid_needs_attention + admin_attention с причиной (Edge Case 15)", async () => {
    const id = await newPayment();
    const res = await processPaymentObjectWith(deps, await payAndFetch(id, { amount: { value: "133600.00", currency: "RUB" } }));
    assert.deepEqual(res, { kind: "paid", orderId: ORDER_ID, mark: "paid_needs_attention" });
    assert.deepEqual(repo.markPaidCalls, [{ orderId: ORDER_ID, amount: 13360000 }]);
    assert.deepEqual(templates(), ["admin_order_paid", "customer_order_paid", "admin_attention"]);
    const attention = notes[2];
    assert.ok(attention.template === "admin_attention");
    assert.equal(attention.payload.kind, "paid_needs_attention");
    assert.match(attention.payload.reason, /Сумма платежа 13360000 коп\. не равна сумме заказа 13370000 коп\./);
  });

  it("оплата после истечения брони (заказ cancelled) → paid_needs_attention (Edge Cases 11, 43)", async () => {
    const id = await newPayment();
    const o = repo.orders.get(ORDER_ID);
    if (o) o.status = "cancelled";
    const res = await processPaymentObjectWith(deps, await payAndFetch(id));
    assert.equal(res.kind === "paid" && res.mark, "paid_needs_attention");
    const attention = notes.find((n) => n.template === "admin_attention");
    assert.ok(attention?.template === "admin_attention");
    assert.match(attention.payload.reason, /Оплачен после истечения брони/);
  });

  it("порядок: сбой mark_order_paid → строка payments остаётся pending, уведомлений нет; повтор webhook доводит до paid", async () => {
    const id = await newPayment();
    repo.failOnce.set("markOrderPaid", new Error("rpc.mark_order_paid: 57014 timeout"));
    const p = await payAndFetch(id);
    await assert.rejects(processPaymentObjectWith(deps, p), /mark_order_paid/);
    assert.deepEqual(notes, []);
    assert.equal(repo.paymentRaw(id)?.status, "pending", "succeeded ставится только после mark_order_paid");
    assert.equal(repo.orders.get(ORDER_ID)?.status, "pending_payment");
    assert.equal((await processPaymentObjectWith(deps, p)).kind, "paid");
    assert.equal(repo.paymentRaw(id)?.status, "succeeded");
    assert.deepEqual(templates(), ["admin_order_paid", "customer_order_paid"]);
  });

  it("сбой перевода payments в succeeded после оплаты: уведомления уже поставлены, повтор не дублирует их", async () => {
    const id = await newPayment();
    const p = await payAndFetch(id);
    repo.failOnce.set("updatePayment", new Error("payments.update: 08006"));
    await assert.rejects(processPaymentObjectWith(deps, p), /payments\.update/);
    assert.equal(repo.orders.get(ORDER_ID)?.status, "paid");
    assert.deepEqual(templates(), ["admin_order_paid", "customer_order_paid"]);
    assert.deepEqual(await processPaymentObjectWith(deps, p), { kind: "already_paid", orderId: ORDER_ID });
    assert.equal(repo.paymentRaw(id)?.status, "succeeded");
    assert.equal(notes.length, 2);
  });

  it("сбой чтения заказа для уведомлений после оплаты: не 500, needs_attention «Уведомление об оплате не поставлено в очередь»", async () => {
    mock.method(console, "error", () => {});
    const id = await newPayment();
    const p = await payAndFetch(id);
    repo.failOnce.set("getOrderItems", new Error("db down"));
    assert.equal((await processPaymentObjectWith(deps, p)).kind, "paid");
    assert.deepEqual(notes, []);
    assert.equal(repo.orders.get(ORDER_ID)?.needs_attention, true);
    assert.equal(repo.orders.get(ORDER_ID)?.attention_reason, "Уведомление об оплате не поставлено в очередь");
  });

  it("enqueue вернул false или бросил → needs_attention; повтор webhook — already_paid без уведомлений", async () => {
    mock.method(console, "error", () => {});
    for (const enqueue of [async () => false, async () => { throw new Error("queue down"); }]) {
      fake.reset();
      setup();
      const id = await newPayment();
      const p = await payAndFetch(id);
      const d = { ...deps, enqueue };
      assert.equal((await processPaymentObjectWith(d, p)).kind, "paid");
      const o = repo.orders.get(ORDER_ID);
      assert.equal(o?.needs_attention, true);
      assert.match(o?.attention_reason ?? "", /Уведомление об оплате не поставлено в очередь/);
      assert.deepEqual(await processPaymentObjectWith(deps, p), { kind: "already_paid", orderId: ORDER_ID });
      assert.deepEqual(notes, []);
    }
  });

  it("валюта не RUB → mark_order_paid НЕ вызывается, needs_attention + admin_attention один раз", async () => {
    mock.method(console, "error", () => {});
    const id = await newPayment();
    const p = await payAndFetch(id, { amount: { value: "1500.00", currency: "USD" } });
    assert.deepEqual(await processPaymentObjectWith(deps, p), { kind: "currency_mismatch", orderId: ORDER_ID, currency: "USD" });
    assert.deepEqual(repo.markPaidCalls, []);
    const o = repo.orders.get(ORDER_ID);
    assert.equal(o?.status, "pending_payment");
    assert.equal(o?.needs_attention, true);
    assert.match(o?.attention_reason ?? "", new RegExp(`Платёж ${id} в валюте USD`));
    assert.deepEqual(templates(), ["admin_attention"]);
    assert.ok(notes[0].template === "admin_attention" && notes[0].payload.kind === "payment_currency_mismatch");
    await processPaymentObjectWith(deps, p); // повтор: без новых уведомлений
    assert.equal(notes.length, 1);
    assert.deepEqual(repo.markPaidCalls, []);
  });
});

describe("processPaymentObject: canceled / pending / устаревшие ответы", () => {
  it("canceled → только payments (cancellation_reason), заказ не трогается (Edge Cases 35, 37)", async () => {
    const id = await newPayment();
    fake.cancel(id, "insufficient_funds");
    const res = await processPaymentObjectWith(deps, await yk.getPayment(id));
    assert.deepEqual(res, { kind: "canceled", orderId: ORDER_ID, reason: "insufficient_funds" });
    assert.equal(repo.orders.get(ORDER_ID)?.status, "pending_payment");
    assert.equal(repo.paymentRaw(id)?.status, "canceled");
    assert.equal(repo.paymentRaw(id)?.cancellation_reason, "insufficient_funds");
    assert.deepEqual(repo.markPaidCalls, []);
    assert.deepEqual(notes, []);
  });

  it("pending / waiting_for_capture → только обновление payments", async () => {
    const id = await newPayment();
    now = new Date(T0.getTime() + 120_000);
    assert.deepEqual(await processPaymentObjectWith(deps, await yk.getPayment(id)), { kind: "updated", orderId: ORDER_ID, status: "pending" });
    assert.equal(repo.paymentRaw(id)?.updated_at, now.toISOString(), "updated_at сдвинут (троттлинг сверки)");
    fake.setPayment(id, { status: "waiting_for_capture" });
    assert.deepEqual(await processPaymentObjectWith(deps, await yk.getPayment(id)), { kind: "updated", orderId: ORDER_ID, status: "waiting_for_capture" });
    assert.deepEqual(repo.markPaidCalls, []);
  });

  it("устаревший ответ pending после succeeded не откатывает статус", async () => {
    const id = await newPayment();
    const stalePending = await yk.getPayment(id);
    await processPaymentObjectWith(deps, await payAndFetch(id));
    assert.deepEqual(await processPaymentObjectWith(deps, stalePending), { kind: "stale", orderId: ORDER_ID, status: "pending" });
    assert.equal(repo.paymentRaw(id)?.status, "succeeded");
  });
});

describe("processPaymentObject: строки payments нет", () => {
  it("восстановление по metadata.order_id из ответа API → paid", async () => {
    mock.method(console, "error", () => {});
    fake.addPayment({
      id: "30a8d2c1-000f-5000-9000-1b6c4d2e8f10", status: "succeeded", paid: true, amount: { value: "133700.00", currency: "RUB" },
      payment_method: { type: "bank_card", id: "pm" }, metadata: { order_id: ORDER_ID, order_number: "FC-26-000123" },
      created_at: T0.toISOString(), captured_at: T0.toISOString(),
    });
    const res = await processPaymentObjectWith(deps, await yk.getPayment("30a8d2c1-000f-5000-9000-1b6c4d2e8f10"));
    assert.equal(res.kind, "paid");
    assert.equal(repo.payments[0].idempotence_key, "recovered_30a8d2c1-000f-5000-9000-1b6c4d2e8f10");
    assert.equal(repo.payments[0].payment_method_type, "bank_card");
  });

  it("заказ из metadata не существует / metadata нет → ignored без исключения", async () => {
    mock.method(console, "error", () => {});
    const base = { status: "succeeded", paid: true, amount: { value: "1.00", currency: "RUB" }, created_at: T0.toISOString() };
    fake.addPayment({ id: "pay-unknown-order-1", ...base, metadata: { order_id: "00000000-0000-4000-8000-000000000000" } });
    fake.addPayment({ id: "pay-no-metadata-01", ...base });
    assert.deepEqual(await processPaymentObjectWith(deps, await yk.getPayment("pay-unknown-order-1")), { kind: "ignored", reason: "unknown_order" });
    assert.deepEqual(await processPaymentObjectWith(deps, await yk.getPayment("pay-no-metadata-01")), { kind: "ignored", reason: "no_order_id" });
    assert.equal(repo.payments.length, 0);
    assert.deepEqual(repo.markPaidCalls, []);
  });
});

describe("processRefundObject (refund.succeeded)", () => {
  it("строка без yookassa_refund_id (ответ POST /refunds не дошёл) находится по платежу и сумме", async () => {
    const id = await newPayment();
    await processPaymentObjectWith(deps, await payAndFetch(id));
    const pay = repo.paymentRaw(id);
    const ins = await repo.insertRefund({ order_id: ORDER_ID, payment_id: pay?.id ?? "", amount: 3340000, reason: "Брак одного диска", restock: false });
    if (!("row" in ins) || !ins.row) throw new Error("insert");
    const row = ins.row;
    await repo.updateRefund(row.id, { status: "failed", error_message: "YooKassa недоступна" });
    const r = await yk.createRefund({ refundId: row.id, paymentId: id, amount: 3340000, description: "x", receipt: { customer: { email: "a@b.ru", phone: "7" }, items: [] } });
    assert.equal((await processRefundObjectWith(deps, r)).kind, "refund_succeeded");
    assert.equal(repo.refunds[0].yookassa_refund_id, r.id);
  });
  it("неизвестный возврат (создан в кабинете ЮKassa) → refund_unknown без исключения; не succeeded — ничего", async () => {
    mock.method(console, "error", () => {});
    const refund = { id: "rf-unknown-000001", payment_id: "pay-x", status: "succeeded" as const, amount: { value: "10.00", currency: "RUB" }, created_at: T0.toISOString() };
    assert.deepEqual(await processRefundObjectWith(deps, refund), { kind: "refund_unknown" });
    assert.deepEqual(await processRefundObjectWith(deps, { ...refund, status: "canceled" }), { kind: "refund_not_succeeded", status: "canceled" });
  });
});
