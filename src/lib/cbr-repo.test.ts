import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createExchangeRatesRepo } from "@/lib/cbr-repo";

// Мок цепочки supabase-js: записывает вызовы, на await отдаёт заданный ответ.
type Call = [string, ...unknown[]];
function mockClient(reply: { data: unknown; error: { message: string; code?: string } | null }) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => resolve(reply),
  };
  for (const m of ["from", "upsert", "select", "eq", "in"]) {
    chain[m] = (...args: unknown[]) => { calls.push([m, ...args]); return chain; };
  }
  return { calls, client: chain as unknown as SupabaseClient };
}

describe("createExchangeRatesRepo (запросы PostgREST)", () => {
  it("insertMissing: upsert ignoreDuplicates по (currency, rate_date), возвращает вставленные валюты", async () => {
    const { calls, client } = mockClient({ data: [{ currency: "CNY" }], error: null });
    const rows = [
      { currency: "USD" as const, rate: "83.5600", rate_date: "2026-10-01" },
      { currency: "CNY" as const, rate: "11.7200", rate_date: "2026-10-01" },
    ];
    const inserted = await createExchangeRatesRepo(client).insertMissing(rows);
    assert.deepEqual(inserted, ["CNY"]);
    assert.deepEqual(calls, [
      ["from", "exchange_rates"],
      ["upsert", rows, { onConflict: "currency,rate_date", ignoreDuplicates: true }],
      ["select", "currency"],
    ]);
  });

  it("insertMissing: пустой ответ (всё уже есть) → []", async () => {
    const { client } = mockClient({ data: [], error: null });
    assert.deepEqual(await createExchangeRatesRepo(client).insertMissing([]), []);
  });

  it("insertMissing: ошибка БД → исключение со scope и кодом", async () => {
    const { client } = mockClient({ data: null, error: { message: "boom", code: "42501" } });
    await assert.rejects(createExchangeRatesRepo(client).insertMissing([]), /exchange_rates\.insertMissing: 42501 boom/);
  });

  it("getRates: фильтры по дате и валютам, numeric как число или строка", async () => {
    const { calls, client } = mockClient({ data: [{ currency: "USD", rate: 83.56 }, { currency: "CNY", rate: "11.7200" }], error: null });
    const r = await createExchangeRatesRepo(client).getRates("2026-10-01", ["USD", "CNY"]);
    assert.deepEqual(r, { USD: 83.56, CNY: 11.72 });
    assert.deepEqual(calls, [
      ["from", "exchange_rates"],
      ["select", "currency,rate"],
      ["eq", "rate_date", "2026-10-01"],
      ["in", "currency", ["USD", "CNY"]],
    ]);
  });

  it("getRates: чужая валюта в ответе отклоняется Zod", async () => {
    const { client } = mockClient({ data: [{ currency: "EUR", rate: 97 }], error: null });
    await assert.rejects(createExchangeRatesRepo(client).getRates("2026-10-01", ["USD"]));
  });
});
