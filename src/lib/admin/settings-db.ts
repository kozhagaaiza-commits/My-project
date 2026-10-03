import "server-only";
import { z } from "zod";
import type { Db } from "@/lib/catalog/db";
import { DbError } from "@/lib/orders/errors";
import type { SettingsPatchBody } from "@/lib/schemas/admin-settings";

// app_settings (одна строка id = 1) и последние курсы ЦБ из exchange_rates (Чертёж 2.12; Блок 3 «настройки», «сводка»).
// Клиент — service-role ПОСЛЕ authorizeAdminApi (5.10: админские эндпоинты). Явные колонки, Zod на ответы.
// numeric PostgREST отдаёт JSON-числом (2.00 → 2); строку тоже принимаем.

const numeric = z.union([z.number(), z.string()]).pipe(z.coerce.number()).pipe(z.number().finite());
const ts = z.string().min(10);

export const APP_SETTINGS_COLUMNS = "markup_multiplier,price_rounding_rub,auto_reprice,reprice_threshold,updated_at";

export const appSettingsRow = z.object({
  markup_multiplier: numeric,
  price_rounding_rub: z.number().int(),
  auto_reprice: z.boolean(),
  reprice_threshold: numeric,
  updated_at: ts,
});
export type AppSettingsRow = z.infer<typeof appSettingsRow>;

interface PgResult { data: unknown; error: { message: string; code?: string } | null }

function parse<T>(scope: string, schema: z.ZodType<T>, res: PgResult): T {
  if (res.error) throw new DbError(scope, res.error.code || undefined, res.error.message);
  return schema.parse(res.data);
}

/** Строка создаётся миграцией; её отсутствие — поломка БД (→ 500). */
export async function selectAppSettings(c: Db): Promise<AppSettingsRow> {
  const row = parse("app_settings.select", appSettingsRow.nullable(),
    await c.from("app_settings").select(APP_SETTINGS_COLUMNS).eq("id", 1).maybeSingle());
  if (row === null) throw new Error("app_settings: row id=1 missing");
  return row;
}

export async function updateAppSettings(c: Db, patch: SettingsPatchBody): Promise<AppSettingsRow> {
  const row = parse("app_settings.update", appSettingsRow.nullable(),
    await c.from("app_settings").update(patch).eq("id", 1).select(APP_SETTINGS_COLUMNS).maybeSingle());
  if (row === null) throw new Error("app_settings: row id=1 missing");
  return row;
}

export const RATE_CURRENCIES = ["USD", "CNY"] as const;
export type RateCurrency = (typeof RATE_CURRENCIES)[number];
export type LatestRates = Partial<Record<RateCurrency, { rate: number; date: string }>>;

const rateRow = z.object({ rate: numeric, rate_date: z.string() });

/** Последний курс по каждой валюте (order by rate_date desc limit 1, 5.4). Курса нет — валюты нет в ответе. */
export async function selectLatestRates(c: Db): Promise<LatestRates> {
  const results = await Promise.all(RATE_CURRENCIES.map(async (currency) => {
    const res = await c.from("exchange_rates").select("rate,rate_date").eq("currency", currency)
      .order("rate_date", { ascending: false }).limit(1).maybeSingle();
    return [currency, parse(`exchange_rates.latest.${currency}`, rateRow.nullable(), res)] as const;
  }));
  const out: LatestRates = {};
  for (const [currency, row] of results) if (row) out[currency] = { rate: row.rate, date: row.rate_date };
  return out;
}
