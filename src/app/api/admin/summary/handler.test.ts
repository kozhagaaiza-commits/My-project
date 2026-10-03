import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { apiError } from "@/lib/api-error";
import { SUMMARY_QUEUE_LIMIT, createSummaryHandler, type SummaryDeps } from "@/app/api/admin/summary/handler";
import { ADMIN_OK } from "@/lib/admin/__fixtures__/fake-orders";
import { mockDb } from "@/lib/admin/__fixtures__/mock-db";
import { lowStock, moscowMonthRange, ratesDate, type SummaryRepo } from "@/lib/admin/summary";
import { createSummaryRepo } from "@/lib/admin/summary-db";

// GET /api/admin/summary: метрики Блока 3 + notifications_failed, разбор очереди уведомлений (BACKLOG День 5).

const NOW = new Date("2026-10-15T09:00:00Z");

function fakeRepo(over: Partial<SummaryRepo> = {}): SummaryRepo & { seen: Record<string, unknown> } {
  const seen: Record<string, unknown> = {};
  return {
    seen,
    countOrdersByStatus: async (s) => { seen.status = s; return 3; },
    countOrdersNeedingAttention: async () => 1,
    countPreordersInStatuses: async (s) => { seen.preorder = s; return 2; },
    countAteliersPending: async () => 1,
    listActiveStockProducts: async () => [
      { id: "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", title: "Кованый моноблок M-01 R20, 5×112, графит", stock_qty: 3 },
      { id: "p2", title: "Литой L-02", stock_qty: 10 },
    ],
    reservedQtyMap: async () => new Map([["8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", 2]]),
    listPaidTotals: async (from, to) => { seen.range = [from, to]; return [13370000, 13370000, 13370000, 13370000, 13370000, 6560000, 6410000]; },
    latestRates: async () => ({ USD: { rate: 83.56, date: "2026-10-01" }, CNY: { rate: 11.72, date: "2026-10-01" } }),
    countNotificationsFailedSince: async (since) => { seen.since = since; return 0; },
    ...over,
  };
}

function setup(over: Partial<SummaryDeps> = {}, repo = fakeRepo()) {
  const calls: string[] = [];
  const deps: SummaryDeps = {
    authorize: async () => { calls.push("auth"); return ADMIN_OK; },
    repo: () => { calls.push("repo"); return repo; },
    kickNotificationQueue: async () => { calls.push("kick"); },
    featureAtelier: true,
    now: () => NOW,
    ...over,
  };
  const GET = createSummaryHandler(deps);
  return { calls, repo, call: () => GET(new Request("http://localhost:3000/api/admin/summary")) };
}

const fmt = (s: string) => s.replace(/ | /g, " ");

describe("GET /api/admin/summary", () => {
  afterEach(() => mock.restoreAll());

  it("200 — пример Блока 3; разбор очереди запускается после auth", async () => {
    const { calls, repo, call } = setup();
    const res = await call();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(JSON.parse(fmt(await res.text())), {
      data: {
        orders_to_process: 3, orders_attention: 1, preorders_in_progress: 2, ateliers_pending: 1,
        low_stock: [{ product_id: "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", title: "Кованый моноблок M-01 R20, 5×112, графит", available_qty: 1 }],
        month: { paid_orders: 7, revenue: 79820000, revenue_formatted: "798 200 ₽", goal_orders: 15 },
        rates_date: "2026-10-01",
        notifications_failed: 0,
      },
    });
    assert.deepEqual(calls, ["auth", "kick", "repo"]);
    assert.equal(repo.seen.status, "paid");
    assert.deepEqual(repo.seen.preorder, ["ordered_from_supplier", "in_transit", "arrived"]);
    assert.deepEqual(repo.seen.range, ["2026-09-30T21:00:00.000Z", "2026-10-31T21:00:00.000Z"]);
    assert.equal(repo.seen.since, "2026-10-08T09:00:00.000Z");
    assert.equal(SUMMARY_QUEUE_LIMIT, 10);
  });

  it("FEATURE_ATELIER = false → ateliers_pending 0 без запроса", async () => {
    let asked = false;
    const res = await setup({ featureAtelier: false }, fakeRepo({ countAteliersPending: async () => { asked = true; return 5; } })).call();
    assert.equal(((await res.json()) as { data: { ateliers_pending: number } }).data.ateliers_pending, 0);
    assert.equal(asked, false);
  });

  it("401 / 403 — без очереди и БД", async () => {
    for (const r of [apiError("UNAUTHORIZED", "Войдите в аккаунт", 401), apiError("FORBIDDEN", "Недостаточно прав", 403)]) {
      const { calls, call } = setup({ authorize: async () => ({ ok: false, response: r }) });
      assert.equal((await call()).status, r.status);
      assert.deepEqual(calls, []);
    }
  });

  it("сбой запуска очереди не роняет сводку; сбой метрик — 500, очередь уже запущена", async () => {
    mock.method(console, "error", () => {});
    assert.equal((await setup({ kickNotificationQueue: async () => { throw new Error("after"); } }).call()).status, 200);
    const { calls, call } = setup({}, fakeRepo({ latestRates: async () => { throw new Error("db"); } }));
    const res = await call();
    assert.equal(res.status, 500);
    assert.ok(calls.includes("kick"));
  });
});

describe("сводка: чистые функции", () => {
  it("moscowMonthRange: границы месяца по Москве, декабрь → январь", () => {
    assert.deepEqual(moscowMonthRange(new Date("2026-09-30T21:30:00Z")), { from: "2026-09-30T21:00:00.000Z", to: "2026-10-31T21:00:00.000Z" });
    assert.deepEqual(moscowMonthRange(new Date("2026-12-31T22:00:00Z")), { from: "2026-12-31T21:00:00.000Z", to: "2027-01-31T21:00:00.000Z" });
  });

  it("lowStock: available = stock − брони, ≤ 1, по возрастанию", () => {
    assert.deepEqual(lowStock([
      { id: "a", title: "Б", stock_qty: 1 }, { id: "b", title: "А", stock_qty: 2 }, { id: "c", title: "В", stock_qty: 0 },
    ], new Map([["b", 5]])).map((p) => [p.product_id, p.available_qty]), [["b", 0], ["c", 0], ["a", 1]]);
  });

  it("ratesDate: самая старая из последних; нет курсов → null", () => {
    assert.equal(ratesDate({ USD: { rate: 1, date: "2026-10-01" }, CNY: { rate: 1, date: "2026-09-28" } }), "2026-09-28");
    assert.equal(ratesDate({}), null);
  });
});

describe("summary-db на мок-клиенте", () => {
  it("счётчики — head count=exact; месяц по paid_at; failed за окно", async () => {
    const { db, calls } = mockDb((t) => {
      if (t === "products") return { data: [{ id: "p", title: "T", stock_qty: 1 }] };
      if (t === "rpc:reserved_qty_map") return { data: [] };
      if (t === "exchange_rates") return { data: null };
      return { data: t === "orders" ? [{ total: 100 }] : null, count: 4 };
    });
    const repo = createSummaryRepo(db);
    assert.equal(await repo.countOrdersNeedingAttention(), 4);
    assert.deepEqual(calls.at(-1)?.ops, [["select", "id", { count: "exact", head: true }], ["eq", "needs_attention", true]]);
    await repo.countPreordersInStatuses(["in_transit"]);
    assert.deepEqual(calls.at(-1)?.ops.slice(1), [["eq", "kind", "preorder"], ["in", "status", ["in_transit"]]]);
    assert.deepEqual(await repo.listPaidTotals("A", "B"), [100]);
    assert.deepEqual(calls.at(-1)?.ops, [["select", "total"], ["gte", "paid_at", "A"], ["lt", "paid_at", "B"]]);
    await repo.countNotificationsFailedSince("S");
    assert.deepEqual(calls.at(-1)?.ops.slice(1), [["eq", "status", "failed"], ["gte", "updated_at", "S"]]);
    assert.deepEqual(await repo.listActiveStockProducts(), [{ id: "p", title: "T", stock_qty: 1 }]);
    assert.deepEqual(calls.at(-1)?.ops, [["select", "id,title,stock_qty"], ["eq", "status", "active"], ["eq", "availability_mode", "stock"]]);
  });

  it("ошибка счётчика → исключение", async () => {
    const repo = createSummaryRepo(mockDb(() => ({ error: { code: "42501", message: "denied" } })).db);
    await assert.rejects(repo.countOrdersByStatus("paid"));
  });
});
