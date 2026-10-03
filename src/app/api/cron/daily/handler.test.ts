import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { RefreshResult } from "@/lib/cbr";
import { CRON_DEADLINE_MS, CRON_QUEUE_TAIL_MS, DEADLINE_SKIP_TEXT, createCronHandler, staleRatesText, type CronDeps } from "./handler";

// GET /api/cron/daily (Блок 3; 5.12): авторизация Bearer, шесть независимых шагов, итог — JSON Блока 3.

const SECRET = "s3cr3t-s3cr3t-s3cr3t-s3cr3t-s3cr3t-12";
const NOW = new Date("2026-10-03T06:00:00.000Z");
const RATES: RefreshResult = {
  USD: { rate: 83.56, date: "2026-10-03", inserted: true },
  CNY: { rate: 11.72, date: "2026-10-03", inserted: true },
};

function setup(over: Partial<CronDeps> = {}) {
  const calls: string[] = [];
  const alerts: string[] = [];
  const deps: CronDeps = {
    secret: SECRET,
    refreshRates: async () => { calls.push("rates"); return RATES; },
    repriceProducts: async () => { calls.push("reprice"); return { enabled: true, currencies: ["USD"], repriced_products: 18, skipped_products: 0 }; },
    cancelExpiredOrders: async () => { calls.push("cancel"); return 2; },
    reconcilePayments: async () => { calls.push("payments"); return { checked: 3, paid: 1, failed: 0 }; },
    processQueue: async (budgetMs) => { calls.push(`queue:${budgetMs}`); return { sent: 1, failed: 0, retried: 0, remaining: 0 }; },
    cleanupRateLimits: async (olderThan) => { calls.push(`cleanup:${olderThan.toISOString()}`); return 412; },
    latestRateDate: async () => { calls.push("latest"); return "2026-10-03"; },
    alertAdmin: async (text) => { alerts.push(text); return true; },
    now: () => NOW,
    ...over,
  };
  const GET = createCronHandler(async () => deps);
  const call = (headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) =>
    GET(new Request("http://localhost:3000/api/cron/daily", { headers }));
  return { calls, alerts, call };
}

const json = async (res: Response) => (await res.json()) as { data?: Record<string, unknown>; error?: { code: string; message: string; details?: Record<string, unknown> } };

describe("GET /api/cron/daily", () => {
  afterEach(() => mock.restoreAll());

  it("401 без заголовка, с чужим секретом, без «Bearer»; шаги не запускаются", async () => {
    const { calls, call } = setup();
    for (const headers of [{} as Record<string, string>, { authorization: "Bearer wrong" }, { authorization: SECRET }, { authorization: `bearer ${SECRET}` }]) {
      const res = await call(headers);
      assert.equal(res.status, 401);
      assert.deepEqual(await json(res), { error: { code: "UNAUTHORIZED", message: "Неверный CRON_SECRET" } });
    }
    assert.deepEqual(calls, []);
  });

  it("секрет не задан → 401 даже при пустом/«Bearer null»", async () => {
    const { call } = setup({ secret: null });
    assert.equal((await call({ authorization: "Bearer null" })).status, 401);
    const empty = setup({ secret: "" });
    assert.equal((await empty.call({ authorization: "Bearer " })).status, 401);
  });

  it("не требует Origin и сессии: 200 с итогом Блока 3", async () => {
    const { calls, call } = setup();
    const res = await call();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    mock.method(console, "info", () => {});
    assert.deepEqual((await json(res)).data, {
      rates: RATES, repriced_products: 18, cancelled_orders: 2, payments: { checked: 3, paid: 1, failed: 0 },
      notifications: { sent: 1, failed: 0, remaining: 0 }, rate_limit_rows_deleted: 412,
    });
    // Шаг 6 (алерт и уборка) — до сверки и очереди; очередь получает весь остаток времени минус запас.
    assert.deepEqual(calls.map((c) => c.split(":")[0]), ["rates", "reprice", "cancel", "latest", "cleanup", "payments", "queue"]);
    assert.ok(calls.includes(`queue:${CRON_DEADLINE_MS - CRON_QUEUE_TAIL_MS}`));
    assert.ok(calls.includes("cleanup:2026-10-02T06:00:00.000Z"), "rate_limit_hits старше 1 суток");
  });

  it("шаг 1 упал → 500 как в Блоке 3, пересчёт цен пропущен, остальные шаги выполнены", async () => {
    mock.method(console, "error", () => {});
    const { calls, call } = setup({ refreshRates: async () => { throw new Error("CBR timeout after 10000 ms"); } });
    const res = await call();
    assert.equal(res.status, 500);
    const { error } = await json(res);
    assert.equal(error?.code, "INTERNAL_ERROR");
    assert.equal(error?.message, "Часть задач не выполнена");
    assert.deepEqual(error?.details?.failed_steps, ["rates"]);
    assert.match(String(error?.details?.rates_error), /CBR timeout after 10000 ms/);
    assert.ok(!calls.includes("reprice"));
    for (const step of ["cancel", "payments", "queue", "latest"]) assert.ok(calls.some((c) => c.split(":")[0] === step), step);
  });

  it("ошибки каждого шага независимы; failed_steps перечисляет все упавшие", async () => {
    mock.method(console, "error", () => {});
    const boom = (m: string) => async () => { throw new Error(m); };
    const { calls, call } = setup({
      repriceProducts: boom("reprice"), cancelExpiredOrders: boom("cancel"), reconcilePayments: boom("pay"),
      processQueue: boom("queue"), cleanupRateLimits: boom("cleanup"),
    });
    const res = await call();
    const { error } = await json(res);
    assert.deepEqual(error?.details?.failed_steps, ["reprice", "cancel", "payments", "queue", "cleanup"]);
    assert.ok(calls.includes("latest"), "алерт по курсу проверяется, даже если уборка упала");
    assert.equal((error?.details?.result as { rates: unknown }).rates !== null, true);
  });

  it("очередь вернула error (БД недоступна) → шаг queue считается упавшим", async () => {
    mock.method(console, "error", () => {});
    const { call } = setup({ processQueue: async () => ({ sent: 0, failed: 0, retried: 0, remaining: 0, error: "db down" }) });
    const { error } = await json(await call());
    assert.deepEqual(error?.details?.failed_steps, ["queue"]);
  });

  it("курс старше 3 дней → Telegram админу «Курс ЦБ не обновлялся с 28.09.2026»; свежий — без сообщения", async () => {
    const stale = setup({ latestRateDate: async () => "2026-09-28" });
    assert.equal((await stale.call()).status, 200);
    assert.deepEqual(stale.alerts, ["Курс ЦБ не обновлялся с 28.09.2026"]);
    mock.method(console, "info", () => {});
    const fresh = setup();
    await fresh.call();
    assert.deepEqual(fresh.alerts, []);
  });

  it("алерт не доставлен → шаг cleanup упал, ответ 500; статус и тексты", async () => {
    mock.method(console, "error", () => {});
    const { call } = setup({ latestRateDate: async () => "2026-09-20", alertAdmin: async () => false });
    const { error } = await json(await call());
    assert.deepEqual(error?.details?.failed_steps, ["cleanup"]);
  });

  it("сбой ЦБ: алерт «курс устарел» уходит до сверки платежей и очереди (не теряется, если они съели время)", async () => {
    mock.method(console, "error", () => {});
    const order: string[] = [];
    const { call } = setup({
      refreshRates: async () => { throw new Error("CBR 503"); },
      latestRateDate: async () => "2026-09-28",
      alertAdmin: async (text) => { order.push(`alert:${text}`); return true; },
      reconcilePayments: async () => { order.push("payments"); throw new Error("hang"); },
      processQueue: async () => { order.push("queue"); return { sent: 0, failed: 0, retried: 0, remaining: 0 }; },
    });
    const { error } = await json(await call());
    assert.deepEqual(order, ["alert:Курс ЦБ не обновлялся с 28.09.2026", "payments", "queue"]);
    assert.deepEqual(error?.details?.failed_steps, ["rates", "payments"]);
  });

  it("общий дедлайн: курс ЦБ занял 30 с, сверка 18 с → очередь получает остаток 2 с − запас < минимума → пропущена", async () => {
    mock.method(console, "error", () => {});
    let t = NOW.getTime();
    const { calls, call } = setup({
      now: () => new Date(t),
      refreshRates: async () => { calls.push("rates"); t += 30_000; return RATES; },
      reconcilePayments: async () => { calls.push("payments"); t += 18_000; return { checked: 9, paid: 0, failed: 0 }; },
    });
    const { error } = await json(await call());
    assert.ok(!calls.some((c) => c.startsWith("queue")), "очередь не запускается");
    assert.deepEqual(error?.details?.failed_steps, ["queue"]);
    assert.equal(error?.details?.queue_error, DEADLINE_SKIP_TEXT);
    assert.ok(calls.includes("latest"), "алерт и уборка выполнены");
  });

  it("общий дедлайн: остаток 20 с → бюджет очереди 15 с; дедлайн пройден до сверки → сверка и очередь пропущены", async () => {
    mock.method(console, "error", () => {});
    let t = NOW.getTime();
    const a = setup({ now: () => new Date(t), refreshRates: async () => { t += CRON_DEADLINE_MS - 20_000; return RATES; } });
    mock.method(console, "info", () => {});
    await a.call();
    assert.ok(a.calls.includes(`queue:${20_000 - CRON_QUEUE_TAIL_MS}`), a.calls.join(","));

    let u = NOW.getTime();
    const b = setup({ now: () => new Date(u), cancelExpiredOrders: async () => { u += CRON_DEADLINE_MS + 1; return 0; } });
    const { error } = await json(await b.call());
    assert.deepEqual(error?.details?.failed_steps, ["payments", "queue"]);
    assert.ok(!b.calls.some((c) => c === "payments" || c.startsWith("queue")));
    assert.ok(b.calls.includes("latest"), "алерт не зависит от дедлайна");
  });

  it("ошибка сборки зависимостей (env) → 500 без деталей", async () => {
    mock.method(console, "error", () => {});
    const GET = createCronHandler(async () => { throw new Error("env"); });
    const res = await GET(new Request("http://localhost:3000/api/cron/daily", { headers: { authorization: `Bearer ${SECRET}` } }));
    assert.equal(res.status, 500);
    assert.equal((await json(res)).error?.details, undefined);
  });
});

describe("staleRatesText", () => {
  it("граница: 3 дня — ещё нет, 4 — да; курс из будущего (ЦБ на следующий рабочий день) — нет; курсов нет", () => {
    assert.equal(staleRatesText("2026-09-30", NOW), null);
    assert.equal(staleRatesText("2026-09-29", NOW), "Курс ЦБ не обновлялся с 29.09.2026");
    assert.equal(staleRatesText("2026-10-06", NOW), null);
    assert.equal(staleRatesText(null, NOW), "Курс ЦБ не загружен");
  });
});
