import assert from "node:assert/strict";
import { afterEach, before, describe, it, mock } from "node:test";
import { inspect } from "node:util";
import { createCreateOrderHandler, type CreateOrderDeps } from "@/app/api/orders/handler";
import { apiError } from "@/lib/api-error";
import { assertSameOrigin } from "@/lib/csrf";
import { formatRub } from "@/lib/money";
import type { CreateOrderParams, CreatedOrder, OrderStateRow } from "@/lib/orders/db";
import { DbError } from "@/lib/orders/errors";
import type { CartProduct } from "@/types/cart";
import { applyTestEnv } from "@/test/env";

// POST /api/orders с фейковыми зависимостями (без Supabase и ЮKassa). JSON ответов — дословно Блок 3.

let rl: typeof import("@/lib/rate-limit");
let tk: typeof import("@/lib/orders/token");
before(async () => {
  applyTestEnv();
  rl = await import("@/lib/rate-limit");
  tk = await import("@/lib/orders/token");
});

const SECRET = "handler-test-secret-0123456789abcdefgh";
const SITE = "https://forgecarbon.vercel.app";
const CRID = "0e7c4a19-5b2d-4f8e-9a63-1d0c8b7e2f45";
const W = "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51";
const GONE = "d4a7b2c9-1e3f-4a8b-9c6d-2f0e5b8a7c31";
const ORDER_ID = "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68";
const NUMBER = "FC-26-000123";
const RESERVED = "2026-10-01T13:00:00+00:00";
const NOW = new Date("2026-10-01T12:30:00.000Z");
const CONFIRM = "https://yoomoney.ru/checkout/payments/v2/contract?orderId=30a8d2c1-000f-5000-9000-1b6c4d2e8f10";
const ORIGIN = "http://localhost:3000";
const NO_STORE = "private, no-store";

const BODY = {
  client_request_id: CRID,
  items: [{ product_id: W, quantity: 1 }],
  expected_total: 13370000,
  customer: { name: "Артём Соколов", phone: "+7 916 555-12-34", email: "artem.sokolov@yandex.ru" },
  delivery: { method: "cdek_pvz", city: "Казань", cdek_pvz_code: "KZN45", address: null, postal_code: null },
  vehicle_id: "6f2d8a41-9c3e-4b75-a0d2-3e8f1c7b9d64",
  vin: "WBAJA11050B123456",
  comment: "Позвоните перед отправкой",
  consent_pd: true,
  consent_offer: true,
};

const WHEEL: CartProduct = {
  id: W, slug: "forged-m01-r20-5x112-graphite", title: "Кованый моноблок M-01 R20, 5×112, графит", type: "wheel_set",
  availability_mode: "stock", unit_price: 13520000, available_qty: 0, cover_image_url: null,
};

const req = (body: unknown = BODY, origin: string | null = ORIGIN) => new Request("http://localhost:3000/api/orders", {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...(origin ? { origin } : {}) },
  body: body === null ? undefined : typeof body === "string" ? body : JSON.stringify(body),
});

const pgErr = (code: string, message: string) => new DbError("rpc.create_order", code, message);

/**
 * Фейковая «БД»: create_order идемпотентен по client_request_id (как в 2.14), хранит хэш токена.
 * over.createOrder подменяет поведение (ошибки); журнал calls фиксирует порядок вызовов.
 */
function setup(over: Partial<CreateOrderDeps> & { state?: Partial<OrderStateRow> | null } = {}) {
  const calls: string[] = [];
  const stored = new Map<string, { order: CreatedOrder; params: CreateOrderParams }>();
  const createParams: CreateOrderParams[] = [];
  const realCreate = async (params: CreateOrderParams): Promise<CreatedOrder> => {
    const hit = stored.get(params.p_order.client_request_id);
    if (hit) return hit.order;
    const order: CreatedOrder = { order_id: ORDER_ID, order_number: NUMBER, order_total: 13370000, order_kind: "stock" };
    stored.set(params.p_order.client_request_id, { order, params });
    return order;
  };
  const deps: CreateOrderDeps = {
    assertSameOrigin: (r) => { calls.push("origin"); return (over.assertSameOrigin ?? (() => null))(r); },
    limitOrders: async (r) => { calls.push("rate"); return (over.limitOrders ?? (async () => null))(r); },
    getSessionContext: async () => {
      calls.push("session");
      return (over.getSessionContext ?? (async () => ({ userId: null, role: null, atelierId: null })))();
    },
    countActiveReservations: async (email, crid) => {
      calls.push(`count:${email}:${crid}`);
      return (over.countActiveReservations ?? (async () => 0))(email, crid);
    },
    createOrder: async (params) => { calls.push("create"); createParams.push(params); return (over.createOrder ?? realCreate)(params); },
    findOrderByClientRequestId: async (id) => {
      calls.push("find");
      return (over.findOrderByClientRequestId ?? (async (x: string) => stored.get(x)?.order ?? null))(id);
    },
    getOrderState: async (id) => {
      calls.push("state");
      if (over.getOrderState) return over.getOrderState(id);
      if (over.state === null) return null;
      // Владелец — из сохранённого p_order (как в БД); без сохранения (create_order подменён) — email из BODY, гость.
      const saved = [...stored.values()].find((v) => v.order.order_id === id)?.params.p_order;
      const base: OrderStateRow = {
        id, status: "pending_payment", reserved_until: RESERVED,
        customer_email: saved?.customer_email ?? BODY.customer.email, user_id: saved?.user_id ?? null,
      };
      return { ...base, ...over.state };
    },
    getCartProducts: async (ids, ctx) => { calls.push(`products:${ids.join(",")}:${ctx.atelierId}`); return (over.getCartProducts ?? (async () => [WHEEL]))(ids, ctx); },
    createPayment: async (id, opts) => {
      calls.push(`pay:${id}:${opts.reuseWithinSeconds}:${opts.deadlineMs}`);
      return (over.createPayment ?? (async () => ({ ok: true as const, confirmationUrl: CONFIRM, paymentId: "p-1", reused: false })))(id, opts);
    },
    tokens: {
      orderToken: (id) => tk.orderToken(id, SECRET),
      hashOrderToken: (t) => tk.hashOrderToken(t),
      orderPageUrl: (n, t) => tk.orderPageUrl(n, t, SITE),
    },
    featureAtelier: over.featureAtelier ?? true,
    now: () => NOW,
  };
  return { calls, createParams, stored, POST: createCreateOrderHandler(deps) };
}

const forbid = () => apiError("FORBIDDEN", "Недопустимый источник запроса", 403);
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const orderUrl = () => `${SITE}/orders/${NUMBER}?t=${tk.orderToken(CRID, SECRET)}`;
const failWith = (e: unknown) => async () => { throw e; };

describe("POST /api/orders: порядок проверок", () => {
  afterEach(() => mock.restoreAll());

  it("403 при чужом Origin — до rate limit, тела и БД", async () => {
    const { calls, POST } = setup({ assertSameOrigin: forbid });
    const res = await POST(req());
    assert.equal(res.status, 403);
    assert.deepEqual(calls, ["origin"]);
  });

  it("настоящий assertSameOrigin: без Origin и с чужим Origin → 403", async () => {
    const env = process.env as Record<string, string | undefined>;
    const saved = env.NEXT_PUBLIC_SITE_URL;
    env.NEXT_PUBLIC_SITE_URL = SITE;
    try {
      const { calls, POST } = setup({ assertSameOrigin });
      assert.equal((await POST(req(BODY, null))).status, 403);
      assert.equal((await POST(req(BODY, "https://evil.example"))).status, 403);
      assert.deepEqual(calls, ["origin", "origin"]);
    } finally {
      env.NEXT_PUBLIC_SITE_URL = saved;
    }
  });

  it("429 лимита заказов (текст Блока 3, Retry-After 600) — до разбора тела и БД", async () => {
    const limited = () => rl.rateLimitedResponse(600, rl.ORDERS_RATE_LIMITED_MESSAGE);
    const { calls, POST } = setup({ limitOrders: async () => limited() });
    const res = await POST(req("{битый"));
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("Retry-After"), "600");
    assert.deepEqual(await json(res), {
      error: { code: "RATE_LIMITED", message: "Слишком много попыток оформления. Повторите через 10 минут", details: { retry_after_seconds: 600 } },
    });
    assert.deepEqual(calls, ["origin", "rate"]);
    assert.deepEqual(rl.RATE_LIMITS.orders, { limit: 5, windowSeconds: 600 });
  });

  it("fail-closed (Edge Case 27): сбой хранилища лимитов → 500, заказ не создаётся", async () => {
    mock.method(console, "error", () => {});
    const { calls, POST } = setup({ limitOrders: failWith(new Error("check_rate_limit: PGRST000 connection refused")) });
    const res = await POST(req());
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { error: { code: "INTERNAL_ERROR", message: "Что-то пошло не так. Мы уже разбираемся" } });
    assert.doesNotMatch(text, /PGRST|refused|stack/);
    assert.deepEqual(calls, ["origin", "rate"]);
  });

  it("400 Zod — до сессии, BR-18 и create_order", async () => {
    const { calls, POST } = setup();
    assert.equal((await POST(req({ ...BODY, items: [] }))).status, 400);
    assert.deepEqual(calls, ["origin", "rate"]);
  });

  it("201: Origin → лимит → сессия → BR-18 → create_order → заказ → платёж", async () => {
    const { calls, POST } = setup();
    assert.equal((await POST(req())).status, 201);
    assert.deepEqual(calls, ["origin", "rate", "session", `count:artem.sokolov@yandex.ru:${CRID}`, "create", "state", `pay:${ORDER_ID}:600:25000`]);
  });
});

describe("POST /api/orders: 400 VALIDATION_ERROR", () => {
  it("пример Блока 3: ключи customer.phone и consent_pd", async () => {
    const res = await setup().POST(req({ ...BODY, customer: { ...BODY.customer, phone: "123" }, consent_pd: false }));
    assert.equal(res.status, 400);
    assert.deepEqual(await json(res), {
      error: {
        code: "VALIDATION_ERROR", message: "Проверьте поля формы",
        details: { fields: { "customer.phone": ["Телефон в формате +7 999 123-45-67"], consent_pd: ["Нужно согласие на обработку персональных данных"] } },
      },
    });
  });

  it("вложенные поля доставки и дубли позиций — полный путь ключа", async () => {
    const res = await setup().POST(req({
      ...BODY,
      items: [{ product_id: W, quantity: 1 }, { product_id: W, quantity: 1 }],
      delivery: { method: "cdek_door", city: "Казань", address: "ул. Баумана, 1", postal_code: "4200", cdek_pvz_code: null },
      consent_offer: false,
    }));
    const body = await json(res) as { error: { details: { fields: Record<string, string[]> } } };
    assert.deepEqual(body.error.details.fields, {
      items: ["Один товар — одна позиция"],
      "delivery.postal_code": ["Индекс — 6 цифр"],
      consent_offer: ["Нужно принять условия оферты"],
    });
  });

  it("пустое тело, битый JSON, не объект → fields {}", async () => {
    for (const body of [null, "", "{items:", "[]", "42"]) {
      const res = await setup().POST(req(body));
      assert.equal(res.status, 400);
      assert.deepEqual(await json(res), { error: { code: "VALIDATION_ERROR", message: "Проверьте поля формы", details: { fields: {} } } });
    }
  });
});

describe("POST /api/orders: BR-18", () => {
  it("3 неоплаченных заказа с бронью на email → 429 с retry_after 1800, create_order не вызывается", async () => {
    const { calls, POST } = setup({ countActiveReservations: async () => 3 });
    const res = await POST(req({ ...BODY, customer: { ...BODY.customer, email: "  Artem.Sokolov@Yandex.RU " } }));
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("Retry-After"), "1800");
    assert.deepEqual(await json(res), {
      error: {
        code: "RATE_LIMITED", message: "У вас уже есть неоплаченные заказы. Оплатите или дождитесь отмены через 30 минут",
        details: { retry_after_seconds: 1800 },
      },
    });
    assert.ok(calls.includes(`count:artem.sokolov@yandex.ru:${CRID}`));
    assert.ok(!calls.includes("create"));
  });

  it("2 неоплаченных → заказ создаётся", async () => {
    assert.equal((await setup({ countActiveReservations: async () => 2 }).POST(req())).status, 201);
  });
});

describe("POST /api/orders: 201 и идемпотентность", () => {
  it("201 — JSON Блока 3; order_url с восстановимым токеном, который проходит сверку с сохранённым хэшем", async () => {
    const { createParams, POST } = setup();
    const res = await POST(req());
    assert.equal(res.status, 201);
    assert.deepEqual(await json(res), {
      data: {
        order_id: ORDER_ID, order_number: NUMBER, total: 13370000, total_formatted: formatRub(13370000),
        reserved_until: "2026-10-01T13:00:00.000Z", confirmation_url: CONFIRM, order_url: orderUrl(),
      },
    });
    const t = new URL(orderUrl()).searchParams.get("t") ?? "";
    assert.match(t, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(tk.tokenMatchesHash(t, createParams[0].p_order.public_token_hash), true);
    assert.equal(createParams[0].p_order.public_token_hash, tk.hashOrderToken(tk.orderToken(CRID, SECRET)));
  });

  it("p_order: гость — user_id/atelier_id null; ателье — atelier_id; FEATURE_ATELIER=false — atelier_id null", async () => {
    const guest = setup();
    await guest.POST(req());
    assert.equal(guest.createParams[0].p_order.user_id, null);
    assert.equal(guest.createParams[0].p_order.atelier_id, null);
    assert.equal(guest.createParams[0].p_order.customer_phone, "+79165551234");

    const session = async () => ({ userId: "u-1", role: "atelier", atelierId: "at-1" });
    const atelier = setup({ getSessionContext: session });
    await atelier.POST(req());
    assert.equal(atelier.createParams[0].p_order.user_id, "u-1");
    assert.equal(atelier.createParams[0].p_order.atelier_id, "at-1");

    const off = setup({ getSessionContext: session, featureAtelier: false });
    await off.POST(req());
    assert.equal(off.createParams[0].p_order.atelier_id, null);
  });

  it("повтор с тем же client_request_id → тот же заказ, тот же токен, платёж с переиспользованием", async () => {
    const { calls, stored, POST } = setup();
    const a = await json(await POST(req()));
    const b = await json(await POST(req()));
    assert.deepEqual(a, b);
    assert.equal(stored.size, 1);
    assert.deepEqual(calls.filter((c) => c.startsWith("pay:")), [`pay:${ORDER_ID}:600:25000`, `pay:${ORDER_ID}:600:25000`]);
  });

  it("повтор для отменённого / просроченного заказа → 409 ORDER_NOT_PAYABLE без платежа", async () => {
    for (const state of [
      { status: "cancelled" as const },
      { status: "pending_payment" as const, reserved_until: "2026-10-01T12:00:00+00:00" },
    ]) {
      const { calls, POST } = setup({ state });
      const res = await POST(req());
      assert.equal(res.status, 409);
      assert.deepEqual(await json(res), { error: { code: "ORDER_NOT_PAYABLE", message: "Время на оплату истекло. Оформите заказ заново" } });
      assert.ok(!calls.some((c) => c.startsWith("pay:")));
    }
  });

  it("повтор для уже оплаченного заказа → 201, confirmation_url ведёт на страницу заказа, платёж не создаётся", async () => {
    const { calls, POST } = setup({ state: { status: "paid", reserved_until: null } });
    const res = await POST(req());
    assert.equal(res.status, 201);
    const data = (await json(res)).data as { confirmation_url: string; order_url: string };
    assert.equal(data.confirmation_url, orderUrl());
    assert.equal(data.order_url, orderUrl());
    assert.ok(!calls.some((c) => c.startsWith("pay:")));
  });
});

describe("POST /api/orders: ошибки create_order (Блок 3)", () => {
  afterEach(() => mock.restoreAll());

  it("PRICE_CHANGED → 409 с actual_total по текущим ценам", async () => {
    const { calls, POST } = setup({ createOrder: failWith(pgErr("P0001", "PRICE_CHANGED")), getCartProducts: async () => [{ ...WHEEL, available_qty: 3 }] });
    const res = await POST(req());
    assert.equal(res.status, 409);
    assert.deepEqual(await json(res), {
      error: { code: "PRICE_CHANGED", message: "Цены изменились", details: { expected_total: 13370000, actual_total: 13520000, actual_total_formatted: formatRub(13520000) } },
    });
    assert.ok(calls.includes(`products:${W}:null`));
  });

  it("Edge Case 20: сессия ателье истекла → расчёт по рознице (atelierId null в каталоге)", async () => {
    const { calls, POST } = setup({ createOrder: failWith(pgErr("P0001", "PRICE_CHANGED")) });
    await POST(req({ ...BODY, expected_total: 11800000 }));
    assert.ok(calls.includes(`products:${W}:null`));
  });

  it("PRICE_CHANGED у одобренного ателье — сумма по ценам ателье (atelierId в каталоге)", async () => {
    const { calls, POST } = setup({
      createOrder: failWith(pgErr("P0001", "PRICE_CHANGED")),
      getSessionContext: async () => ({ userId: "u-1", role: "atelier", atelierId: "at-1" }),
    });
    await POST(req());
    assert.ok(calls.includes(`products:${W}:at-1`));
  });

  it("OUT_OF_STOCK → 409 «Комплект закончился» с available_qty", async () => {
    const res = await setup({ createOrder: failWith(pgErr("P0001", `OUT_OF_STOCK:${W}`)), findOrderByClientRequestId: async () => null }).POST(req());
    assert.equal(res.status, 409);
    assert.deepEqual(await json(res), { error: { code: "OUT_OF_STOCK", message: "Комплект закончился", details: { product_id: W, available_qty: 0 } } });
  });

  it("OUT_OF_STOCK при сбое справочного запроса → available_qty 0, не 500", async () => {
    mock.method(console, "error", () => {});
    const res = await setup({
      createOrder: failWith(pgErr("P0001", `OUT_OF_STOCK:${W}`)), findOrderByClientRequestId: async () => null,
      getCartProducts: failWith(new Error("boom")),
    }).POST(req());
    assert.equal(res.status, 409);
    assert.deepEqual((await json(res) as { error: { details: unknown } }).error.details, { product_id: W, available_qty: 0 });
  });

  it("Edge Case 1: OUT_OF_STOCK, но заказ с этим client_request_id уже создан параллельным запросом → 201 тот же заказ", async () => {
    const existing: CreatedOrder = { order_id: ORDER_ID, order_number: NUMBER, order_total: 13370000, order_kind: "stock" };
    const { calls, POST } = setup({ createOrder: failWith(pgErr("P0001", `OUT_OF_STOCK:${W}`)), findOrderByClientRequestId: async () => existing });
    const res = await POST(req());
    assert.equal(res.status, 201);
    assert.equal(((await json(res)).data as { order_url: string }).order_url, orderUrl());
    assert.ok(calls.includes("find"));
  });

  it("MIXED_KINDS → 409", async () => {
    const res = await setup({ createOrder: failWith(pgErr("P0001", "MIXED_KINDS")) }).POST(req());
    assert.equal(res.status, 409);
    assert.deepEqual(await json(res), { error: { code: "MIXED_KINDS", message: "Товары под заказ оформляются отдельным заказом" } });
  });

  it("QTY_LIMIT → 409: диск — текст Блока 3, карбон — 4 штуки", async () => {
    const wheel = await setup({ createOrder: failWith(pgErr("P0001", `QTY_LIMIT:${W}`)) }).POST(req());
    assert.equal(wheel.status, 409);
    assert.deepEqual(await json(wheel), { error: { code: "QTY_LIMIT", message: "Не больше 2 комплектов одного диска в заказе", details: { product_id: W } } });
    const carbon = await setup({
      createOrder: failWith(pgErr("P0001", `QTY_LIMIT:${W}`)),
      getCartProducts: async () => [{ ...WHEEL, type: "carbon_part", availability_mode: "preorder", available_qty: null }],
    }).POST(req());
    assert.deepEqual(await json(carbon), { error: { code: "QTY_LIMIT", message: "Не больше 4 штук одной карбоновой детали в заказе", details: { product_id: W } } });
  });

  it("PRODUCT_UNAVAILABLE → 410", async () => {
    const res = await setup({ createOrder: failWith(pgErr("P0001", `PRODUCT_UNAVAILABLE:${GONE}`)) }).POST(req());
    assert.equal(res.status, 410);
    assert.deepEqual(await json(res), { error: { code: "PRODUCT_UNAVAILABLE", message: "Товар больше не продаётся", details: { product_id: GONE } } });
  });

  it("EMPTY_CART / TOO_MANY_LINES / DUPLICATE_ITEMS → 400 VALIDATION_ERROR", async () => {
    const cases: Array<[string, unknown]> = [
      ["EMPTY_CART", { error: { code: "VALIDATION_ERROR", message: "Корзина пуста", details: { fields: { items: ["Корзина пуста"] } } } }],
      ["TOO_MANY_LINES", { error: { code: "VALIDATION_ERROR", message: "Проверьте поля формы", details: { fields: { items: ["Не больше 10 позиций в заказе"] } } } }],
      ["DUPLICATE_ITEMS", { error: { code: "VALIDATION_ERROR", message: "Один товар — одна позиция", details: { fields: { items: ["Один товар — одна позиция"] } } } }],
    ];
    for (const [msg, expected] of cases) {
      const res = await setup({ createOrder: failWith(pgErr("P0001", msg)) }).POST(req());
      assert.equal(res.status, 400, msg);
      assert.deepEqual(await json(res), expected);
    }
  });

  it("deadlock 40P01 / serialization 40001 / 23505 → один повтор create_order и 201", async () => {
    mock.method(console, "error", () => {});
    for (const code of ["40P01", "40001", "23505"]) {
      let n = 0;
      const created: CreatedOrder = { order_id: ORDER_ID, order_number: NUMBER, order_total: 13370000, order_kind: "stock" };
      const { calls, POST } = setup({ createOrder: async () => { if (n++ === 0) throw pgErr(code, "deadlock detected"); return created; } });
      assert.equal((await POST(req())).status, 201, code);
      assert.equal(calls.filter((c) => c === "create").length, 2);
    }
  });

  it("повторный deadlock → 500, третьей попытки нет", async () => {
    mock.method(console, "error", () => {});
    const { calls, POST } = setup({ createOrder: failWith(pgErr("40P01", "deadlock detected")) });
    assert.equal((await POST(req())).status, 500);
    assert.equal(calls.filter((c) => c === "create").length, 2);
  });

  it("прочие ошибки → 500 без повтора; стек и текст БД не уходят клиенту, лог — структурой", async () => {
    const log = mock.method(console, "error", () => {});
    const { calls, POST } = setup({ createOrder: failWith(pgErr("42501", "permission denied for function create_order")) });
    const res = await POST(req());
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { error: { code: "INTERNAL_ERROR", message: "Что-то пошло не так. Мы уже разбираемся" } });
    assert.doesNotMatch(text, /stack|permission|42501|create_order|at /);
    assert.equal(calls.filter((c) => c === "create").length, 1);
    const entry = log.mock.calls.at(-1)?.arguments[0] as { scope: string; err: unknown };
    assert.equal(entry.scope, "orders.create");
    assert.ok(entry.err instanceof DbError);
  });
});

describe("POST /api/orders: 502 и Cache-Control", () => {
  afterEach(() => mock.restoreAll());

  it("платёжка отказала → 502 с order_url (заказ сохранён в pending_payment)", async () => {
    mock.method(console, "error", () => {});
    for (const createPayment of [
      async () => ({ ok: false as const, kind: "provider_unavailable" as const, message: "YooKassa 503" }),
      failWith(new Error("socket hang up")),
    ]) {
      const res = await setup({ createPayment }).POST(req());
      assert.equal(res.status, 502);
      assert.deepEqual(await json(res), {
        error: {
          code: "PAYMENT_PROVIDER_ERROR", message: "Платёжный сервис временно недоступен. Заказ сохранён — оплатите его со страницы заказа",
          details: { order_url: orderUrl() },
        },
      });
    }
  });

  it("гонка: PaymentOrderError ORDER_NOT_PAYABLE → 409, ORDER_NOT_FOUND → 500 (не 502)", async () => {
    mock.method(console, "error", () => {});
    const { PaymentOrderError } = await import("@/lib/payments/create");
    const notPayable = await setup({ createPayment: failWith(new PaymentOrderError("ORDER_NOT_PAYABLE")) }).POST(req());
    assert.equal(notPayable.status, 409);
    assert.deepEqual(await json(notPayable), { error: { code: "ORDER_NOT_PAYABLE", message: "Время на оплату истекло. Оформите заказ заново" } });
    const missing = await setup({ createPayment: failWith(new PaymentOrderError("ORDER_NOT_FOUND")) }).POST(req());
    assert.equal(missing.status, 500);
  });

  it("Cache-Control: private, no-store на 201/400/403/409/410/429/500/502", async () => {
    mock.method(console, "error", () => {});
    const cases: Array<[number, Response]> = [
      [201, await setup().POST(req())],
      [400, await setup().POST(req("{"))],
      [403, await setup({ assertSameOrigin: forbid }).POST(req())],
      [409, await setup({ createOrder: failWith(pgErr("P0001", "MIXED_KINDS")) }).POST(req())],
      [410, await setup({ createOrder: failWith(pgErr("P0001", `PRODUCT_UNAVAILABLE:${GONE}`)) }).POST(req())],
      [429, await setup({ limitOrders: async () => rl.rateLimitedResponse(600, rl.ORDERS_RATE_LIMITED_MESSAGE) }).POST(req())],
      [429, await setup({ countActiveReservations: async () => 5 }).POST(req())],
      [500, await setup({ getSessionContext: failWith(new Error("boom")) }).POST(req())],
      [502, await setup({ createPayment: async () => ({ ok: false as const, kind: "provider_rejected" as const, message: "receipt" }) }).POST(req())],
    ];
    for (const [status, res] of cases) {
      assert.equal(res.status, status);
      assert.equal(res.headers.get("Cache-Control"), NO_STORE, String(status));
    }
  });
});

describe("POST /api/orders: повтор client_request_id чужим (утечка ссылки)", () => {
  afterEach(() => mock.restoreAll());
  const CONFLICT = { error: { code: "CONFLICT", message: "Повторите оформление заказа" } };
  const OWNER = "5d1e7a3c-8b2f-4c6d-9e0a-1f3b5c7d9e21";
  const asUser = (userId: string | null) => async () => ({ userId, role: userId ? "customer" : null, atelierId: null });

  it("повтор с тем же email (другой регистр, пробелы) → тот же заказ и тот же токен", async () => {
    const { stored, POST } = setup();
    const a = await json(await POST(req()));
    const b = await json(await POST(req({ ...BODY, customer: { ...BODY.customer, email: " ARTEM.Sokolov@yandex.ru " } })));
    assert.deepEqual(a, b);
    assert.equal(stored.size, 1);
    assert.equal((b.data as { order_url: string }).order_url, orderUrl());
  });

  it("чужой email → 409 CONFLICT без деталей, без ссылки и без платежа", async () => {
    const { calls, POST } = setup();
    await POST(req());
    const res = await POST(req({ ...BODY, customer: { ...BODY.customer, email: "attacker@example.com" } }));
    assert.equal(res.status, 409);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), CONFLICT);
    assert.doesNotMatch(text, /FC-26|orders\/|t=|artem/);
    assert.equal(calls.filter((c) => c.startsWith("pay:")).length, 1);
  });

  it("заказ привязан к user_id: гость или другой пользователь с тем же email → 409; тот же пользователь → 201", async () => {
    const { stored, POST } = setup({ getSessionContext: asUser(OWNER) });
    assert.equal((await POST(req())).status, 201);
    const params = [...stored.values()][0].params;
    const replay = (getSessionContext: CreateOrderDeps["getSessionContext"]) => setup({
      getSessionContext,
      createOrder: async () => ({ order_id: ORDER_ID, order_number: NUMBER, order_total: 13370000, order_kind: "stock" }),
      state: { customer_email: params.p_order.customer_email, user_id: params.p_order.user_id },
    }).POST(req());
    for (const who of [null, "6e2f8b4d-9c3a-4d7e-a01b-2a4c6d8e0f32"]) {
      const res = await replay(asUser(who));
      assert.equal(res.status, 409, String(who));
      assert.deepEqual(await json(res), CONFLICT);
    }
    assert.equal((await replay(asUser(OWNER))).status, 201);
  });

  it("гостевой заказ (user_id null) повторяет вошедший пользователь с тем же email → 201", async () => {
    const res = await setup({ getSessionContext: asUser(OWNER), state: { user_id: null } }).POST(req());
    assert.equal(res.status, 201);
  });

  it("OUT_OF_STOCK + чужой заказ с этим client_request_id → 409 CONFLICT, а не ссылка", async () => {
    const existing: CreatedOrder = { order_id: ORDER_ID, order_number: NUMBER, order_total: 13370000, order_kind: "stock" };
    const res = await setup({
      createOrder: failWith(pgErr("P0001", `OUT_OF_STOCK:${W}`)), findOrderByClientRequestId: async () => existing,
      state: { customer_email: "victim@example.com" },
    }).POST(req());
    assert.equal(res.status, 409);
    assert.deepEqual(await json(res), CONFLICT);
  });

  it("в логах нет client_request_id и ПДн: повтор после deadlock, отказ и исключение платёжки, 500", async () => {
    const log = mock.method(console, "error", () => {});
    let n = 0;
    const created: CreatedOrder = { order_id: ORDER_ID, order_number: NUMBER, order_total: 13370000, order_kind: "stock" };
    await setup({ createOrder: async () => { if (n++ === 0) throw pgErr("40P01", "deadlock detected"); return created; } }).POST(req());
    await setup({ createPayment: async () => ({ ok: false as const, kind: "provider_rejected" as const, message: "receipt.customer.email artem.sokolov@yandex.ru", yookassaCode: "invalid_request" }) }).POST(req());
    await setup({ createPayment: failWith(new Error("socket hang up")) }).POST(req());
    await setup({ createOrder: failWith(pgErr("40P01", "deadlock detected")) }).POST(req());
    assert.ok(log.mock.callCount() >= 4);
    const dump = log.mock.calls.map((c) => inspect(c.arguments, { depth: 10 })).join("\n");
    assert.doesNotMatch(dump, new RegExp(CRID));
    assert.doesNotMatch(dump, /artem|Соколов|\+?7\s?916|9165551234/i);
    const rejected = log.mock.calls.map((c) => c.arguments[0]).find((a) => (a as { kind?: string }).kind === "provider_rejected");
    assert.deepEqual(rejected, { scope: "orders.create.payment", orderId: ORDER_ID, kind: "provider_rejected", yookassaCode: "invalid_request" });
  });

  it("дедлайн платежа: deadlineMs 25 000 передаётся; исчерпан (ok:false) → 502 с order_url (Edge Case 2)", async () => {
    mock.method(console, "error", () => {});
    const seen: unknown[] = [];
    const res = await setup({
      createPayment: async (_id, opts) => { seen.push(opts); return { ok: false as const, kind: "provider_unavailable" as const, message: "deadline exceeded" }; },
    }).POST(req());
    assert.deepEqual(seen, [{ reuseWithinSeconds: 600, deadlineMs: 25_000 }]);
    assert.equal(res.status, 502);
    assert.deepEqual(((await json(res)).error as { details: unknown }).details, { order_url: orderUrl() });
  });
});
