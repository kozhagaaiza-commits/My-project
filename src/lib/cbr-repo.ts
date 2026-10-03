import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CURRENCIES, type Currency, type ExchangeRateInsert, type ExchangeRatesRepo } from "@/lib/cbr";

// Реализация ExchangeRatesRepo на service-role клиенте (Чертёж 2.12: INSERT в exchange_rates — только сервер).
// Клиент передаёт вызывающий код (route.ts / cron), модуль env не читает.

const currencyEnum = z.enum(CURRENCIES);
const insertedRow = z.object({ currency: currencyEnum });
// numeric(12,4) PostgREST отдаёт JSON-числом (83.56); строку тоже принимаем.
const rateRow = z.object({ currency: currencyEnum, rate: z.union([z.number(), z.string()]).pipe(z.coerce.number()) });

function check(res: { error: { message: string; code?: string } | null }, scope: string) {
  if (res.error) throw new Error(`${scope}: ${res.error.code ?? ""} ${res.error.message}`);
}

export function createExchangeRatesRepo(c: SupabaseClient): ExchangeRatesRepo {
  return {
    async insertMissing(rows: ExchangeRateInsert[]): Promise<Currency[]> {
      // Prefer: resolution=ignore-duplicates → on conflict (currency, rate_date) do nothing; .select() вернёт только вставленные.
      const res = await c.from("exchange_rates")
        .upsert(rows, { onConflict: "currency,rate_date", ignoreDuplicates: true })
        .select("currency");
      check(res, "exchange_rates.insertMissing");
      return insertedRow.array().parse(res.data ?? []).map((r) => r.currency);
    },
    async getRates(date: string, currencies: Currency[]) {
      const res = await c.from("exchange_rates").select("currency,rate").eq("rate_date", date).in("currency", currencies);
      check(res, "exchange_rates.getRates");
      const out: Partial<Record<Currency, number>> = {};
      for (const r of rateRow.array().parse(res.data ?? [])) out[r.currency] = r.rate;
      return out;
    },
  };
}
