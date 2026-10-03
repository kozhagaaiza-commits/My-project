import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { FakeYookassa, type FakeRequest } from "@/lib/payments/__fixtures__/fake-yookassa";
import { ORDER_ID, WHEEL_TITLE } from "@/lib/payments/__fixtures__/memory-repo";
import { makeWorld, type World } from "@/lib/payments/__fixtures__/world";
import {
  DUPLICATE_LOSER_REASON, DUPLICATE_REFUND_REASON, RETRYABLE_PREFIX, RETRY_FAILED_PREFIX, earliestRefund, pickPrimaryPayment,
} from "@/lib/payments/duplicates";
import { processPaymentObjectWith } from "@/lib/payments/process";
import { needsRedelivery } from "@/lib/payments/process-types";
import { reconcileStalePaymentsWith } from "@/lib/payments/reconcile";
import type { YookassaPayment } from "@/lib/yookassa";

// Повторная оплата (Edge Case 36): автоматический возврат лишнего платежа — порядок, идемпотентность, гонки, сироты, повтор.

let fake: FakeYookassa;
let w: World;
const refundPosts = () => fake.requests.filter((r: FakeRequest) => r.method === "POST" && r.path === "/v3/refunds");
const dupRows = () => w.repo.refunds.filter((r) => r.reason === DUPLICATE_REFUND_REASON);
const attentionReasons = () => w.notes.flatMap((n) => (n.template === "admin_attention" ? [n.payload.reason] : []));

/** Две вкладки: A и B созданы и оплачены; A захвачен раньше (основной). */
async function twoPaid(): Promise<{ a: string; b: string; pa: YookassaPayment; pb: YookassaPayment }> {
  const a = await w.newPayment();
  w.advance(60_000);
  const b = await w.newPayment();
  const pa = await w.payAndFetch(a, { captured_at: "2026-10-01T12:34:09.553Z" });
  const pb = await w.payAndFetch(b, { captured_at: "2026-10-01T12:35:00.000Z" });
  return { a, b, pa, pb };
}

before(async () => { fake = await new FakeYookassa().start(); });
after(async () => { await fake.stop(); });
beforeEach(() => { fake.reset(); w = makeWorld(fake); });
afterEach(() => mock.restoreAll());

describe("повторная оплата: основной сценарий", () => {
  it("второй succeeded → полный возврат ЭТОГО платежа: refunds, чек, needs_attention, admin_attention сразу, customer_refund", async () => {
    const { b, pa, pb } = await twoPaid();
    assert.equal((await processPaymentObjectWith(w.deps, pa)).kind, "paid");
    w.notes.length = 0;
    fake.requests.length = 0;

    const res = await processPaymentObjectWith(w.deps, pb);
    const refund = dupRows()[0];
    assert.deepEqual(res, { kind: "refunded_duplicate", orderId: ORDER_ID, refunds: [{ payment_id: b, refund_id: refund.id, status: "succeeded" }] });
    assert.equal(dupRows().length, 1);
    assert.deepEqual([refund.payment_id, refund.amount, refund.restock, refund.status], [w.repo.paymentRaw(b)?.id, 13370000, false, "succeeded"]);
    assert.ok(refund.yookassa_refund_id);

    const post = refundPosts()[0];
    assert.equal(post.headers["idempotence-key"], `refund_${refund.id}`);
    const body = post.body as { payment_id: string; amount: { value: string }; description: string; receipt: { items: Array<{ description: string; quantity: number; amount: { value: string } }> } };
    assert.equal(body.payment_id, b);
    assert.equal(body.amount.value, "133700.00");
    assert.equal(body.description, "Возврат по заказу FC-26-000123");
    assert.deepEqual(body.receipt.items.map((i) => [i.description, i.quantity, i.amount.value]), [[WHEEL_TITLE, 1, "133700.00"]]);

    const order = w.repo.orders.get(ORDER_ID);
    assert.equal(order?.status, "paid");
    assert.equal(order?.needs_attention, true);
    assert.match(order?.attention_reason ?? "", /Повторная оплата: платёж .+, автоматический возврат 133\s700\s₽/);
    assert.deepEqual(w.templates(), ["admin_attention", "customer_refund"], "admin_attention — сразу после insert");
    assert.match(attentionReasons()[0], /оформляется автоматический возврат/);
  });

  it("идемпотентность: повтор второго и повторная доставка ПЕРВОГО не создают возвратов и уведомлений", async () => {
    const { pa, pb } = await twoPaid();
    await processPaymentObjectWith(w.deps, pa);
    await processPaymentObjectWith(w.deps, pb);
    const before = w.notes.length;
    assert.deepEqual(await processPaymentObjectWith(w.deps, pb), { kind: "already_paid", orderId: ORDER_ID });
    assert.deepEqual(await processPaymentObjectWith(w.deps, pa), { kind: "already_paid", orderId: ORDER_ID });
    assert.equal(w.repo.refunds.length, 1);
    assert.equal(w.notes.length, before);
    assert.equal(fake.refunds.size, 1);
  });

  it("основной — ранний по captured_at, даже если его уведомление пришло вторым", async () => {
    const { a, pa, pb } = await twoPaid();
    await processPaymentObjectWith(w.deps, pb);
    const res = await processPaymentObjectWith(w.deps, pa);
    assert.equal(res.kind, "refunded_duplicate");
    assert.notEqual(res.kind === "refunded_duplicate" && res.refunds[0].payment_id, a);
    assert.equal(fake.refunds.size, 1);
  });

  it("новый порядок: строка первого платежа ещё pending в БД (обработчик упал после mark) → GET уточняет, лишний возвращается", async () => {
    mock.method(console, "error", () => {});
    const { b, pa, pb } = await twoPaid();
    w.repo.failOnce.set("updatePayment", new Error("payments.update: 08006"));
    await assert.rejects(processPaymentObjectWith(w.deps, pa)); // заказ оплачен, строка A осталась pending
    assert.equal(w.repo.paymentRaw(pa.id)?.status, "pending");
    const res = await processPaymentObjectWith(w.deps, pb);
    assert.equal(res.kind === "refunded_duplicate" && res.refunds[0].payment_id, b);
    assert.equal(fake.refunds.size, 1);
  });

  it("возврат из админки по этому платежу уже есть → автоматический не создаётся", async () => {
    const { b, pa, pb } = await twoPaid();
    await processPaymentObjectWith(w.deps, pa);
    const pay = w.repo.paymentRaw(b);
    await w.repo.insertRefund({ order_id: ORDER_ID, payment_id: pay?.id ?? "", amount: 13370000, reason: "Клиент оплатил дважды", restock: false });
    assert.deepEqual(await processPaymentObjectWith(w.deps, pb), { kind: "already_paid", orderId: ORDER_ID });
    assert.equal(refundPosts().length, 0);
  });
});

describe("повторная оплата: гонки обработчиков", () => {
  for (const index of [false, true]) {
    const label = index ? "с индексом uq_refunds_duplicate_payment" : "без индекса";

    it(`Promise.all двух платежей (оба впервые) → ровно один возврат в ЮKassa (${label})`, async () => {
      w.repo.duplicateRefundIndex = index;
      const { pa, pb } = await twoPaid();
      const results = await Promise.all([processPaymentObjectWith(w.deps, pa), processPaymentObjectWith(w.deps, pb)]);
      assert.deepEqual(results.map((r) => r.kind).sort(), ["paid", "refunded_duplicate"]);
      assert.equal(refundPosts().length, 1);
      assert.equal(fake.refunds.size, 1);
      assert.equal(w.repo.orders.get(ORDER_ID)?.status, "paid");
    });

    it(`параллельные повторные доставки обоих платежей → ровно один возврат, один admin_attention (${label})`, async () => {
      mock.method(console, "error", () => {});
      w.repo.duplicateRefundIndex = index;
      const { pa, pb } = await twoPaid();
      await processPaymentObjectWith(w.deps, pa);
      w.notes.length = 0;
      await Promise.all([processPaymentObjectWith(w.deps, pa), processPaymentObjectWith(w.deps, pb), processPaymentObjectWith(w.deps, pb)]);
      assert.equal(refundPosts().length, 1);
      assert.equal(fake.refunds.size, 1);
      assert.equal(dupRows().filter((r) => r.status !== "canceled").length, 1);
      assert.equal(attentionReasons().length, 1, "без ложных admin_attention");
      assert.ok(w.repo.refunds.every((r) => r.reason === DUPLICATE_REFUND_REASON || r.reason === DUPLICATE_LOSER_REASON));
      if (!index) assert.ok(w.repo.refunds.filter((r) => r.reason === DUPLICATE_LOSER_REASON).every((r) => r.status === "canceled"));
      else assert.equal(w.repo.refunds.length, 1);
    });
  }
});

describe("повторная оплата: сбои ЮKassa и сироты", () => {
  it("4xx → failed, только вручную: admin_attention «Верните вручную», повтора нет", async () => {
    mock.method(console, "error", () => {});
    const { pa, pb } = await twoPaid();
    await processPaymentObjectWith(w.deps, pa);
    w.notes.length = 0;
    fake.intercept((r) => (r.path === "/v3/refunds" ? { status: 400, json: { type: "error", code: "invalid_request", description: "Not enough money on the balance" } } : undefined));
    const res = await processPaymentObjectWith(w.deps, pb);
    assert.equal(res.kind === "refunded_duplicate" && res.refunds[0].status, "failed");
    assert.equal(needsRedelivery(res), false);
    assert.deepEqual([dupRows()[0].status, dupRows()[0].error_message], ["failed", "Not enough money on the balance"]);
    assert.equal(attentionReasons().length, 2);
    assert.match(attentionReasons()[1], /не прошёл \(Not enough money on the balance\)\. Верните вручную/);
    assert.equal((await processPaymentObjectWith(w.deps, pb)).kind, "already_paid");
    assert.equal(refundPosts().length, 1);
  });

  it("5xx/сеть → retry_scheduled (webhook 500), один автоповтор с ТЕМ ЖЕ ключом доводит возврат", async () => {
    mock.method(console, "error", () => {});
    const { pa, pb } = await twoPaid();
    await processPaymentObjectWith(w.deps, pa);
    fake.interceptTimes(3, (r) => r.path === "/v3/refunds", { status: 503 });
    const res = await processPaymentObjectWith(w.deps, pb);
    assert.equal(res.kind === "refunded_duplicate" && res.refunds[0].status, "retry_scheduled");
    assert.equal(needsRedelivery(res), true);
    const row = dupRows()[0];
    assert.equal(row.status, "failed");
    assert.ok(row.error_message?.startsWith(RETRYABLE_PREFIX));

    const again = await processPaymentObjectWith(w.deps, pb);
    assert.equal(again.kind === "refunded_duplicate" && again.refunds[0].status, "succeeded");
    assert.deepEqual(new Set(refundPosts().map((r) => r.headers["idempotence-key"])), new Set([`refund_${row.id}`]));
    assert.equal(dupRows()[0].status, "succeeded");
    assert.equal(w.templates().filter((t) => t === "customer_refund").length, 1);
  });

  it("автоповтор тоже упал на сети → failed «автоповтор не помог», «Верните вручную», больше не повторяется", async () => {
    mock.method(console, "error", () => {});
    const { pa, pb } = await twoPaid();
    await processPaymentObjectWith(w.deps, pa);
    fake.intercept((r) => (r.path === "/v3/refunds" ? { status: 500 } : undefined));
    await processPaymentObjectWith(w.deps, pb);
    const second = await processPaymentObjectWith(w.deps, pb);
    assert.equal(second.kind === "refunded_duplicate" && second.refunds[0].status, "failed");
    assert.ok(dupRows()[0].error_message?.startsWith(RETRY_FAILED_PREFIX));
    assert.match(attentionReasons().at(-1) ?? "", /Верните вручную/);
    const posts = refundPosts().length;
    assert.equal((await processPaymentObjectWith(w.deps, pb)).kind, "already_paid");
    assert.equal(refundPosts().length, posts);
  });

  it("сирота: pending без yookassa_refund_id; моложе 5 мин — не трогаем, старше — тот же refund_<id> и admin_attention", async () => {
    const { b, pa, pb } = await twoPaid();
    await processPaymentObjectWith(w.deps, pa);
    w.notes.length = 0;
    // Процесс упал между insert и POST /refunds (и до admin_attention).
    const ins = await w.repo.insertRefund({ order_id: ORDER_ID, payment_id: w.repo.paymentRaw(b)?.id ?? "", amount: 13370000, reason: DUPLICATE_REFUND_REASON, restock: false });
    if (!("row" in ins) || !ins.row) throw new Error("insert");
    const orphan = ins.row;

    const early = await processPaymentObjectWith(w.deps, pb);
    assert.equal(early.kind === "refunded_duplicate" && early.refunds[0].status, "in_progress");
    assert.equal(refundPosts().length, 0);

    w.advance(6 * 60_000);
    const late = await processPaymentObjectWith(w.deps, pb);
    assert.equal(late.kind === "refunded_duplicate" && late.refunds[0].status, "succeeded");
    assert.equal(refundPosts()[0].headers["idempotence-key"], `refund_${orphan.id}`);
    assert.equal(w.repo.refunds.length, 1);
    assert.deepEqual(w.templates(), ["admin_attention", "customer_refund"]);
  });

  it("возврат pending в ЮKassa → при следующей обработке GET /refunds доводит до succeeded", async () => {
    fake.refundStatus = "pending";
    const { pa, pb } = await twoPaid();
    await processPaymentObjectWith(w.deps, pa);
    await processPaymentObjectWith(w.deps, pb);
    assert.equal(dupRows()[0].status, "pending");
    const stored = fake.refunds.get(dupRows()[0].yookassa_refund_id ?? "");
    assert.ok(stored);
    stored.status = "succeeded";
    const res = await processPaymentObjectWith(w.deps, pb);
    assert.equal(res.kind === "refunded_duplicate" && res.refunds[0].status, "succeeded");
    assert.equal(refundPosts().length, 1);
    assert.equal(w.templates().filter((t) => t === "customer_refund").length, 1);
  });

  it("cron: незавершённый автовозврат (сеть) продолжается в reconcileStalePayments", async () => {
    mock.method(console, "error", () => {});
    const { pa, pb } = await twoPaid();
    await processPaymentObjectWith(w.deps, pa);
    fake.interceptTimes(3, (r) => r.path === "/v3/refunds", { status: 502 });
    await processPaymentObjectWith(w.deps, pb);
    w.advance(3600_000);
    const sum = await reconcileStalePaymentsWith(w.deps);
    assert.deepEqual(sum.refunds?.map((r) => r.status), ["succeeded"]);
    assert.equal(dupRows()[0].status, "succeeded");
  });
});

describe("выбор основного платежа и владельца возврата", () => {
  const pay = (id: string, captured_at: string | null, created_at: string) => ({ yookassa_payment_id: id, captured_at, created_at });
  it("pickPrimaryPayment: ранний captured_at, затем created_at, затем id; без captured_at — в конце", () => {
    assert.equal(pickPrimaryPayment([pay("b", "2026-10-01T12:00:02Z", "2026-10-01T11:00:00Z"), pay("a", "2026-10-01T12:00:01Z", "2026-10-01T11:59:00Z")])?.yookassa_payment_id, "a");
    assert.equal(pickPrimaryPayment([pay("b", null, "2026-10-01T10:00:00Z"), pay("a", "2026-10-01T12:00:00Z", "2026-10-01T11:00:00Z")])?.yookassa_payment_id, "a");
    assert.equal(pickPrimaryPayment([pay("b", null, "2026-10-01T10:00:00Z"), pay("a", null, "2026-10-01T10:00:00Z")])?.yookassa_payment_id, "a");
    assert.equal(pickPrimaryPayment([]), null);
  });
  it("earliestRefund: микросекунды timestamptz учитываются, затем id", () => {
    const r = (id: string, created_at: string) => ({ id, order_id: "o", payment_id: "p", yookassa_refund_id: null, amount: 1, status: "pending" as const, reason: DUPLICATE_REFUND_REASON, error_message: null, created_at });
    assert.equal(earliestRefund([r("a", "2026-10-01T12:00:00.000002+00:00"), r("b", "2026-10-01T12:00:00.000001+00:00")])?.id, "b");
    assert.equal(earliestRefund([r("b", "2026-10-01T12:00:00.1+00:00"), r("a", "2026-10-01T12:00:00.1+00:00")])?.id, "a");
    assert.equal(earliestRefund([r("a", "2026-10-01T12:00:00.5+00:00"), r("b", "2026-10-01T12:00:00+00:00")])?.id, "b");
  });
});
