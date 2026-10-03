import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { CBR_UNAVAILABLE_MESSAGE, createRefreshRatesHandler, type RefreshRatesDeps } from "@/app/api/admin/exchange-rates/refresh/handler";
import { apiError } from "@/lib/api-error";
import { CbrError, fetchCbrRates, refreshRates, type Currency, type ExchangeRateInsert, type ExchangeRatesRepo, type RefreshResult } from "@/lib/cbr";
import { FakeCbr, cbrXml } from "@/lib/__fixtures__/fake-cbr";

const ORIGIN = "http://localhost:3000";
const req = () => new Request("http://localhost:3000/api/admin/exchange-rates/refresh", {
  method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: "{}",
});
const SAMPLE: RefreshResult = {
  USD: { rate: 83.56, date: "2026-10-01", inserted: false },
  CNY: { rate: 11.72, date: "2026-10-01", inserted: false },
};

function setup(over: Partial<RefreshRatesDeps> = {}) {
  const calls: string[] = [];
  const deps: RefreshRatesDeps = {
    requireAdmin: async (r) => { calls.push("admin"); return (over.requireAdmin ?? (async () => null))(r); },
    refresh: async () => { calls.push("refresh"); return (over.refresh ?? (async () => SAMPLE))(); },
  };
  return { calls, POST: createRefreshRatesHandler(deps) };
}

describe("POST /api/admin/exchange-rates/refresh", () => {
  afterEach(() => mock.restoreAll());

  it("200: { data: { USD, CNY } } как в Блоке 3, Cache-Control private, no-store", async () => {
    const { POST, calls } = setup();
    const res = await POST(req());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await res.json(), { data: SAMPLE });
    assert.deepEqual(calls, ["admin", "refresh"]);
  });

  it("401 / 403 от проверки админа: загрузка курса не запускается", async () => {
    for (const denied of [apiError("UNAUTHORIZED", "Войдите в аккаунт", 401), apiError("FORBIDDEN", "Недостаточно прав", 403)]) {
      const { POST, calls } = setup({ requireAdmin: async () => denied });
      const res = await POST(req());
      assert.equal(res.status, denied.status);
      assert.equal(res.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(calls, ["admin"]);
    }
  });

  it("502 PAYMENT_PROVIDER_ERROR с текстом Блока 3 при любом отказе ЦБ", async () => {
    mock.method(console, "error", () => {});
    for (const kind of ["timeout", "network", "http", "parse"] as const) {
      const { POST } = setup({ refresh: async () => { throw new CbrError(kind, `CBR ${kind}`); } });
      const res = await POST(req());
      assert.equal(res.status, 502, kind);
      assert.deepEqual(await res.json(), {
        error: { code: "PAYMENT_PROVIDER_ERROR", message: "Сайт ЦБ не ответил за 10 секунд. Повторите позже" },
      });
    }
    assert.equal(CBR_UNAVAILABLE_MESSAGE, "Сайт ЦБ не ответил за 10 секунд. Повторите позже");
  });

  it("500 INTERNAL_ERROR при сбое БД; стек клиенту не уходит", async () => {
    const errors = mock.method(console, "error", () => {});
    const { POST } = setup({ refresh: async () => { throw new Error("exchange_rates.insertMissing: 42501 denied"); } });
    const res = await POST(req());
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error.code, "INTERNAL_ERROR");
    assert.ok(!JSON.stringify(body).includes("42501"));
    assert.equal(errors.mock.callCount(), 1);
  });
});

describe("POST /api/admin/exchange-rates/refresh: сквозной сценарий на fake-сервере ЦБ", () => {
  class MemoryRepo implements ExchangeRatesRepo {
    rows: Array<ExchangeRateInsert> = [];
    async insertMissing(rows: ExchangeRateInsert[]): Promise<Currency[]> {
      const added: Currency[] = [];
      for (const r of rows) {
        if (this.rows.some((x) => x.currency === r.currency && x.rate_date === r.rate_date)) continue;
        this.rows.push(r);
        added.push(r.currency);
      }
      return added;
    }
    async getRates(date: string, currencies: Currency[]) {
      const out: Partial<Record<Currency, number>> = {};
      for (const r of this.rows) if (r.rate_date === date && currencies.includes(r.currency)) out[r.currency] = Number(r.rate);
      return out;
    }
  }
  let cbr: FakeCbr;
  const NOW = new Date("2026-10-01T12:00:00Z");
  beforeEach(async () => { cbr = await new FakeCbr(() => cbrXml({ cny: { nominal: 10, value: "117,2000" } })).start(); });
  afterEach(async () => { await cbr.stop(); mock.restoreAll(); });

  const build = (repo: MemoryRepo, timeoutMs = 10_000) => createRefreshRatesHandler({
    requireAdmin: async () => null,
    refresh: () => refreshRates({
      repo, fetchRates: () => fetchCbrRates({ url: cbr.url, timeoutMs, now: () => NOW, sleep: async () => {} }),
    }),
  });

  it("первый запрос inserted:true, второй inserted:false; CNY с Nominal 10 → 11.72", async () => {
    const repo = new MemoryRepo();
    const POST = build(repo);
    const first = await (await POST(req())).json();
    assert.deepEqual(first, { data: {
      USD: { rate: 83.56, date: "2026-10-01", inserted: true },
      CNY: { rate: 11.72, date: "2026-10-01", inserted: true },
    } });
    const second = await (await POST(req())).json();
    assert.equal(second.data.USD.inserted, false);
    assert.equal(second.data.CNY.inserted, false);
    assert.equal(repo.rows.length, 2);
  });

  it("ЦБ молчит → 502, в БД ничего не записано", async () => {
    mock.method(console, "error", () => {});
    cbr.script("hang", "hang", "hang");
    const repo = new MemoryRepo();
    const res = await build(repo, 50)(req());
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.code, "PAYMENT_PROVIDER_ERROR");
    assert.equal(repo.rows.length, 0);
  });
});
