import assert from "node:assert/strict";
import { afterEach, before, describe, it, mock } from "node:test";
import type { GetOrderDeps } from "@/app/api/orders/[number]/handler";
import type { GetOrderViewDeps, GetOrderViewInput, GetOrderViewResult } from "@/lib/orders/get-view";
import type { OrderAccessRow } from "@/lib/orders/db";
import type { OrderViewData } from "@/lib/orders/view";
import { applyTestEnv } from "@/test/env";

// GET /api/orders/[number]?t=<token> с фейковыми зависимостями. JSON ответов — дословно Блок 3.

let mod: typeof import("@/app/api/orders/[number]/handler");
let gv: typeof import("@/lib/orders/get-view");
let tk: typeof import("@/lib/orders/token");
let rl: typeof import("@/lib/rate-limit");
before(async () => {
  applyTestEnv();
  mod = await import("@/app/api/orders/[number]/handler");
  gv = await import("@/lib/orders/get-view");
  tk = await import("@/lib/orders/token");
  rl = await import("@/lib/rate-limit");
});

const NUMBER = "FC-26-000123";
const ORDER_ID = "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68";
const TOKEN = "Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU";
const NO_STORE = "private, no-store";
const NOT_FOUND = { error: { code: "NOT_FOUND", message: "Заказ не найден" } };
const SESSION = { userId: null, role: null, atelierId: null };

const req = (opts: { number?: string; query?: string } = {}) => {
  const number = opts.number ?? NUMBER;
  const query = opts.query ?? `?t=${TOKEN}`;
  return {
    request: new Request(`http://localhost:3000/api/orders/${encodeURIComponent(number)}${query}`, {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    }),
    ctx: { params: Promise.resolve({ number }) },
  };
};

/** Данные из «БД» с подмешанными служебными полями: наружу они попасть не должны. */
function leakyData(): OrderViewData {
  const order = {
    id: ORDER_ID, number: NUMBER, kind: "stock", status: "shipped", delivery_method: "cdek_pvz", delivery_city: "Казань",
    delivery_address: null, cdek_pvz_code: "KZN45", total: 13370000, reserved_until: null,
    paid_at: "2026-10-01T12:34:10+00:00", expected_ready_at: null, shipped_at: "2026-10-02T10:15:00+00:00",
    delivered_at: null, cancel_reason: null, tracking_number: "1234567890", courier_note: null, customer_visible_note: null,
    telegram_subscribed: true, customer_name: "Артём Соколов", customer_email: "artem.sokolov@yandex.ru", customer_phone: "+79165551234",
    admin_note: "SECRET-ADMIN-NOTE", public_token_hash: "f".repeat(64), telegram_chat_id: 987654321,
    attention_reason: "SECRET-ATTENTION", client_request_id: "0e7c4a19-5b2d-4f8e-9a63-1d0c8b7e2f45",
  } as OrderViewData["order"];
  return {
    order,
    items: [{ title: "M-01", quantity: 1, unit_price: 13370000, line_total: 13370000, product_slug: "m-01" }],
    history: [{ to_status: "paid", created_at: "2026-10-01T12:34:10+00:00", note: "SECRET-HISTORY-NOTE" } as OrderViewData["history"][number]],
    refunded_amount: 0,
    last_payment: { status: "canceled", cancellation_reason: "SECRET-YK-REASON" },
  };
}

/** Реальный getOrderViewWith на фейковой «БД». */
function realGetOrderView(): (input: GetOrderViewInput) => Promise<GetOrderViewResult> {
  const row: OrderAccessRow = {
    id: ORDER_ID, number: NUMBER, status: "shipped", kind: "stock", user_id: null,
    public_token_hash: tk.hashOrderToken(TOKEN), reserved_until: null, total: 13370000,
  };
  const deps: GetOrderViewDeps = {
    selectOrderForAccess: async (n) => (n === NUMBER ? row : null),
    cancelExpiredOrders: async () => 0,
    reconcileOrderPayments: async () => ({}),
    loadOrderViewData: async () => leakyData(),
    telegramBotUsername: "forgecarbon_bot",
    now: () => new Date("2026-10-02T12:00:00Z"),
  };
  return (input) => gv.getOrderViewWith(deps, input);
}

function setup(over: Partial<GetOrderDeps> = {}) {
  const calls: string[] = [];
  const deps: GetOrderDeps = {
    limitOrderRead: async (r) => { calls.push("rate"); return (over.limitOrderRead ?? (async () => null))(r); },
    getSessionContext: async () => { calls.push("session"); return (over.getSessionContext ?? (async () => SESSION))(); },
    getOrderView: async (input) => {
      calls.push(`view:${input.number}:${input.token ?? "-"}`);
      return (over.getOrderView ?? realGetOrderView())(input);
    },
  };
  const GET = mod.createGetOrderHandler(deps);
  return { calls, call: (r: ReturnType<typeof req>) => GET(r.request, r.ctx) };
}

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe("GET /api/orders/[number]: порядок, 404, 429", () => {
  afterEach(() => mock.restoreAll());

  it("200 { data } по токену; порядок rate → session → view; no-store", async () => {
    const { calls, call } = setup();
    const res = await call(req());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), NO_STORE);
    const body = await json(res);
    const data = body.data as Record<string, unknown>;
    assert.equal(data.number, NUMBER);
    assert.equal(data.status_label, "Передан в доставку");
    assert.equal(data.telegram_link, `https://t.me/forgecarbon_bot?start=o_${TOKEN}`);
    assert.deepEqual(Object.keys(body), ["data"]);
    assert.deepEqual(calls, ["rate", "session", `view:${NUMBER}:${TOKEN}`]);
  });

  it("служебные поля не светятся в ответе", async () => {
    const text = await (await setup().call(req())).text();
    for (const s of ["public_token_hash", "admin_note", "telegram_chat_id", "attention_reason", "client_request_id",
      "SECRET-", "f".repeat(64), "987654321", ORDER_ID, "artem.sokolov", "5551234"]) {
      assert.ok(!text.includes(s), s);
    }
  });

  it("без токена → токен null передаётся дальше (доступ решает getOrderView)", async () => {
    const { calls, call } = setup();
    const res = await call(req({ query: "" }));
    assert.equal(res.status, 404); // гость без токена
    assert.deepEqual(await json(res), NOT_FOUND);
    assert.deepEqual(calls, ["rate", "session", `view:${NUMBER}:-`]);
  });

  it("неверный токен → тот же 404, что и несуществующий номер", async () => {
    const a = await setup().call(req({ query: `?t=${"A".repeat(32)}` }));
    const b = await setup().call(req({ number: "FC-26-999999" }));
    assert.equal(a.status, 404);
    assert.equal(b.status, 404);
    assert.deepEqual(await json(a), NOT_FOUND);
    assert.deepEqual(await json(b), NOT_FOUND);
    assert.equal(a.headers.get("Cache-Control"), NO_STORE);
  });

  for (const [name, r] of [
    ["номер не по формату", req({ number: "FC-26-12" })],
    ["номер с мусором", req({ number: "FC-26-000123;drop" })],
    ["токен короткий", req({ query: "?t=abc" })],
    ["токен пустой", req({ query: "?t=" })],
    ["токен с недопустимым символом", req({ query: `?t=${"A".repeat(31)}*` })],
  ] as const) {
    it(`${name} → 404 (не 400), после лимита, без сессии и БД`, async () => {
      const { calls, call } = setup();
      const res = await call(r);
      assert.equal(res.status, 404);
      assert.deepEqual(await json(res), NOT_FOUND);
      assert.equal(res.headers.get("Cache-Control"), NO_STORE);
      assert.deepEqual(calls, ["rate"]);
    });
  }

  it("429 первым: Retry-After 60, JSON 3.0, no-store", async () => {
    const { calls, call } = setup({ limitOrderRead: async () => rl.rateLimitedResponse(60) });
    const res = await call(req({ number: "bad" }));
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("Retry-After"), "60");
    assert.equal(res.headers.get("Cache-Control"), NO_STORE);
    assert.deepEqual(await json(res), {
      error: { code: "RATE_LIMITED", message: "Слишком много запросов. Повторите через минуту", details: { retry_after_seconds: 60 } },
    });
    assert.deepEqual(calls, ["rate"]);
  });

  it("сбой хранилища лимитов (fail-closed) → 500 без stack", async () => {
    const err = mock.method(console, "error", () => {});
    const { calls, call } = setup({ limitOrderRead: async () => { throw new Error("check_rate_limit: down at /secret/path.ts:1"); } });
    const res = await call(req());
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("Cache-Control"), NO_STORE);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { error: { code: "INTERNAL_ERROR", message: "Что-то пошло не так. Мы уже разбираемся" } });
    assert.ok(!text.includes("down") && !text.includes("secret"));
    assert.deepEqual(calls, ["rate"]);
    assert.equal((err.mock.calls[0].arguments[0] as { scope: string }).scope, "orders.get");
  });

  it("ошибка БД при чтении → 500 INTERNAL_ERROR, no-store", async () => {
    mock.method(console, "error", () => {});
    const res = await setup({ getOrderView: async () => { throw new Error("orders.view: 57014 timeout"); } }).call(req());
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("Cache-Control"), NO_STORE);
    assert.deepEqual(await json(res), { error: { code: "INTERNAL_ERROR", message: "Что-то пошло не так. Мы уже разбираемся" } });
  });

  it("сессия владельца передаётся в getOrderView", async () => {
    let seen: GetOrderViewInput | null = null;
    const owner = { userId: "5d1e7a3c-8b2f-4c6d-9e0a-1f3b5c7d9e21", role: "customer", atelierId: null };
    const { call } = setup({
      getSessionContext: async () => owner,
      getOrderView: async (input) => { seen = input; return { kind: "not_found" }; },
    });
    await call(req({ query: "" }));
    assert.deepEqual(seen, { number: NUMBER, token: null, ctx: owner });
  });
});

describe("limitOrderReadWith: 30 / 60 с на IP, ключ order:<ip> (5.10)", () => {
  it("ключ и параметры; 31-й запрос — 429 с Retry-After 60", async () => {
    const counts = new Map<string, number>();
    const seen: Array<[string, number, number]> = [];
    const check = async (key: string, limit: number, windowSeconds: number) => {
      seen.push([key, limit, windowSeconds]);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n <= limit;
    };
    const r = req().request;
    for (let i = 0; i < 30; i++) assert.equal(await rl.limitOrderReadWith(check, r), null);
    const res = await rl.limitOrderReadWith(check, r);
    assert.equal(res?.status, 429);
    assert.equal(res?.headers.get("Retry-After"), "60");
    assert.deepEqual(seen[0], ["order:203.0.113.7", 30, 60]);
    assert.deepEqual(rl.RATE_LIMITS.orderRead, { limit: 30, windowSeconds: 60 });
  });

  it("fail-closed: сбой проверки пробрасывается", async () => {
    await assert.rejects(rl.limitOrderReadWith(async () => { throw new Error("down"); }, req().request), /down/);
  });
});
