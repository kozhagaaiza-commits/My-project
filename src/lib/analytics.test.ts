import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  METRIKA_GOALS, METRIKA_INIT_OPTIONS, ensureYmQueue, initMetrika, isMetrikaPath, metrikaCounterId, reachGoal, trackHit,
} from "@/lib/analytics";

// Яндекс Метрика: no-op без счётчика, ручной хит без query, init с defer и без вебвизора.

type Call = unknown[];
const g = globalThis as unknown as { window?: { ym?: unknown } };
const ENV = "NEXT_PUBLIC_YM_COUNTER_ID";
let saved: string | undefined;

beforeEach(() => { saved = process.env[ENV]; g.window = {}; });
afterEach(() => {
  if (saved === undefined) delete process.env[ENV]; else process.env[ENV] = saved;
  delete g.window;
});

describe("analytics", () => {
  it("7 целей Блока 5.8", () => {
    assert.deepEqual([...METRIKA_GOALS], [
      "fitment_selected", "product_view", "add_to_cart", "checkout_started", "payment_succeeded", "telegram_subscribed", "atelier_applied",
    ]);
  });

  it("metrikaCounterId: пусто, нецифры, ноль → null", () => {
    assert.equal(metrikaCounterId(""), null);
    assert.equal(metrikaCounterId(undefined), null);
    assert.equal(metrikaCounterId("12ab"), null);
    assert.equal(metrikaCounterId("0"), null);
    assert.equal(metrikaCounterId("98765432"), 98765432);
  });

  it("reachGoal: no-op, если счётчик пуст или ym не загружен; иначе ym(id, 'reachGoal', цель)", () => {
    const calls: Call[] = [];
    g.window = { ym: (...a: unknown[]) => { calls.push(a); } };
    delete process.env[ENV];
    reachGoal("add_to_cart");
    assert.equal(calls.length, 0);
    process.env[ENV] = "123";
    g.window = {};
    assert.doesNotThrow(() => reachGoal("add_to_cart"));
    g.window = { ym: (...a: unknown[]) => { calls.push(a); } };
    reachGoal("add_to_cart");
    assert.deepEqual(calls, [[123, "reachGoal", "add_to_cart"]]);
  });

  it("reachGoal не бросает, если ym падает", () => {
    process.env[ENV] = "123";
    g.window = { ym: () => { throw new Error("blocked"); } };
    assert.doesNotThrow(() => reachGoal("product_view"));
  });

  it("trackHit: только pathname, query и hash отрезаются (токен ?t= не уходит в Метрику)", () => {
    const calls: Call[] = [];
    g.window = { ym: (...a: unknown[]) => { calls.push(a); } };
    trackHit("/orders/FC-26-000123?t=SECRET#x", 123);
    trackHit("/wheels", 123);
    assert.deepEqual(calls, [[123, "hit", "/orders/FC-26-000123"], [123, "hit", "/wheels"]]);
    trackHit("/wheels", null);
    assert.equal(calls.length, 2);
  });

  it("init: defer: true, вебвизор выключен; вызовы до загрузки tag.js встают в очередь по порядку", () => {
    assert.equal(METRIKA_INIT_OPTIONS.defer, true);
    assert.equal(METRIKA_INIT_OPTIONS.webvisor, false);
    ensureYmQueue();
    initMetrika(123);
    trackHit("/", 123);
    const ym = g.window?.ym as { a: Call[] };
    assert.equal(ym.a.length, 2);
    assert.deepEqual(ym.a[0].slice(0, 2), [123, "init"]);
    assert.deepEqual(ym.a[1], [123, "hit", "/"]);
  });

  it("isMetrikaPath: /admin и вложенные — нет", () => {
    assert.equal(isMetrikaPath("/admin"), false);
    assert.equal(isMetrikaPath("/admin/orders/1"), false);
    assert.equal(isMetrikaPath("/administrator"), true);
    assert.equal(isMetrikaPath("/"), true);
  });
});
