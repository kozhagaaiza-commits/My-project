import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { FakeYookassa, type FakeRequest } from "@/lib/payments/__fixtures__/fake-yookassa";
import { ORDER_ID, WHEEL_TITLE, type MemOrder } from "@/lib/payments/__fixtures__/memory-repo";
import { makeWorld, type World } from "@/lib/payments/__fixtures__/world";
import {
  RACE_LOSER_MESSAGE, RESTOCK_DELIVERED_MESSAGE, RESTOCK_PARTIAL_MESSAGE, RESTOCK_PREORDER_MESSAGE, createAdminRefundWith,
  type AdminRefundInput,
} from "@/lib/payments/admin-refund";
import { processPaymentObjectWith, processRefundObjectWith } from "@/lib/payments/process";
import { reconcileStalePaymentsWith } from "@/lib/payments/reconcile";
import { ADMIN_RETRYABLE_PREFIX } from "@/lib/payments/refund-refresh";
import { formatRub } from "@/lib/money";

// Ручной возврат из админки (Блок 3, US-008, BR-16, BR-17, Edge Cases 38, 40) на fake-ЮKassa и in-memory БД.

const ADMIN = "9f1c2b3a-4d5e-4f60-8a7b-1c2d3e4f5a6b";
const FULL = 13370000;

let fake: FakeYookassa;
let w: World;
const refundPosts = () => fake.requests.filter((r: FakeRequest) => r.method === "POST" && r.path === "/v3/refunds");
const order = () => w.repo.orders.get(ORDER_ID);
const input = (over: Partial<AdminRefundInput> = {}): AdminRefundInput =>
  ({ orderId: ORDER_ID, amount: FULL, reason: "Клиент отказался до отправки", restock: true, adminId: ADMIN, ...over });
const refund = (over: Partial<AdminRefundInput> = {}) => createAdminRefundWith(w.deps, input(over));
const customerRefunds = () => w.notes.filter((n) => n.template === "customer_refund");

/** Заказ оплачен через общий путь (webhook/сверка); журналы ЮKassa и уведомлений очищены. */
async function paid(orderOver: Partial<MemOrder> = {}): Promise<string> {
  const { status, ...rest } = orderOver;
  fake.reset(); // тот же заказ → тот же ключ order_<id>_1: fake вернул бы платёж прошлой итерации
  w = makeWorld(fake, rest);
  const id = await w.newPayment();
  assert.equal((await processPaymentObjectWith(w.deps, await w.payAndFetch(id))).kind, "paid");
  if (status) Object.assign(order() ?? {}, { status }); // админ провёл заказ дальше (shipped / delivered)
  w.notes.length = 0;
  fake.requests.length = 0;
  return id;
}

before(async () => { fake = await new FakeYookassa().start(); });
after(async () => { await fake.stop(); });
beforeEach(() => { fake.reset(); });
afterEach(() => mock.restoreAll());

describe("ручной возврат: полный", () => {
  it("succeeded → refunds, заказ refunded + история от админа, restock, customer_refund; POST /v3/refunds по Чертежу", async () => {
    const paymentId = await paid();
    const res = await refund();
    assert.equal(res.kind, "ok");
    if (res.kind !== "ok") return;
    const row = w.repo.refunds[0];
    assert.deepEqual(res.data, {
      refund_id: row.id, yookassa_refund_id: row.yookassa_refund_id, status: "succeeded",
      amount_formatted: formatRub(FULL), order_status: "refunded", restocked: true,
    });
    assert.deepEqual([row.status, row.amount, row.restock, row.created_by, row.reason], ["succeeded", FULL, true, ADMIN, "Клиент отказался до отправки"]);
    assert.equal(order()?.status, "refunded");
    assert.deepEqual(w.repo.history.at(-1), {
      order_id: ORDER_ID, from: "paid", to: "refunded", note: `Возврат ${formatRub(FULL)}: Клиент отказался до отправки`, changed_by: ADMIN,
    });
    assert.deepEqual(w.repo.restockCalls, [ORDER_ID]);
    assert.deepEqual(w.templates(), ["customer_refund"]);
    assert.deepEqual(customerRefunds()[0].payload, {
      order_number: "FC-26-000123", amount: FULL, amount_formatted: formatRub(FULL), order_url: customerRefunds()[0].payload.order_url,
    });

    const [post] = refundPosts();
    assert.equal(refundPosts().length, 1);
    assert.equal(post.headers["idempotence-key"], `refund_${row.id}`);
    const body = post.body as { payment_id: string; amount: unknown; description: string; receipt: { customer: unknown; items: unknown[] } };
    assert.equal(body.payment_id, paymentId);
    assert.deepEqual(body.amount, { value: "133700.00", currency: "RUB" });
    assert.equal(body.description, "Возврат по заказу FC-26-000123");
    assert.deepEqual(body.receipt.customer, { email: "artem.sokolov@yandex.ru", phone: "79165551234" });
    assert.deepEqual(body.receipt.items, [{
      description: WHEEL_TITLE, quantity: 1, amount: { value: "133700.00", currency: "RUB" },
      vat_code: 1, payment_mode: "full_prepayment", payment_subject: "commodity",
    }]);
  });

  it("BR-17: restock только для stock и не delivered; restock = false — без restock", async () => {
    for (const [over, restock, expected] of [
      [{ status: "delivered" }, false, []],
      [{ kind: "preorder" }, false, []],
      [{}, false, []],
      [{ status: "shipped" }, true, [ORDER_ID]],
    ] as const) {
      await paid(over);
      const res = await refund({ restock });
      assert.equal(res.kind === "ok" && res.data.order_status, "refunded", JSON.stringify(over));
      assert.equal(res.kind === "ok" && res.data.restocked, expected.length > 0);
      assert.deepEqual(w.repo.restockCalls, expected, JSON.stringify(over));
    }
  });

  it("BR-17: restock = true для preorder / delivered / неполной суммы → restock_not_allowed до записи и ЮKassa", async () => {
    for (const [over, amount, expected] of [
      [{ kind: "preorder" }, FULL, { message: RESTOCK_PREORDER_MESSAGE, partial: false }],
      [{ status: "delivered" }, FULL, { message: RESTOCK_DELIVERED_MESSAGE, partial: false }],
      [{}, 1000000, { message: `${RESTOCK_PARTIAL_MESSAGE}: ${formatRub(FULL)}`, partial: true }],
    ] as const) {
      await paid(over);
      assert.deepEqual(await refund({ amount, restock: true }), { kind: "restock_not_allowed", ...expected }, JSON.stringify(over));
      assert.deepEqual([w.repo.refunds.length, refundPosts().length, w.repo.restockCalls.length], [0, 0, 0]);
    }
  });

  it("BR-16 важнее BR-17: amount > refundable с restock = true → exceeds", async () => {
    await paid({ kind: "preorder" });
    assert.deepEqual(await refund({ amount: FULL + 1, restock: true }), { kind: "exceeds", refundable: FULL });
  });

  it("повторный клик после полного возврата → exceeds (0), второго возврата нет", async () => {
    await paid();
    assert.equal((await refund()).kind, "ok");
    assert.deepEqual(await refund(), { kind: "exceeds", refundable: 0 });
    assert.equal(refundPosts().length, 1);
    assert.equal(w.repo.refunds.length, 1);
  });
});

describe("ручной возврат: частичный (Edge Case 38) и BR-16", () => {
  it("частичный: заказ остаётся в статусе, restock не делается, чек пропорционален; остаток → refunded", async () => {
    w = makeWorld(fake);
    w.repo.items.set(ORDER_ID, [
      { title_snapshot: WHEEL_TITLE, quantity: 1, unit_price: 10030000 },
      { title_snapshot: "Колпачки M-01, 4 шт.", quantity: 1, unit_price: 3340000 },
    ]);
    const id = await w.newPayment();
    await processPaymentObjectWith(w.deps, await w.payAndFetch(id));
    w.notes.length = 0;
    fake.requests.length = 0;

    const part = await refund({ amount: 3340000, reason: "Брак одного диска", restock: false });
    assert.ok(part.kind === "ok");
    assert.deepEqual([part.data.status, part.data.order_status, part.data.restocked, part.data.amount_formatted], ["succeeded", "paid", false, formatRub(3340000)]);
    assert.equal(order()?.status, "paid");
    assert.deepEqual(w.repo.restockCalls, []);
    const items = (refundPosts()[0].body as { receipt: { items: Array<{ quantity: number; amount: { value: string } }> } }).receipt.items;
    assert.deepEqual(items.map((i) => [i.quantity, i.amount.value]), [[1, "25056.25"], [1, "8343.75"]]);
    assert.deepEqual(w.templates(), ["customer_refund"]);

    assert.deepEqual(await refund({ amount: FULL }), { kind: "exceeds", refundable: FULL - 3340000 });
    const rest = await refund({ amount: FULL - 3340000, restock: true });
    assert.ok(rest.kind === "ok");
    assert.deepEqual([rest.data.order_status, rest.data.restocked], ["refunded", true]);
    assert.deepEqual(w.repo.restockCalls, [ORDER_ID]);
    assert.equal(w.repo.refunds.filter((r) => r.status === "succeeded").length, 2);
  });

  it("неоплаченный заказ → exceeds 0; нет заказа → not_found; ЮKassa не вызывается", async () => {
    w = makeWorld(fake);
    assert.deepEqual(await refund(), { kind: "exceeds", refundable: 0 });
    assert.deepEqual(await refund({ orderId: "00000000-0000-4000-8000-000000000000" }), { kind: "not_found" });
    assert.equal(fake.requests.length, 0);
    assert.equal(w.repo.refunds.length, 0);
  });

  it("повторная оплата: к возврату — остаток одного платежа, возврат по основному", async () => {
    w = makeWorld(fake);
    const a = await w.newPayment();
    w.advance(60_000);
    const b = await w.newPayment();
    await processPaymentObjectWith(w.deps, await w.payAndFetch(a, { captured_at: "2026-10-01T12:34:00.000Z" }));
    fake.refundStatus = "pending"; // автовозврат B завис в ЮKassa
    await processPaymentObjectWith(w.deps, await w.payAndFetch(b, { captured_at: "2026-10-01T12:35:00.000Z" }));
    fake.refundStatus = "succeeded";
    fake.requests.length = 0;

    assert.deepEqual(await refund({ amount: FULL + 1 }), { kind: "exceeds", refundable: FULL });
    const res = await refund();
    assert.equal(res.kind, "ok");
    assert.equal((refundPosts()[0].body as { payment_id: string }).payment_id, a);
    // B ещё не вернулся (pending): оплачено 2 × 133 700, возвращено 133 700 — заказ не refunded.
    assert.equal(order()?.status, "paid");
  });
});

describe("ручной возврат: ошибки ЮKassa (Edge Case 40)", () => {
  it("4xx → failed + error_message, rejected с description и code; заказ и остаток не меняются", async () => {
    await paid();
    fake.interceptTimes(1, (r) => r.path === "/v3/refunds", { status: 400, json: { type: "error", code: "invalid_request", description: "Недостаточно средств на балансе магазина" } });
    assert.deepEqual(await refund(), { kind: "rejected", description: "Недостаточно средств на балансе магазина", code: "invalid_request" });
    assert.deepEqual(w.repo.refunds.map((r) => [r.status, r.error_message]), [["failed", "Недостаточно средств на балансе магазина"]]);
    assert.equal(order()?.status, "paid");
    assert.deepEqual([w.repo.restockCalls, w.templates()], [[], []]);
    assert.equal(refundPosts().length, 1); // 4xx не повторяется

    // Админ повторяет позже: failed не занимает сумму, создаётся новая строка (новый ключ — 4xx не дошёл до возврата).
    const again = await refund();
    assert.equal(again.kind, "ok");
    assert.equal(w.repo.refunds.length, 2);
    assert.notEqual(refundPosts()[0].headers["idempotence-key"], refundPosts()[1].headers["idempotence-key"]);
  });

  it("canceled → failed с причиной, rejected «Недостаточно средств…» / insufficient_funds", async () => {
    await paid();
    fake.refundStatus = "canceled";
    assert.deepEqual(await refund(), { kind: "rejected", description: "Недостаточно средств на балансе магазина", code: "insufficient_funds" });
    const [row] = w.repo.refunds;
    assert.deepEqual([row.status, row.error_message, Boolean(row.yookassa_refund_id)], ["failed", "Недостаточно средств на балансе магазина", true]);
    assert.equal(order()?.status, "paid");
    assert.deepEqual(w.templates(), []);
  });

  it("сеть / 5xx → unavailable, failed с пометкой; повтор той же суммы — ТА ЖЕ строка и ключ refund_<id>", async () => {
    mock.method(console, "error", () => {});
    await paid();
    fake.interceptTimes(3, (r) => r.path === "/v3/refunds", { status: 503, json: { type: "error", code: "internal_server_error" } });
    assert.deepEqual(await refund({ reason: "Первая попытка" }), { kind: "unavailable" });
    assert.equal(refundPosts().length, 3);
    const [row] = w.repo.refunds;
    assert.equal(row.status, "failed");
    assert.ok(row.error_message?.startsWith(ADMIN_RETRYABLE_PREFIX));

    const res = await refund({ reason: "Клиент отказался до отправки" });
    assert.ok(res.kind === "ok");
    assert.equal(w.repo.refunds.length, 1);
    assert.equal(res.data.refund_id, row.id);
    assert.ok(refundPosts().every((p) => p.headers["idempotence-key"] === `refund_${row.id}`));
    assert.deepEqual([w.repo.refunds[0].status, w.repo.refunds[0].reason], ["succeeded", "Клиент отказался до отправки"]);
    assert.equal(order()?.status, "refunded");
  });

  it("после сбоя связи другая сумма — новая строка; через 23 ч та же сумма — тоже новая (ключ ЮKassa истёк)", async () => {
    mock.method(console, "error", () => {});
    await paid();
    fake.interceptTimes(3, (r) => r.path === "/v3/refunds", { status: 500 });
    await refund({ amount: 1000000, restock: false });
    w.advance(23 * 3600_000);
    const res = await refund({ amount: 1000000, restock: false });
    assert.ok(res.kind === "ok");
    assert.equal(w.repo.refunds.length, 2);
    assert.notEqual(res.data.refund_id, w.repo.refunds[0].id);
  });
});

describe("ручной возврат: повторный клик и гонки (US-008)", () => {
  it("ЮKassa ответила pending: сумма занята, повторный клик → exceeds; refund.succeeded завершает общим путём", async () => {
    await paid();
    fake.refundStatus = "pending";
    const first = await refund();
    assert.ok(first.kind === "ok");
    assert.deepEqual([first.data.status, first.data.order_status, first.data.restocked], ["pending", "paid", false]);
    assert.deepEqual(w.templates(), []);

    assert.deepEqual(await refund(), { kind: "exceeds", refundable: 0 });
    assert.equal(refundPosts().length, 1);

    // webhook refund.succeeded (объект — из НАШЕГО GET): заказ refunded, история от админа, restock, одно письмо.
    const ykId = first.data.yookassa_refund_id ?? "";
    fake.refunds.get(ykId)!.status = "succeeded";
    const r = await w.yk.getRefund(ykId);
    assert.equal((await processRefundObjectWith(w.deps, r)).kind, "refund_succeeded");
    assert.equal(order()?.status, "refunded");
    assert.equal(w.repo.history.at(-1)?.changed_by, ADMIN);
    assert.deepEqual(w.repo.restockCalls, [ORDER_ID]);
    assert.equal((await processRefundObjectWith(w.deps, r)).kind, "refund_already_succeeded");
    assert.deepEqual(w.repo.restockCalls, [ORDER_ID]);
    assert.equal(customerRefunds().length, 1);
  });

  it("запрос без ответа ЮKassa моложе 5 минут → in_progress без обращения к ЮKassa", async () => {
    await paid();
    const pay = w.repo.payments[0];
    await w.repo.insertRefund({ order_id: ORDER_ID, payment_id: pay.id, amount: 1000000, reason: "Первый клик", restock: false, created_by: ADMIN });
    w.advance(4 * 60_000);
    assert.deepEqual(await refund({ amount: 1000000, restock: false }), { kind: "in_progress" });
    assert.equal(fake.requests.length, 0);
    assert.equal(w.repo.refunds.length, 1);
  });

  it("сирота старше 5 минут → failed с пометкой; повтор той же суммы шлёт её ключ refund_<id>", async () => {
    await paid();
    const pay = w.repo.payments[0];
    const ins = await w.repo.insertRefund({ order_id: ORDER_ID, payment_id: pay.id, amount: 1000000, reason: "Первый клик", restock: false, created_by: ADMIN });
    const orphan = "row" in ins ? ins.row : undefined;
    if (!orphan) throw new Error("insertRefund: conflict");
    w.advance(6 * 60_000);
    const res = await refund({ amount: 1000000, reason: "Повтор после обрыва", restock: false });
    assert.ok(res.kind === "ok");
    assert.equal(res.data.refund_id, orphan.id);
    assert.equal(refundPosts()[0].headers["idempotence-key"], `refund_${orphan.id}`);
    assert.equal(w.repo.refunds.length, 1);
  });

  it("два одновременных запроса → в ЮKassa уходит один, второй отменён до отправки (in_progress)", async () => {
    await paid();
    const [x, y] = await Promise.all([refund({ amount: 1000000, restock: false }), refund({ amount: 1000000, restock: false })]);
    assert.deepEqual([x.kind, y.kind].sort(), ["in_progress", "ok"]);
    assert.equal(refundPosts().length, 1);
    assert.deepEqual(w.repo.refunds.map((r) => r.status).sort(), ["canceled", "succeeded"]);
    assert.equal(w.repo.refunds.find((r) => r.status === "canceled")?.error_message, RACE_LOSER_MESSAGE);
  });

  it("23505 при insert (uq_refunds_duplicate_payment) → conflict", async () => {
    await paid();
    w.repo.insertRefund = async () => ({ conflict: true as const });
    assert.deepEqual(await refund(), { kind: "conflict" });
    assert.equal(fake.requests.length, 0);
  });
});

describe("ручной возврат: заказ pending_payment / cancelled — сначала сверка (опоздавший webhook)", () => {
  it("в ЮKassa succeeded, webhook не дошёл → сверка: paid + уведомления, затем возврат → refunded", async () => {
    w = makeWorld(fake);
    const id = await w.newPayment();
    fake.succeed(id, "sbp");
    w.advance(61_000);
    fake.requests.length = 0;
    const res = await refund();
    assert.ok(res.kind === "ok");
    assert.equal(res.data.order_status, "refunded");
    assert.deepEqual(w.templates(), ["admin_order_paid", "customer_order_paid", "customer_refund"]);
    assert.deepEqual([fake.requests[0].method, fake.requests[0].path], ["GET", `/v3/payments/${id}`]); // сверка — до возврата
    // Поздний webhook payment.succeeded после возврата: статус refunded не откатывается в paid, уведомлений нет.
    assert.notEqual((await processPaymentObjectWith(w.deps, await w.yk.getPayment(id))).kind, "paid");
    assert.equal(order()?.status, "refunded");
  });

  it("cancelled (бронь истекла), оплата прошла → сверка переводит в paid, возврат проходит (Edge Case 43)", async () => {
    w = makeWorld(fake);
    const id = await w.newPayment();
    Object.assign(order() ?? {}, { status: "cancelled" }); // cancel_expired_orders снял бронь
    fake.succeed(id, "sbp");
    w.advance(61_000);
    const res = await refund({ restock: false });
    assert.ok(res.kind === "ok");
    assert.equal(order()?.status, "refunded");
  });

  it("строка payments succeeded, заказ не оплачен, сверка ещё рано (< 60 с) → payment_unconfirmed без ЮKassa", async () => {
    w = makeWorld(fake);
    await w.newPayment();
    w.repo.payments[0].status = "succeeded"; // сбой между обновлением payments и mark_order_paid
    fake.requests.length = 0;
    assert.deepEqual(await refund(), { kind: "payment_unconfirmed" });
    assert.deepEqual([fake.requests.length, w.repo.refunds.length, order()?.status], [0, 0, "pending_payment"]);
  });

  it("сверка не уложилась в бюджет → payment_unconfirmed; возврат не создаётся", async () => {
    mock.method(console, "error", () => {});
    w = makeWorld(fake);
    await w.newPayment();
    const never = new Promise<never>(() => {});
    const res = await createAdminRefundWith(w.deps, input(), { reconcile: () => never, reconcileBudgetMs: 20 });
    assert.deepEqual(res, { kind: "payment_unconfirmed" });
    assert.equal(w.repo.refunds.length, 0);
  });

  it("сверка бросила → тот же итог по БД: платёж pending → exceeds 0 (возвращать нечего)", async () => {
    w = makeWorld(fake);
    await w.newPayment();
    const res = await createAdminRefundWith(w.deps, input(), { reconcile: async () => { throw new Error("boom"); } });
    assert.deepEqual(res, { kind: "exceeds", refundable: 0 });
  });

  it("оплаченный заказ — сверка не вызывается", async () => {
    await paid();
    let called = 0;
    const res = await createAdminRefundWith(w.deps, input(), { reconcile: async () => { called += 1; } });
    assert.equal(res.kind, "ok");
    assert.equal(called, 0);
  });
});

describe("сверка cron: pending ручные возвраты (webhook не дошёл / ЮKassa отменила)", () => {
  it("pending → canceled в ЮKassa: строка failed, сумма снова доступна; pending → succeeded: общий путь", async () => {
    await paid();
    fake.refundStatus = "pending";
    const first = await refund({ amount: 1000000, restock: false });
    assert.ok(first.kind === "ok");
    const ykId = first.data.yookassa_refund_id ?? "";
    Object.assign(fake.refunds.get(ykId) ?? {}, { status: "canceled", cancellation_details: { party: "yoo_money", reason: "general_decline" } });

    const sum = await reconcileStalePaymentsWith(w.deps);
    assert.deepEqual(sum.manual_refunds, { inFlight: false, checked: 1, changed: 1, errors: 0 });
    assert.deepEqual([w.repo.refunds[0].status, w.repo.refunds[0].error_message], ["failed", "Отказ без объяснения причин"]);

    const second = await refund({ restock: false });
    assert.ok(second.kind === "ok" && second.data.status === "pending");
    fake.refunds.get(second.data.yookassa_refund_id ?? "")!.status = "succeeded";
    await reconcileStalePaymentsWith(w.deps);
    assert.equal(order()?.status, "refunded");
    assert.deepEqual(w.repo.restockCalls, []);
    assert.equal(customerRefunds().length, 1);
  });
});
