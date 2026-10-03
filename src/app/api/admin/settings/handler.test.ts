import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { apiError } from "@/lib/api-error";
import { createSettingsHandlers, type SettingsDeps } from "@/app/api/admin/settings/handler";
import { ADMIN_OK } from "@/lib/admin/__fixtures__/fake-orders";
import { mockDb } from "@/lib/admin/__fixtures__/mock-db";
import { selectAppSettings, selectLatestRates, updateAppSettings, type AppSettingsRow } from "@/lib/admin/settings-db";
import type { SettingsPatchBody } from "@/lib/schemas/admin-settings";

// GET / PATCH /api/admin/settings с подменами + слой БД на мок-клиенте. JSON — дословно Блок 3.

const ROW: AppSettingsRow = { markup_multiplier: 2, price_rounding_rub: 100, auto_reprice: true, reprice_threshold: 2, updated_at: "2026-10-01T06:00:12+00:00" };

function setup(over: Partial<SettingsDeps> = {}) {
  const calls: string[] = [];
  const patches: SettingsPatchBody[] = [];
  const authOpts: unknown[] = [];
  let row = { ...ROW };
  const deps: SettingsDeps = {
    authorize: async (_r, opts) => { calls.push("auth"); authOpts.push(opts); return ADMIN_OK; },
    selectSettings: async () => { calls.push("select"); return row; },
    updateSettings: async (p) => { calls.push("update"); patches.push(p); row = { ...row, ...p, updated_at: "2026-10-01T10:00:00+00:00" }; return row; },
    selectLatestRates: async () => { calls.push("rates"); return { USD: { rate: 83.56, date: "2026-10-01" }, CNY: { rate: 11.72, date: "2026-10-01" } }; },
    ...over,
  };
  const h = createSettingsHandlers(deps);
  return {
    calls, patches, authOpts,
    get: () => h.GET(new Request("http://localhost:3000/api/admin/settings")),
    patch: (body: unknown) => h.PATCH(new Request("http://localhost:3000/api/admin/settings", {
      method: "PATCH", headers: { origin: "http://localhost:3000" }, body: typeof body === "string" ? body : JSON.stringify(body),
    })),
  };
}

describe("GET /api/admin/settings", () => {
  afterEach(() => mock.restoreAll());

  it("200 — пример Блока 3", async () => {
    const { calls, get } = setup();
    const res = await get();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await res.json(), {
      data: {
        markup_multiplier: 2.0, price_rounding_rub: 100, auto_reprice: true, reprice_threshold: 2.0,
        rates: { USD: { rate: 83.56, date: "2026-10-01" }, CNY: { rate: 11.72, date: "2026-10-01" } },
        updated_at: "2026-10-01T06:00:12.000Z",
      },
    });
    assert.deepEqual(calls.slice(0, 1), ["auth"]);
  });

  it("курса нет → rates без валюты", async () => {
    const res = await setup({ selectLatestRates: async () => ({}) }).get();
    assert.deepEqual(((await res.json()) as { data: { rates: unknown } }).data.rates, {});
  });

  it("403 — до чтения настроек", async () => {
    const { calls, get } = setup({ authorize: async () => ({ ok: false, response: apiError("FORBIDDEN", "Недостаточно прав", 403) }) });
    assert.equal((await get()).status, 403);
    assert.deepEqual(calls, []);
  });
});

describe("PATCH /api/admin/settings", () => {
  afterEach(() => mock.restoreAll());

  it("200 — пример Блока 3; только переданные поля; guard как мутация", async () => {
    const { patches, authOpts, patch } = setup();
    const res = await patch({ markup_multiplier: 2.5, auto_reprice: false });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      data: { markup_multiplier: 2.5, price_rounding_rub: 100, auto_reprice: false, reprice_threshold: 2.0, updated_at: "2026-10-01T10:00:00.000Z" },
    });
    assert.deepEqual(patches, [{ markup_multiplier: 2.5, auto_reprice: false }]);
    assert.deepEqual(authOpts, [{ mutation: true }]);
  });

  it("{} → без записи, текущие значения", async () => {
    const { calls, patch } = setup();
    assert.equal((await patch({})).status, 200);
    assert.ok(!calls.includes("update"));
  });

  for (const v of [0.99, 5.01, 2.005, "2"]) {
    it(`множитель ${JSON.stringify(v)} → 400 «Множитель от 1.00 до 5.00»`, async () => {
      const { calls, patch } = setup();
      const res = await patch({ markup_multiplier: v });
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: { code: string; message: string; details: { fields: Record<string, string[]> } } };
      assert.equal(body.error.code, "VALIDATION_ERROR");
      assert.equal(body.error.message, "Множитель от 1.00 до 5.00");
      assert.ok(body.error.details.fields.markup_multiplier);
      assert.ok(!calls.includes("update"));
    });
  }

  it("округление не из 1/10/100/1000, порог > 20, битый JSON → 400 «Проверьте поля формы»", async () => {
    for (const body of [{ price_rounding_rub: 50 }, { reprice_threshold: 21 }, "{"]) {
      const res = await setup().patch(body);
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { error: { message: string } }).error.message, "Проверьте поля формы");
    }
  });

  it("ошибка БД → 500", async () => {
    mock.method(console, "error", () => {});
    const res = await setup({ updateSettings: async () => { throw new Error("db"); } }).patch({ auto_reprice: true });
    assert.equal(res.status, 500);
  });
});

describe("settings-db на мок-клиенте", () => {
  it("app_settings id=1, явные колонки; numeric строкой тоже принимается; нет строки → ошибка", async () => {
    const { db, calls } = mockDb(() => ({ data: { ...ROW, markup_multiplier: "2.00", reprice_threshold: "2.50" } }));
    const row = await selectAppSettings(db);
    assert.equal(row.markup_multiplier, 2);
    assert.equal(row.reprice_threshold, 2.5);
    assert.deepEqual(calls[0].ops, [["select", "markup_multiplier,price_rounding_rub,auto_reprice,reprice_threshold,updated_at"], ["eq", "id", 1], ["maybeSingle"]]);
    await assert.rejects(selectAppSettings(mockDb(() => ({ data: null })).db));
  });

  it("update — where id = 1 и select тех же колонок", async () => {
    const { db, calls } = mockDb(() => ({ data: ROW }));
    await updateAppSettings(db, { auto_reprice: false });
    assert.deepEqual(calls[0].ops.slice(0, 2), [["update", { auto_reprice: false }], ["eq", "id", 1]]);
  });

  it("последний курс по каждой валюте: order rate_date desc limit 1", async () => {
    const { db, calls } = mockDb((_t, ops) => (ops.some((o) => o[0] === "eq" && o[2] === "USD")
      ? { data: { rate: 83.56, rate_date: "2026-10-01" } } : { data: null }));
    assert.deepEqual(await selectLatestRates(db), { USD: { rate: 83.56, date: "2026-10-01" } });
    assert.deepEqual(calls[0].ops, [
      ["select", "rate,rate_date"], ["eq", "currency", "USD"], ["order", "rate_date", { ascending: false }], ["limit", 1], ["maybeSingle"],
    ]);
  });
});
