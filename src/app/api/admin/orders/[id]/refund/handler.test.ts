import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import {
  REFUND_CONFLICT_MESSAGE, REFUND_IN_PROGRESS_MESSAGE, REFUND_PAYMENT_UNCONFIRMED_MESSAGE, REFUND_UNAVAILABLE_MESSAGE,
  createAdminRefundHandler, type AdminRefundDeps,
} from "@/app/api/admin/orders/[id]/refund/handler";
import { apiError } from "@/lib/api-error";
import { formatRub } from "@/lib/money";
import { FakeYookassa } from "@/lib/payments/__fixtures__/fake-yookassa";
import { ORDER_ID } from "@/lib/payments/__fixtures__/memory-repo";
import { makeWorld } from "@/lib/payments/__fixtures__/world";
import { createAdminRefundWith, type AdminRefundInput, type AdminRefundOutcome } from "@/lib/payments/admin-refund";
import { processPaymentObjectWith } from "@/lib/payments/process";

// POST /api/admin/orders/[id]/refund: порядок проверок, Zod, JSON ответов — дословно Блок 3 (+ отступления из отчёта Дня 6).

const ADMIN = "9f1c2b3a-4d5e-4f60-8a7b-1c2d3e4f5a6b";
const BODY = { amount: 13370000, reason: "Клиент отказался до отправки", restock: true };
const NO_STORE = "private, no-store";

const req = (body: unknown = BODY, id = ORDER_ID) => ({
  request: new Request(`http://localhost:3000/api/admin/orders/${id}/refund`, {
    method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }),
  ctx: { params: Promise.resolve({ id }) },
});

function setup(over: Partial<AdminRefundDeps> & { outcome?: AdminRefundOutcome } = {}) {
  const calls: string[] = [];
  const inputs: AdminRefundInput[] = [];
  const deps: AdminRefundDeps = {
    authorize: async (r) => {
      calls.push("auth");
      return (over.authorize ?? (async () => ({ ok: true as const, admin: { userId: ADMIN } })))(r);
    },
    createRefund: async (i) => {
      calls.push("refund");
      inputs.push(i);
      return (over.createRefund ?? (async () => over.outcome ?? { kind: "not_found" as const }))(i);
    },
  };
  const POST = createAdminRefundHandler(deps);
  return { calls, inputs, call: (r: ReturnType<typeof req>) => POST(r.request, r.ctx) };
}

const json = async (res: Response) => (await res.json()) as unknown;

afterEach(() => mock.restoreAll());

describe("POST /api/admin/orders/[id]/refund: доступ и вход", () => {
  it("401 / 403 / Origin 403 / 429 от проверки админа — первыми, без разбора id и тела", async () => {
    for (const [status, code, message] of [
      [401, "UNAUTHORIZED", "Войдите в аккаунт"], [403, "FORBIDDEN", "Недостаточно прав"],
      [403, "FORBIDDEN", "Недопустимый источник запроса"], [429, "RATE_LIMITED", "Слишком много запросов. Повторите через минуту"],
    ] as const) {
      const { calls, call } = setup({ authorize: async () => ({ ok: false, response: apiError(code, message, status) }) });
      const res = await call(req("{oops", "not-a-uuid"));
      assert.equal(res.status, status);
      assert.deepEqual(await json(res), { error: { code, message } });
      assert.deepEqual(calls, ["auth"]);
      assert.equal(res.headers.get("Cache-Control"), NO_STORE);
    }
  });

  it("id не uuid → 404 «Заказ не найден» без сервиса", async () => {
    const { calls, call } = setup();
    const res = await call(req(BODY, "FC-26-000123"));
    assert.equal(res.status, 404);
    assert.deepEqual(await json(res), { error: { code: "NOT_FOUND", message: "Заказ не найден" } });
    assert.deepEqual(calls, ["auth"]);
  });

  it("Zod: 400 VALIDATION_ERROR «Проверьте поля формы» с details.fields; битое тело — fields {}", async () => {
    const cases: Array<[unknown, Record<string, string[]>]> = [
      [{ ...BODY, amount: 0 }, { amount: ["Too small: expected number to be >0"] }],
      [{ ...BODY, reason: "  abc " }, { reason: ["Минимум 5 символов", "Минимум 5 символов"] }],
      [{ ...BODY, reason: " Повторная оплата " }, { reason: ["Эта причина зарезервирована для автоматического возврата"] }],
      ["{oops", {}],
    ];
    for (const [body, fields] of cases) {
      const { calls, call } = setup();
      const res = await call(req(body));
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.deepEqual(await json(res), { error: { code: "VALIDATION_ERROR", message: "Проверьте поля формы", details: { fields } } });
      assert.deepEqual(calls, ["auth"]);
    }
  });

  it("сервису — id заказа, тело после Zod (trim) и id админа", async () => {
    const { inputs, call } = setup();
    await call(req({ ...BODY, reason: "  Клиент передумал  " }));
    assert.deepEqual(inputs, [{ orderId: ORDER_ID, amount: 13370000, reason: "Клиент передумал", restock: true, adminId: ADMIN }]);
  });
});

describe("POST /api/admin/orders/[id]/refund: ответы", () => {
  it("200 { data } по Блоку 3 (+ restocked)", async () => {
    const data = {
      refund_id: "b2d8f4a1-6c3e-4a9b-8f07-1e5c9d3a7b62", yookassa_refund_id: "2ec4b1f0-0015-5000-8000-1d7e2a9c4b36",
      status: "succeeded" as const, amount_formatted: formatRub(13370000), order_status: "refunded", restocked: true,
    };
    const res = await setup({ outcome: { kind: "ok", data } }).call(req());
    assert.equal(res.status, 200);
    assert.deepEqual(await json(res), { data });
    assert.equal(res.headers.get("Cache-Control"), NO_STORE);
  });

  it("422 REFUND_EXCEEDS_PAID «Максимум к возврату: 133 700 ₽» + refundable_amount", async () => {
    const res = await setup({ outcome: { kind: "exceeds", refundable: 13370000 } }).call(req());
    assert.equal(res.status, 422);
    assert.deepEqual(await json(res), {
      error: { code: "REFUND_EXCEEDS_PAID", message: `Максимум к возврату: ${formatRub(13370000)}`, details: { refundable_amount: 13370000 } },
    });
  });

  it("502 PAYMENT_PROVIDER_ERROR «ЮKassa отклонила возврат: …» + yookassa_code; без ответа ЮKassa — свой текст", async () => {
    const rejected = await setup({ outcome: { kind: "rejected", description: "Недостаточно средств на балансе магазина", code: "invalid_request" } }).call(req());
    assert.equal(rejected.status, 502);
    assert.deepEqual(await json(rejected), {
      error: { code: "PAYMENT_PROVIDER_ERROR", message: "ЮKassa отклонила возврат: Недостаточно средств на балансе магазина", details: { yookassa_code: "invalid_request" } },
    });
    const down = await setup({ outcome: { kind: "unavailable" } }).call(req());
    assert.equal(down.status, 502);
    assert.deepEqual(await json(down), { error: { code: "PAYMENT_PROVIDER_ERROR", message: REFUND_UNAVAILABLE_MESSAGE, details: { yookassa_code: null } } });
  });

  it("409 CONFLICT: возврат уже оформляется / 23505; 404 — нет заказа", async () => {
    const a = await setup({ outcome: { kind: "in_progress" } }).call(req());
    assert.deepEqual([a.status, await json(a)], [409, { error: { code: "CONFLICT", message: REFUND_IN_PROGRESS_MESSAGE } }]);
    const b = await setup({ outcome: { kind: "conflict" } }).call(req());
    assert.deepEqual([b.status, await json(b)], [409, { error: { code: "CONFLICT", message: REFUND_CONFLICT_MESSAGE } }]);
    const c = await setup({ outcome: { kind: "not_found" } }).call(req());
    assert.deepEqual([c.status, await json(c)], [404, { error: { code: "NOT_FOUND", message: "Заказ не найден" } }]);
  });

  it("409 CONFLICT: оплата не подтверждена (заказ pending_payment / cancelled после сверки)", async () => {
    const res = await setup({ outcome: { kind: "payment_unconfirmed" } }).call(req());
    assert.deepEqual([res.status, await json(res)], [409, { error: { code: "CONFLICT", message: REFUND_PAYMENT_UNCONFIRMED_MESSAGE } }]);
  });

  it("400 VALIDATION_ERROR: restock вне BR-17; неполная сумма — ошибка и на поле amount", async () => {
    const msg = "Заказ доставлен: товар на склад не возвращается";
    const a = await setup({ outcome: { kind: "restock_not_allowed", message: msg, partial: false } }).call(req());
    assert.deepEqual([a.status, await json(a)], [400, { error: { code: "VALIDATION_ERROR", message: msg, details: { fields: { restock: [msg] } } } }]);
    const part = `Вернуть на склад можно только при возврате всей суммы: ${formatRub(13370000)}`;
    const b = await setup({ outcome: { kind: "restock_not_allowed", message: part, partial: true } }).call(req());
    assert.deepEqual([b.status, await json(b)], [400, { error: { code: "VALIDATION_ERROR", message: part, details: { fields: { restock: [part], amount: [part] } } } }]);
  });

  it("исключение (БД) → 500 INTERNAL_ERROR без стека", async () => {
    mock.method(console, "error", () => {});
    const res = await setup({ createRefund: async () => { throw new Error("refunds.insert: 08006 connection failure"); } }).call(req());
    assert.equal(res.status, 500);
    assert.deepEqual(await json(res), { error: { code: "INTERNAL_ERROR", message: "Что-то пошло не так. Мы уже разбираемся" } });
    assert.equal(res.headers.get("Cache-Control"), NO_STORE);
  });
});

describe("POST /api/admin/orders/[id]/refund: сквозной сценарий на fake-ЮKassa", () => {
  let fake: FakeYookassa;
  before(async () => { fake = await new FakeYookassa().start(); });
  after(async () => { await fake.stop(); });
  beforeEach(() => fake.reset());

  it("оплачен → возврат 200 refunded; повторное нажатие → 422 «Максимум к возврату: 0 ₽»", async () => {
    const w = makeWorld(fake);
    const id = await w.newPayment();
    await processPaymentObjectWith(w.deps, await w.payAndFetch(id));
    const { call } = setup({ createRefund: (i) => createAdminRefundWith(w.deps, i) });

    const res = await call(req());
    assert.equal(res.status, 200);
    const body = (await res.json()) as { data: { status: string; order_status: string; restocked: boolean } };
    assert.deepEqual([body.data.status, body.data.order_status, body.data.restocked], ["succeeded", "refunded", true]);

    const again = await call(req());
    assert.equal(again.status, 422);
    assert.deepEqual(await json(again), {
      error: { code: "REFUND_EXCEEDS_PAID", message: `Максимум к возврату: ${formatRub(0)}`, details: { refundable_amount: 0 } },
    });
    assert.equal(fake.requests.filter((r) => r.method === "POST" && r.path === "/v3/refunds").length, 1);
  });
});
