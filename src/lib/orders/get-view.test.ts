import assert from "node:assert/strict";
import { afterEach, before, describe, it, mock } from "node:test";
import type { GetOrderViewDeps, GetOrderViewInput } from "@/lib/orders/get-view";
import type { OrderAccessRow } from "@/lib/orders/db";
import type { OrderViewData } from "@/lib/orders/view";
import { applyTestEnv } from "@/test/env";

// getOrderViewWith: доступ (токен / владелец / admin, единый not_found), ленивая отмена до чтения, сверка
// только для pending_payment / cancelled, сбои отмены и сверки не роняют, бюджет сверки.

let mod: typeof import("@/lib/orders/get-view");
let tk: typeof import("@/lib/orders/token");
before(async () => {
  applyTestEnv();
  mod = await import("@/lib/orders/get-view");
  tk = await import("@/lib/orders/token");
});

const NUMBER = "FC-26-000123";
const ORDER_ID = "4b9e2c7a-1d3f-4a6e-8c05-7e2b9d1f3a68";
const OWNER = "5d1e7a3c-8b2f-4c6d-9e0a-1f3b5c7d9e21";
const OTHER = "6e2f8b4d-9c3a-4d7e-8f1b-2a4c6e8d0f32";
const TOKEN = "Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU";
const WRONG = "Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeV";
const NOW = new Date("2026-10-01T12:40:00.000Z");
const GUEST = { userId: null, role: null };

const accessRow = (over: Partial<OrderAccessRow> = {}): OrderAccessRow => ({
  id: ORDER_ID, number: NUMBER, status: "paid", kind: "stock", user_id: OWNER,
  public_token_hash: tk.hashOrderToken(TOKEN), reserved_until: "2026-10-01T13:00:00+00:00", total: 13370000, ...over,
});

const viewData = (status: OrderAccessRow["status"] = "paid"): OrderViewData => ({
  order: {
    id: ORDER_ID, number: NUMBER, kind: "stock", status, delivery_method: "cdek_pvz", delivery_city: "Казань",
    delivery_address: null, cdek_pvz_code: "KZN45", total: 13370000, reserved_until: "2026-10-01T13:00:00+00:00",
    paid_at: status === "pending_payment" ? null : "2026-10-01T12:34:10+00:00", expected_ready_at: null, shipped_at: null,
    delivered_at: null, cancel_reason: null, tracking_number: null, courier_note: null, customer_visible_note: null,
    telegram_subscribed: false, customer_name: "Артём Соколов", customer_email: "artem.sokolov@yandex.ru", customer_phone: "+79165551234",
  },
  items: [{ title: "M-01", quantity: 1, unit_price: 13370000, line_total: 13370000, product_slug: "m-01" }],
  history: [],
  refunded_amount: 0,
  last_payment: null,
});

function setup(over: Partial<GetOrderViewDeps> & { row?: OrderAccessRow | null; data?: OrderViewData | null } = {}) {
  const calls: string[] = [];
  const row = over.row === undefined ? accessRow() : over.row;
  const data = over.data === undefined ? viewData(row?.status) : over.data;
  const background: Promise<unknown>[] = [];
  const deps: GetOrderViewDeps = {
    selectOrderForAccess: async (n) => {
      calls.push(`access:${n}`);
      return (over.selectOrderForAccess ?? (async (x: string) => (row && row.number === x ? row : null)))(n);
    },
    cancelExpiredOrders: async () => { calls.push("cancelExpired"); return (over.cancelExpiredOrders ?? (async () => 0))(); },
    reconcileOrderPayments: async (id) => { calls.push(`reconcile:${id}`); return (over.reconcileOrderPayments ?? (async () => ({})))(id); },
    loadOrderViewData: async (id) => { calls.push(`load:${id}`); return (over.loadOrderViewData ?? (async () => data))(id); },
    telegramBotUsername: "forgecarbon_bot",
    now: () => NOW,
    reconcileBudgetMs: over.reconcileBudgetMs,
    continueAfterResponse: (t) => { calls.push("after"); background.push(t); },
  };
  return { calls, background, run: (input: Partial<GetOrderViewInput> = {}) => mod.getOrderViewWith(deps, { number: NUMBER, token: TOKEN, ctx: GUEST, ...input }) };
}

describe("getOrderView: доступ", () => {
  afterEach(() => mock.restoreAll());

  it("по токену: ok, telegram_link с токеном; порядок access → cancelExpired → load", async () => {
    const { calls, run } = setup();
    const r = await run();
    assert.equal(r.kind, "ok");
    assert.equal(r.kind === "ok" && r.view.telegram_link, `https://t.me/forgecarbon_bot?start=o_${TOKEN}`);
    assert.deepEqual(calls, [`access:${NUMBER}`, "cancelExpired", `load:${ORDER_ID}`]);
  });

  it("владелец без токена: ok, telegram_link null", async () => {
    const r = await setup().run({ token: null, ctx: { userId: OWNER, role: "customer" } });
    assert.equal(r.kind === "ok" && r.view.telegram_link, null);
  });

  it("владелец с неверным (но валидным по формату) токеном: ok как владелец, без ссылки с токеном", async () => {
    const r = await setup().run({ token: WRONG, ctx: { userId: OWNER, role: "customer" } });
    assert.equal(r.kind, "ok");
    assert.equal(r.kind === "ok" && r.view.telegram_link, null);
  });

  it("admin без токена: ok, telegram_link null", async () => {
    const r = await setup().run({ token: null, ctx: { userId: OTHER, role: "admin" } });
    assert.equal(r.kind === "ok" && r.view.telegram_link, null);
  });

  it("неверный токен = нет заказа: одинаковый not_found, данные и отмена не трогаются", async () => {
    const wrong = setup();
    assert.deepEqual(await wrong.run({ token: WRONG }), { kind: "not_found" });
    assert.deepEqual(wrong.calls, [`access:${NUMBER}`]);
    const missing = setup({ row: null });
    assert.deepEqual(await missing.run(), { kind: "not_found" });
    assert.deepEqual(missing.calls, [`access:${NUMBER}`]);
  });

  it("чужой пользователь без токена и без роли admin → not_found", async () => {
    assert.deepEqual(await setup().run({ token: null, ctx: { userId: OTHER, role: "customer" } }), { kind: "not_found" });
  });

  it("битый формат токена или номера → not_found без запросов к БД", async () => {
    const a = setup();
    assert.deepEqual(await a.run({ token: "short" }), { kind: "not_found" });
    assert.deepEqual(await a.run({ token: "" }), { kind: "not_found" });
    assert.deepEqual(await a.run({ number: "FC-26-12" }), { kind: "not_found" });
    assert.deepEqual(a.calls, []);
  });

  it("данные пропали после проверки доступа → not_found", async () => {
    assert.deepEqual(await setup({ data: null }).run(), { kind: "not_found" });
  });
});

describe("getOrderView: ленивая отмена и сверка", () => {
  afterEach(() => mock.restoreAll());

  for (const status of ["pending_payment", "cancelled"] as const) {
    it(`${status}: сверка между отменой и чтением данных`, async () => {
      const { calls, run } = setup({ row: accessRow({ status }) });
      assert.equal((await run()).kind, "ok");
      assert.deepEqual(calls, [`access:${NUMBER}`, "cancelExpired", `reconcile:${ORDER_ID}`, `load:${ORDER_ID}`]);
    });
  }

  for (const status of ["paid", "confirmed", "shipped", "delivered", "refunded"] as const) {
    it(`${status}: без сверки`, async () => {
      const { calls, run } = setup({ row: accessRow({ status }) });
      await run();
      assert.ok(!calls.some((c) => c.startsWith("reconcile")));
    });
  }

  it("сверка перевела заказ в paid — ответ по данным, прочитанным ПОСЛЕ неё", async () => {
    let paid = false;
    const { run } = setup({
      row: accessRow({ status: "pending_payment" }),
      reconcileOrderPayments: async () => { paid = true; return { paid: 1 }; },
      loadOrderViewData: async () => viewData(paid ? "paid" : "pending_payment"),
    });
    const r = await run();
    assert.equal(r.kind === "ok" && r.view.status, "paid");
  });

  it("сбой cancel_expired_orders логируется и не роняет", async () => {
    const err = mock.method(console, "error", () => {});
    const { calls, run } = setup({ cancelExpiredOrders: async () => { throw new Error("db down"); } });
    assert.equal((await run()).kind, "ok");
    assert.ok(calls.includes(`load:${ORDER_ID}`));
    assert.equal((err.mock.calls[0].arguments[0] as { scope: string }).scope, "orders.view.cancelExpired");
  });

  it("сверка бросила (вопреки контракту) — лог, ответ есть", async () => {
    const err = mock.method(console, "error", () => {});
    const { run } = setup({ row: accessRow({ status: "pending_payment" }), reconcileOrderPayments: async () => { throw new Error("yookassa"); } });
    assert.equal((await run()).kind, "ok");
    assert.equal((err.mock.calls[0].arguments[0] as { scope: string }).scope, "orders.view.reconcile");
  });

  it("сверка не уложилась в бюджет — ответ без ожидания, остаток в after()", async () => {
    mock.method(console, "error", () => {});
    let release!: () => void;
    const slow = new Promise<void>((r) => { release = r; });
    const { calls, background, run } = setup({
      row: accessRow({ status: "pending_payment" }), reconcileBudgetMs: 20, reconcileOrderPayments: () => slow,
    });
    const r = await run();
    assert.equal(r.kind, "ok");
    assert.deepEqual(calls, [`access:${NUMBER}`, "cancelExpired", `reconcile:${ORDER_ID}`, "after", `load:${ORDER_ID}`]);
    release();
    await Promise.all(background);
  });

  it("ошибка чтения данных пробрасывается (→ 500 в обработчике)", async () => {
    await assert.rejects(setup({ loadOrderViewData: async () => { throw new Error("pg"); } }).run(), /pg/);
  });
});
