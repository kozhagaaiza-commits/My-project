import assert from "node:assert/strict";
import { afterEach, before, describe, it, mock } from "node:test";
import type { PayOrderDeps } from "@/app/api/orders/[number]/pay/handler";
import { apiError } from "@/lib/api-error";
import type { OrderAccessRow } from "@/lib/orders/db";
import { applyTestEnv } from "@/test/env";

// POST /api/orders/[number]/pay?t=<token> с фейковыми зависимостями. JSON ответов — дословно Блок 3.

let mod: typeof import("@/app/api/orders/[number]/pay/handler");
let tk: typeof import("@/lib/orders/token");
let rl: typeof import("@/lib/rate-limit");
before(async () => {
  applyTestEnv();
  mod = await import("@/app/api/orders/[number]/pay/handler");
  tk = await import("@/lib/orders/token");
  rl = await import("@/lib/rate-limit");
});

const NUMBER = "FC-26-000123";
const ORDER_ID = "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68";
const OWNER = "5d1e7a3c-8b2f-4c6d-9e0a-1f3b5c7d9e21";
const TOKEN = "Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU";
const WRONG = "Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeV";
const NOW = new Date("2026-10-01T12:40:00.000Z");
const CONFIRM = "https://yoomoney.ru/checkout/payments/v2/contract?orderId=30a8d2c7-000f-5000-a000-1f3b6c9d2e47";
const NO_STORE = "private, no-store";
const NOT_FOUND = { error: { code: "NOT_FOUND", message: "Заказ не найден" } };

const row = (over: Partial<OrderAccessRow> = {}): OrderAccessRow => ({
  id: ORDER_ID, number: NUMBER, status: "pending_payment", kind: "stock", user_id: null,
  public_token_hash: tk.hashOrderToken(TOKEN), reserved_until: "2026-10-01T13:00:00+00:00", total: 13370000, ...over,
});

const req = (opts: { number?: string; token?: string | null; origin?: string | null } = {}) => {
  const number = opts.number ?? NUMBER;
  const token = opts.token === undefined ? TOKEN : opts.token;
  const url = `http://localhost:3000/api/orders/${encodeURIComponent(number)}/pay${token === null ? "" : `?t=${encodeURIComponent(token)}`}`;
  const origin = opts.origin === undefined ? "http://localhost:3000" : opts.origin;
  return {
    request: new Request(url, { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: "{}" }),
    ctx: { params: Promise.resolve({ number }) },
  };
};

function setup(over: Partial<PayOrderDeps> & { order?: OrderAccessRow | null } = {}) {
  const calls: string[] = [];
  const order = over.order === undefined ? row() : over.order;
  const deps: PayOrderDeps = {
    assertSameOrigin: (r) => { calls.push("origin"); return (over.assertSameOrigin ?? (() => null))(r); },
    limitPay: async (r, n) => { calls.push(`rate:${n}`); return (over.limitPay ?? (async () => null))(r, n); },
    getSessionContext: async () => { calls.push("session"); return (over.getSessionContext ?? (async () => ({ userId: null, role: null, atelierId: null })))(); },
    selectOrderForAccess: async (n) => {
      calls.push(`select:${n}`);
      return (over.selectOrderForAccess ?? (async (x: string) => (order && order.number === x ? order : null)))(n);
    },
    cancelExpiredOrders: async () => { calls.push("cancelExpired"); return (over.cancelExpiredOrders ?? (async () => 0))(); },
    createPayment: async (id, opts) => {
      calls.push(`pay:${id}:${opts.reuseWithinSeconds}:${opts.deadlineMs}`);
      return (over.createPayment ?? (async () => ({ ok: true as const, confirmationUrl: CONFIRM, paymentId: "p-2", reused: true })))(id, opts);
    },
    now: () => NOW,
  };
  const POST = mod.createPayOrderHandler(deps);
  return { calls, call: (r: ReturnType<typeof req>) => POST(r.request, r.ctx) };
}

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const failWith = (e: unknown) => async () => { throw e; };

describe("POST /api/orders/[number]/pay: порядок и доступ", () => {
  afterEach(() => mock.restoreAll());

  it("403 при чужом Origin — первым", async () => {
    const { calls, call } = setup({ assertSameOrigin: () => apiError("FORBIDDEN", "Недопустимый источник запроса", 403) });
    assert.equal((await call(req())).status, 403);
    assert.deepEqual(calls, ["origin"]);
  });

  it("номер не по формату → 404 без лимита и БД", async () => {
    const { calls, call } = setup();
    const res = await call(req({ number: "FC-26-12" }));
    assert.equal(res.status, 404);
    assert.deepEqual(await json(res), NOT_FOUND);
    assert.deepEqual(calls, ["origin"]);
  });

  it("429 по лимиту заказа — до чтения заказа; ключ — номер", async () => {
    const { calls, call } = setup({ limitPay: async () => rl.rateLimitedResponse(600) });
    const res = await call(req());
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("Retry-After"), "600");
    assert.deepEqual(calls, ["origin", `rate:${NUMBER}`]);
    assert.deepEqual(rl.RATE_LIMITS.pay, { limit: 10, windowSeconds: 600 });
  });

  it("сбой хранилища лимитов → 500 (fail-closed), платёж не создаётся", async () => {
    mock.method(console, "error", () => {});
    const { calls, call } = setup({ limitPay: failWith(new Error("check_rate_limit: down")) });
    const res = await call(req());
    assert.equal(res.status, 500);
    assert.deepEqual(calls, ["origin", `rate:${NUMBER}`]);
  });

  it("200 по токену: ленивая отмена, платёж с reuse 600 с; JSON Блока 3", async () => {
    const { calls, call } = setup();
    const res = await call(req());
    assert.equal(res.status, 200);
    assert.deepEqual(await json(res), { data: { confirmation_url: CONFIRM } });
    assert.deepEqual(calls, ["origin", `rate:${NUMBER}`, "session", `select:${NUMBER}`, "cancelExpired", `pay:${ORDER_ID}:600:25000`]);
  });

  it("200 владельцу без токена", async () => {
    const { call } = setup({ order: row({ user_id: OWNER }), getSessionContext: async () => ({ userId: OWNER, role: "customer", atelierId: null }) });
    assert.equal((await call(req({ token: null }))).status, 200);
  });

  it("неверный токен = нет заказа = admin без токена: одинаковый 404, ленивая отмена и платёж не вызываются", async () => {
    const cases = [
      setup(), setup({ order: null }), setup({ getSessionContext: async () => ({ userId: OWNER, role: "admin", atelierId: null }) }),
    ];
    const reqs = [req({ token: WRONG }), req(), req({ token: null })];
    for (let i = 0; i < cases.length; i++) {
      const res = await cases[i].call(reqs[i]);
      assert.equal(res.status, 404);
      assert.deepEqual(await json(res), NOT_FOUND);
      assert.ok(!cases[i].calls.includes("cancelExpired"));
      assert.ok(!cases[i].calls.some((c) => c.startsWith("pay:")));
    }
  });

  it("токен не по формату игнорируется → 404 для гостя", async () => {
    const res = await setup().call(req({ token: `${TOKEN}!!` }));
    assert.equal(res.status, 404);
  });
});

describe("POST /api/orders/[number]/pay: оплачиваемость и платёж", () => {
  afterEach(() => mock.restoreAll());
  const NOT_PAYABLE = { error: { code: "ORDER_NOT_PAYABLE", message: "Время на оплату истекло. Оформите заказ заново" } };

  it("409: отменён, оплачен, бронь истекла, бронь не задана", async () => {
    for (const order of [
      row({ status: "cancelled" }), row({ status: "paid", reserved_until: null }),
      row({ reserved_until: "2026-10-01T12:40:00+00:00" }), row({ reserved_until: null }),
    ]) {
      const { calls, call } = setup({ order });
      const res = await call(req());
      assert.equal(res.status, 409);
      assert.deepEqual(await json(res), NOT_PAYABLE);
      assert.ok(!calls.some((c) => c.startsWith("pay:")));
    }
  });

  it("сбой ленивой отмены не роняет запрос", async () => {
    const log = mock.method(console, "error", () => {});
    const res = await setup({ cancelExpiredOrders: failWith(new Error("rpc down")) }).call(req());
    assert.equal(res.status, 200);
    assert.equal((log.mock.calls[0].arguments[0] as { scope: string }).scope, "orders.pay.cancelExpired");
  });

  it("502: платёжка вернула ok:false или бросила исключение", async () => {
    mock.method(console, "error", () => {});
    for (const createPayment of [
      async () => ({ ok: false as const, kind: "provider_unavailable" as const, message: "timeout" }),
      failWith(new Error("socket hang up")),
    ]) {
      const res = await setup({ createPayment }).call(req());
      assert.equal(res.status, 502);
      assert.deepEqual(await json(res), {
        error: { code: "PAYMENT_PROVIDER_ERROR", message: "Платёжный сервис временно недоступен. Повторите через минуту" },
      });
    }
  });

  it("гонка: createPaymentForOrder бросил PaymentOrderError → 409 / 404, а не 502", async () => {
    const { PaymentOrderError } = await import("@/lib/payments/create");
    const payable = await setup({ createPayment: failWith(new PaymentOrderError("ORDER_NOT_PAYABLE")) }).call(req());
    assert.equal(payable.status, 409);
    assert.deepEqual(await json(payable), NOT_PAYABLE);
    const missing = await setup({ createPayment: failWith(new PaymentOrderError("ORDER_NOT_FOUND")) }).call(req());
    assert.equal(missing.status, 404);
    assert.deepEqual(await json(missing), NOT_FOUND);
  });

  it("provider_rejected (4xx) → тот же 502; лог структурой без текста ЮKassa", async () => {
    const log = mock.method(console, "error", () => {});
    const res = await setup({
      createPayment: async () => ({ ok: false as const, kind: "provider_rejected" as const, message: "receipt.customer.email a@b.ru", yookassaCode: "invalid_request" }),
    }).call(req());
    assert.equal(res.status, 502);
    assert.deepEqual(await json(res), { error: { code: "PAYMENT_PROVIDER_ERROR", message: "Платёжный сервис временно недоступен. Повторите через минуту" } });
    assert.deepEqual(log.mock.calls.at(-1)?.arguments[0], { scope: "orders.pay.payment", orderId: ORDER_ID, kind: "provider_rejected", yookassaCode: "invalid_request" });
  });

  it("лимит вызывается с запросом (IP) и номером заказа", async () => {
    const seen: Array<[string | null, string]> = [];
    const r = req();
    r.request.headers.set("x-forwarded-for", "203.0.113.9");
    await setup({ limitPay: async (rq, n) => { seen.push([rq.headers.get("x-forwarded-for"), n]); return null; } }).call(r);
    assert.deepEqual(seen, [["203.0.113.9", NUMBER]]);
  });

  it("500 при сбое чтения заказа: без стека", async () => {
    mock.method(console, "error", () => {});
    const res = await setup({ selectOrderForAccess: failWith(new Error("orders.forAccess: PGRST boom")) }).call(req());
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { error: { code: "INTERNAL_ERROR", message: "Что-то пошло не так. Мы уже разбираемся" } });
    assert.doesNotMatch(text, /PGRST|boom|stack/);
  });

  it("Cache-Control: private, no-store на 200/403/404/409/429/500/502", async () => {
    mock.method(console, "error", () => {});
    const cases: Array<[number, Response]> = [
      [200, await setup().call(req())],
      [403, await setup({ assertSameOrigin: () => apiError("FORBIDDEN", "Недопустимый источник запроса", 403) }).call(req())],
      [404, await setup().call(req({ token: WRONG }))],
      [409, await setup({ order: row({ status: "cancelled" }) }).call(req())],
      [429, await setup({ limitPay: async () => rl.rateLimitedResponse(600) }).call(req())],
      [500, await setup({ getSessionContext: failWith(new Error("x")) }).call(req())],
      [502, await setup({ createPayment: async () => ({ ok: false as const, kind: "provider_rejected" as const, message: "x" }) }).call(req())],
    ];
    for (const [status, res] of cases) {
      assert.equal(res.status, status);
      assert.equal(res.headers.get("Cache-Control"), NO_STORE, String(status));
    }
  });
});
