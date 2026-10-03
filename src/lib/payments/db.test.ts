import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  ORDER_FOR_PAYMENT_COLUMNS, PAYMENT_COLUMNS, REFUND_COLUMNS, appendAttention, createPaymentsRepo, type Db,
} from "@/lib/payments/db";

// Запросы PostgREST платёжного контура на записывающем мок-клиенте: колонки, фильтры, RPC и разбор ответов.

type Res = { data: unknown; error: { message: string; code?: string } | null };
type Call = [string, ...unknown[]];

function recorder(results: Res[]) {
  const calls: Call[] = [];
  const next = () => results.shift() ?? { data: null, error: null };
  const builder: object = new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") {
        const res = next();
        return (ok: (v: Res) => unknown, fail: (e: unknown) => unknown) => Promise.resolve(res).then(ok, fail);
      }
      return (...args: unknown[]) => { calls.push([String(prop), ...args]); return builder; };
    },
  });
  const db = {
    from: (t: string) => { calls.push(["from", t]); return builder; },
    rpc: async (...a: unknown[]) => { calls.push(["rpc", ...a]); return next(); },
  } as unknown as Db;
  return { calls, repo: createPaymentsRepo(db) };
}

const PAYMENT_ROW = {
  id: "p1", order_id: "o1", yookassa_payment_id: "yk1", status: "pending", amount: 13370000,
  created_at: "2026-10-01T12:30:00+00:00", updated_at: "2026-10-01T12:30:00+00:00",
  confirmation_url: "https://yoomoney.ru/checkout/x", captured_at: null,
};

describe("payments/db: явные колонки, без служебных полей заказа", () => {
  afterEach(() => mock.restoreAll());

  it("getOrder: только нужные колонки + авто через связь; admin_note/telegram_chat_id/public_token_hash не читаются", async () => {
    const { calls, repo } = recorder([{ data: null, error: null }]);
    assert.equal(await repo.getOrder("o1"), null);
    assert.deepEqual(calls, [["from", "orders"], ["select", ORDER_FOR_PAYMENT_COLUMNS], ["eq", "id", "o1"], ["maybeSingle"]]);
    assert.doesNotMatch(ORDER_FOR_PAYMENT_COLUMNS, /admin_note|telegram_chat_id|public_token_hash|attention|\*/);
    assert.match(ORDER_FOR_PAYMENT_COLUMNS, /vehicle:vehicles\(make,model,generation\)/);
  });

  it("payments: confirmation_url и captured_at — JSON-путями из raw", async () => {
    assert.match(PAYMENT_COLUMNS, /confirmation_url:raw->confirmation->>confirmation_url/);
    assert.match(PAYMENT_COLUMNS, /captured_at:raw->>captured_at/);
    const { calls, repo } = recorder([{ data: [PAYMENT_ROW], error: null }]);
    assert.equal((await repo.listOrderPayments("o1"))[0].confirmation_url, "https://yoomoney.ru/checkout/x");
    assert.deepEqual(calls, [["from", "payments"], ["select", PAYMENT_COLUMNS], ["eq", "order_id", "o1"], ["order", "created_at", { ascending: true }]]);
  });

  it("insertPayment: 23505 → conflict; иная ошибка → исключение со scope", async () => {
    const row = { order_id: "o1", yookassa_payment_id: "yk1", idempotence_key: "order_o1_1", status: "pending" as const, amount: 1, payment_method_type: null, cancellation_reason: null, raw: {} };
    assert.deepEqual(await recorder([{ data: null, error: { code: "23505", message: "duplicate key" } }]).repo.insertPayment(row), { conflict: true });
    await assert.rejects(recorder([{ data: null, error: { code: "42501", message: "denied" } }]).repo.insertPayment(row), /payments\.insert: 42501/);
    const ok = recorder([{ data: PAYMENT_ROW, error: null }]);
    assert.equal(("row" in (await ok.repo.insertPayment(row))), true);
    assert.deepEqual(ok.calls.slice(0, 2), [["from", "payments"], ["insert", row]]);
  });

  it("updatePayment: фильтр по допустимым исходным статусам (без отката succeeded/canceled)", async () => {
    const { calls, repo } = recorder([{ data: [], error: null }]);
    const patch = { status: "pending" as const, payment_method_type: null, cancellation_reason: null, raw: {} };
    assert.equal(await repo.updatePayment("yk1", patch, ["pending"]), null);
    assert.deepEqual(calls, [["from", "payments"], ["update", patch], ["eq", "yookassa_payment_id", "yk1"], ["in", "status", ["pending"]], ["select", PAYMENT_COLUMNS]]);
  });

  it("markOrderPaid: rpc mark_order_paid(p_order_id, p_amount); неизвестный ответ отклоняется", async () => {
    const { calls, repo } = recorder([{ data: "paid_needs_attention", error: null }, { data: "weird", error: null }, { data: null, error: { message: "ORDER_NOT_FOUND", code: "P0001" } }]);
    assert.equal(await repo.markOrderPaid("o1", 13370000), "paid_needs_attention");
    assert.deepEqual(calls[0], ["rpc", "mark_order_paid", { p_order_id: "o1", p_amount: 13370000 }]);
    await assert.rejects(repo.markOrderPaid("o1", 1));
    await assert.rejects(repo.markOrderPaid("o1", 1), /rpc\.mark_order_paid: P0001 ORDER_NOT_FOUND/);
  });

  it("refunds: insert pending, условный перевод в succeeded (neq succeeded)", async () => {
    const refund = { id: "r1", order_id: "o1", payment_id: "p1", yookassa_refund_id: null, amount: 100, status: "pending", reason: "Повторная оплата", error_message: null, created_at: "2026-10-01T12:30:00.123456+00:00" };
    const ins = recorder([{ data: refund, error: null }]);
    const newRefund = { order_id: "o1", payment_id: "p1", amount: 100, reason: "Повторная оплата", restock: false };
    assert.deepEqual(await ins.repo.insertRefund(newRefund), { row: refund });
    assert.deepEqual(ins.calls[1], ["insert", { ...newRefund, status: "pending" }]);
    assert.deepEqual(ins.calls[2], ["select", REFUND_COLUMNS]);
    // Индекс uq_refunds_duplicate_payment (если применён): 23505 → conflict, не исключение.
    assert.deepEqual(await recorder([{ data: null, error: { code: "23505", message: "uq_refunds_duplicate_payment" } }]).repo.insertRefund(newRefund), { conflict: true });
    await assert.rejects(recorder([{ data: null, error: { code: "23514", message: "check" } }]).repo.insertRefund(newRefund), /refunds\.insert: 23514/);

    const flip = recorder([{ data: [{ id: "r1" }], error: null }, { data: [], error: null }]);
    assert.equal(await flip.repo.markRefundSucceeded("r1", "ykr1"), true);
    assert.equal(await flip.repo.markRefundSucceeded("r1", "ykr1"), false);
    assert.deepEqual(flip.calls.slice(0, 5), [["from", "refunds"], ["update", { status: "succeeded", yookassa_refund_id: "ykr1", error_message: null }], ["eq", "id", "r1"], ["neq", "status", "succeeded"], ["select", "id"]]);
  });

  it("flagOrderAttention: дописывает причину, needs_attention = true", async () => {
    const { calls, repo } = recorder([{ data: { needs_attention: true, attention_reason: "Оплачен после истечения брони" }, error: null }, { data: null, error: null }]);
    await repo.flagOrderAttention("o1", "Повторная оплата");
    assert.deepEqual(calls.slice(-2), [["update", { needs_attention: true, attention_reason: "Оплачен после истечения брони; Повторная оплата" }], ["eq", "id", "o1"]]);
  });

  it("listPendingPaymentsSince: status = pending и created_at ≥ since", async () => {
    const { calls, repo } = recorder([{ data: [], error: null }]);
    await repo.listPendingPaymentsSince("2026-09-29T12:00:00.000Z");
    assert.deepEqual(calls, [["from", "payments"], ["select", PAYMENT_COLUMNS], ["eq", "status", "pending"], ["gte", "created_at", "2026-09-29T12:00:00.000Z"], ["order", "created_at", { ascending: true }]]);
  });

  it("сверка: succeeded-платежи неоплаченных заказов (inner join) и незавершённые автовозвраты", async () => {
    const a = recorder([{ data: [{ ...PAYMENT_ROW, status: "succeeded", orders: { status: "pending_payment" } }], error: null }]);
    assert.equal((await a.repo.listSucceededPaymentsOfUnpaidOrders())[0].status, "succeeded");
    assert.deepEqual(a.calls, [["from", "payments"], ["select", `${PAYMENT_COLUMNS},orders!inner(status)`], ["eq", "status", "succeeded"],
      ["in", "orders.status", ["pending_payment", "cancelled"]], ["order", "created_at", { ascending: true }]]);
    const b = recorder([{ data: [], error: null }]);
    await b.repo.listOpenRefundsByReason("Повторная оплата", "2026-09-29T12:00:00.000Z");
    assert.deepEqual(b.calls, [["from", "refunds"], ["select", REFUND_COLUMNS], ["eq", "reason", "Повторная оплата"], ["in", "status", ["pending", "failed"]],
      ["gte", "created_at", "2026-09-29T12:00:00.000Z"], ["order", "created_at", { ascending: true }]]);
  });

  it("возвраты (День 6): REFUND_COLUMNS с restock и created_by; pending за окно сверки", async () => {
    assert.match(REFUND_COLUMNS, /,restock,created_by$/);
    const { calls, repo } = recorder([{ data: [], error: null }]);
    await repo.listPendingRefundsSince("2026-09-29T12:00:00.000Z");
    assert.deepEqual(calls, [["from", "refunds"], ["select", REFUND_COLUMNS], ["eq", "status", "pending"],
      ["gte", "created_at", "2026-09-29T12:00:00.000Z"], ["order", "created_at", { ascending: true }]]);
    const ins = recorder([{ data: { id: "r1", order_id: "o1", payment_id: "p1", yookassa_refund_id: null, amount: 100, status: "pending", reason: "Брак диска", error_message: null, created_at: "2026-10-01T12:30:00+00:00", restock: true, created_by: "u1" }, error: null }]);
    const row = { order_id: "o1", payment_id: "p1", amount: 100, reason: "Брак диска", restock: true, created_by: "u1" };
    const res = await ins.repo.insertRefund(row);
    assert.ok("row" in res && res.row.restock === true && res.row.created_by === "u1");
    assert.deepEqual(ins.calls[1], ["insert", { ...row, status: "pending" }]);
  });

  it("markOrderRefunded: условный update по прочитанному статусу + история; не совпал статус → false без истории", async () => {
    const won = recorder([{ data: [{ id: "o1" }], error: null }, { data: null, error: null }]);
    assert.equal(await won.repo.markOrderRefunded("o1", "shipped", "u1", "Возврат: брак"), true);
    assert.deepEqual(won.calls, [
      ["from", "orders"], ["update", { status: "refunded" }], ["eq", "id", "o1"], ["eq", "status", "shipped"], ["select", "id"],
      ["from", "order_status_history"], ["insert", { order_id: "o1", from_status: "shipped", to_status: "refunded", changed_by: "u1", note: "Возврат: брак" }],
    ]);
    const lost = recorder([{ data: [], error: null }]);
    assert.equal(await lost.repo.markOrderRefunded("o1", "paid", null, "x"), false);
    assert.equal(lost.calls.filter((c) => c[0] === "from").length, 1);
    await assert.rejects(recorder([{ data: [{ id: "o1" }], error: null }, { data: null, error: { code: "23514", message: "check" } }])
      .repo.markOrderRefunded("o1", "paid", null, "x"), /order_status_history\.insert: 23514/);
  });

  it("restockOrder: rpc restock_order(p_order_id); ошибка → исключение", async () => {
    const { calls, repo } = recorder([{ data: null, error: null }, { data: null, error: { code: "42501", message: "denied" } }]);
    await repo.restockOrder("o1");
    assert.deepEqual(calls[0], ["rpc", "restock_order", { p_order_id: "o1" }]);
    await assert.rejects(repo.restockOrder("o1"), /rpc\.restock_order: 42501/);
  });

  it("ответ неверной формы → исключение Zod", async () => {
    await assert.rejects(recorder([{ data: [{ ...PAYMENT_ROW, amount: "13370000" }], error: null }]).repo.listOrderPayments("o1"));
  });

  it("appendAttention: ≤ 300 символов (CHECK orders.attention_reason)", () => {
    assert.equal(appendAttention(null, "A"), "A");
    assert.equal(appendAttention("A", "B"), "A; B");
    assert.equal(appendAttention("x".repeat(290), "y".repeat(20)).length, 300);
  });
});
