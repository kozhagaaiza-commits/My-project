import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { createYookassaWebhookHandler, type YookassaWebhookDeps } from "@/app/api/webhooks/yookassa/handler";
import { FakeYookassa } from "@/lib/payments/__fixtures__/fake-yookassa";
import { MemoryPaymentsRepo, ORDER_ID, fakeClient, makeDeps, sampleItems, sampleOrder } from "@/lib/payments/__fixtures__/memory-repo";
import { createPaymentForOrderWith } from "@/lib/payments/create";
import { processPaymentObjectWith, processRefundObjectWith, type ProcessResult } from "@/lib/payments/process";
import type { YookassaPayment, YookassaRefund } from "@/lib/yookassa";

const PAY_ID = "30a8d2c1-000f-5000-9000-1b6c4d2e8f10";
const YK_IP = "185.71.76.5";
const notification = (event = "payment.succeeded", id = PAY_ID, object: Record<string, unknown> = {}) => JSON.stringify({
  type: "notification", event,
  object: { id, status: "succeeded", paid: true, amount: { value: "133700.00", currency: "RUB" }, metadata: { order_id: ORDER_ID }, ...object },
});
const req = (body: string, xff: string | null = YK_IP) => new Request("https://forgecarbon.vercel.app/api/webhooks/yookassa", {
  method: "POST", headers: { "content-type": "application/json", ...(xff !== null ? { "x-forwarded-for": xff } : {}) }, body,
});

const PAYMENT: YookassaPayment = {
  id: PAY_ID, status: "succeeded", paid: true, amount: { value: "133700.00", currency: "RUB" }, created_at: "2026-10-01T12:31:02.118Z",
};
const REFUND: YookassaRefund = { id: "2ec4b1f0-0015-5000-8000-1d7e2a9c4b36", payment_id: PAY_ID, status: "succeeded", amount: { value: "133700.00", currency: "RUB" }, created_at: "2026-10-01T13:00:00.000Z" };

/** Фейковые зависимости с журналом вызовов. */
function setup(over: Partial<YookassaWebhookDeps> = {}) {
  const calls: string[] = [];
  const deps: YookassaWebhookDeps = {
    getPayment: async (id) => { calls.push(`getPayment:${id}`); return (over.getPayment ?? (async () => PAYMENT))(id); },
    getRefund: async (id) => { calls.push(`getRefund:${id}`); return (over.getRefund ?? (async () => REFUND))(id); },
    processPayment: async (p) => { calls.push(`processPayment:${p.status}`); return (over.processPayment ?? (async (): Promise<ProcessResult> => ({ kind: "paid", orderId: ORDER_ID, mark: "paid" })))(p); },
    processRefund: async (r) => { calls.push(`processRefund:${r.id}`); return (over.processRefund ?? (async () => ({ kind: "refund_succeeded" as const, refundId: "r1" })))(r); },
  };
  return { calls, POST: createYookassaWebhookHandler(deps) };
}

afterEach(() => mock.restoreAll());

describe("POST /api/webhooks/yookassa: IP → JSON → Zod", () => {
  it("чужой IP → 403 без обращений к ЮKassa и БД", async () => {
    mock.method(console, "error", () => {});
    for (const xff of ["8.8.8.8", "185.71.76.32", "10.0.0.1, 185.71.76.5", "", null, "garbage", "185.71.76.5:443"]) {
      const { calls, POST } = setup();
      const res = await POST(req(notification(), xff));
      assert.equal(res.status, 403, String(xff));
      assert.deepEqual(await res.json(), { error: { code: "FORBIDDEN", message: "Источник уведомления не подтверждён" } });
      assert.deepEqual(calls, []);
    }
  });

  it("IP ЮKassa: первый адрес x-forwarded-for, IPv6 и IPv4-mapped", async () => {
    for (const xff of ["185.71.76.5, 10.0.0.1", "2a02:5180::15", "::ffff:77.75.156.11", "77.75.154.200"]) {
      assert.equal((await setup().POST(req(notification(), xff))).status, 200, xff);
    }
  });

  it("битый JSON / неверная форма → 400 «Неверный формат уведомления» без обращений", async () => {
    const bodies = ["{oops", "", JSON.stringify({ type: "notification", event: "payment.refunded", object: { id: PAY_ID } }),
      JSON.stringify({ type: "x", event: "payment.succeeded", object: { id: PAY_ID } }), JSON.stringify({ type: "notification", event: "payment.succeeded", object: { id: "short" } }),
      notification("payment.succeeded", "../../refunds/2ec4b1f0-0015")];
    for (const b of bodies) {
      const { calls, POST } = setup();
      const res = await POST(req(b));
      assert.equal(res.status, 400, b);
      assert.deepEqual(await res.json(), { error: { code: "VALIDATION_ERROR", message: "Неверный формат уведомления" } });
      assert.deepEqual(calls, []);
    }
  });
});

describe("POST /api/webhooks/yookassa: повторный GET объекта и обработка", () => {
  it("payment.*: GET /payments/{id} → processPayment с объектом ИЗ API → 200 { received: true }", async () => {
    for (const event of ["payment.succeeded", "payment.canceled", "payment.waiting_for_capture"]) {
      const { calls, POST } = setup({ getPayment: async () => ({ ...PAYMENT, status: "canceled" }) });
      const res = await POST(req(notification(event)));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { data: { received: true } });
      assert.deepEqual(calls, [`getPayment:${PAY_ID}`, "processPayment:canceled"]);
      assert.equal(res.headers.get("Cache-Control"), "no-store");
    }
  });

  it("refund.succeeded: GET /refunds/{id} → processRefund", async () => {
    const { calls, POST } = setup();
    const res = await POST(req(notification("refund.succeeded", REFUND.id)));
    assert.equal(res.status, 200);
    assert.deepEqual(calls, [`getRefund:${REFUND.id}`, `processRefund:${REFUND.id}`]);
  });

  it("автовозврат повторной оплаты ждёт повтора после сбоя сети → 500, чтобы ЮKassa доставила снова", async () => {
    mock.method(console, "error", () => {});
    const { POST } = setup({
      processPayment: async () => ({ kind: "refunded_duplicate", orderId: ORDER_ID, refunds: [{ payment_id: PAY_ID, refund_id: "r1", status: "retry_scheduled" }] }),
    });
    const res = await POST(req(notification()));
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: { code: "INTERNAL_ERROR", message: "Ошибка обработки уведомления" } });
    const ok = await setup({
      processPayment: async () => ({ kind: "refunded_duplicate", orderId: ORDER_ID, refunds: [{ payment_id: PAY_ID, refund_id: "r1", status: "failed" }] }),
    }).POST(req(notification()));
    assert.equal(ok.status, 200, "4xx возврата — только вручную, повтор уведомления не нужен");
  });

  it("ошибка ЮKassa или БД → 500 «Ошибка обработки уведомления» без деталей (ЮKassa повторит)", async () => {
    const log = mock.method(console, "error", () => {});
    for (const over of [
      { getPayment: async (): Promise<YookassaPayment> => { throw new Error("YooKassa недоступна"); } },
      { processPayment: async (): Promise<ProcessResult> => { throw new Error("rpc.mark_order_paid: 08006 connection failure"); } },
    ]) {
      const res = await setup(over).POST(req(notification()));
      assert.equal(res.status, 500);
      const text = await res.text();
      assert.deepEqual(JSON.parse(text), { error: { code: "INTERNAL_ERROR", message: "Ошибка обработки уведомления" } });
      assert.doesNotMatch(text, /08006|YooKassa|stack/);
      assert.equal(res.headers.get("Cache-Control"), "no-store");
    }
    assert.equal(log.mock.callCount(), 2);
  });
});

describe("POST /api/webhooks/yookassa: с fake-ЮKassa и in-memory БД", () => {
  let fake: FakeYookassa;
  let repo: MemoryPaymentsRepo;
  before(async () => { fake = await new FakeYookassa().start(); });
  after(async () => { await fake.stop(); });
  beforeEach(() => {
    fake.reset();
    repo = new MemoryPaymentsRepo();
    repo.addOrder(sampleOrder(), sampleItems());
  });

  function realHandler() {
    const yk = fakeClient(fake);
    const { deps, notifications } = makeDeps(repo, yk);
    const POST = createYookassaWebhookHandler({
      getPayment: (id) => yk.getPayment(id), getRefund: (id) => yk.getRefund(id),
      processPayment: (p) => processPaymentObjectWith(deps, p), processRefund: (r) => processRefundObjectWith(deps, r),
    });
    return { deps, notifications, POST };
  }

  it("поддельное тело: в уведомлении succeeded, в API pending → заказ НЕ оплачен (BR-12, Edge Case 26)", async () => {
    const { deps, notifications, POST } = realHandler();
    const created = await createPaymentForOrderWith(deps, ORDER_ID);
    assert.ok(created.ok);
    const res = await POST(req(notification("payment.succeeded", created.paymentId, { amount: { value: "1.00", currency: "RUB" } })));
    assert.equal(res.status, 200);
    assert.equal(repo.orders.get(ORDER_ID)?.status, "pending_payment");
    assert.deepEqual(repo.markPaidCalls, []);
    assert.deepEqual(notifications, []);
    assert.equal(repo.paymentRaw(created.paymentId)?.status, "pending");
  });

  it("уведомление о чужом/несуществующем платеже: ЮKassa отвечает 404 → 200 (повтор бесполезен), заказ не трогается", async () => {
    const log = mock.method(console, "error", () => {});
    const { POST } = realHandler();
    const res = await POST(req(notification("payment.succeeded", PAY_ID)));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { data: { received: true } });
    assert.deepEqual(repo.markPaidCalls, []);
    const entry = log.mock.calls[0].arguments[0] as { scope: string; object_id: string };
    assert.deepEqual([entry.scope, entry.object_id], ["webhooks.yookassa", PAY_ID]);
  });

  it("refund.succeeded по несуществующему возврату (404) → 200; 401 ЮKassa (ключи) → 500", async () => {
    mock.method(console, "error", () => {});
    const { POST } = realHandler();
    assert.equal((await POST(req(notification("refund.succeeded", "2ec4b1f0-0015-5000-8000-1d7e2a9c4b36")))).status, 200);
    fake.intercept(() => ({ status: 401, json: { type: "error", code: "invalid_credentials", description: "Login or password is incorrect" } }));
    assert.equal((await POST(req(notification("payment.succeeded", PAY_ID)))).status, 500);
  });

  it("дубликат уведомления → 200 оба раза, уведомления об оплате — один раз", async () => {
    const { deps, notifications, POST } = realHandler();
    const created = await createPaymentForOrderWith(deps, ORDER_ID);
    assert.ok(created.ok);
    fake.succeed(created.paymentId);
    assert.equal((await POST(req(notification("payment.succeeded", created.paymentId)))).status, 200);
    assert.equal((await POST(req(notification("payment.succeeded", created.paymentId)))).status, 200);
    assert.equal(repo.orders.get(ORDER_ID)?.status, "paid");
    assert.deepEqual(notifications.map((n) => n.template), ["admin_order_paid", "customer_order_paid"]);
  });

  it("payment.canceled → 200, заказ остаётся pending_payment", async () => {
    const { deps, POST } = realHandler();
    const created = await createPaymentForOrderWith(deps, ORDER_ID);
    assert.ok(created.ok);
    fake.cancel(created.paymentId);
    assert.equal((await POST(req(notification("payment.canceled", created.paymentId)))).status, 200);
    assert.equal(repo.orders.get(ORDER_ID)?.status, "pending_payment");
    assert.equal(repo.paymentRaw(created.paymentId)?.status, "canceled");
  });
});
