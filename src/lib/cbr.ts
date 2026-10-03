// Курсы ЦБ РФ (Чертёж 5.9.4, 5.12 шаг 1): клиент XML_daily.asp и идемпотентная загрузка в exchange_rates.
// Модуль не импортирует env / Supabase — БД передаётся репозиторием (cbr-repo.ts), fetch и sleep внедряются в тестах.
// Внешних XML-библиотек нет: нужны три ASCII-тега (CharCode, Nominal, Value) и атрибут Date — достаточно разбора по тегам.
// Кодировка windows-1251 декодируется TextDecoder'ом; ASCII-часть одинакова и в UTF-8, поэтому смена кодировки на стороне ЦБ разбор не ломает.

export const CBR_URL = "https://www.cbr.ru/scripts/XML_daily.asp";
export const CBR_TIMEOUT_MS = 10_000;
/** Retry 3 попытки: 0 / 2 / 5 с (5.9.4). */
export const CBR_RETRY_DELAYS_MS: readonly number[] = [0, 2000, 5000];

export const CURRENCIES = ["USD", "CNY"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Правдоподобие курса, ₽ за 1 единицу: вне диапазона — признак битого ответа, а не рынка. */
export const PLAUSIBLE_RATE_RUB: Record<Currency, { min: number; max: number }> = {
  USD: { min: 10, max: 1000 },
  CNY: { min: 1, max: 200 },
};
/** Дата курса: ЦБ отдаёт курс на следующий рабочий день (до ~4 дней вперёд на праздниках); старше 14 дней — устаревший кэш. */
export const PLAUSIBLE_DATE_PAST_DAYS = 14;
export const PLAUSIBLE_DATE_FUTURE_DAYS = 14;

/** rate — ₽ за 1 единицу валюты, ровно 4 знака (как numeric(12,4)); date — YYYY-MM-DD. */
export interface CbrRates { date: string; USD: number; CNY: number }

export type CbrErrorKind = "timeout" | "network" | "http" | "parse";

/** Ошибка получения/разбора курса. message — для логов и cron (`CBR timeout after 10000 ms`). */
export class CbrError extends Error {
  constructor(readonly kind: CbrErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CbrError";
  }
}

// ---------- Разбор XML (чистые функции) ----------

const VALUTE_BLOCK = /<Valute\b[^>]*>([\s\S]*?)<\/Valute>/g;
const VAL_CURS_DATE = /<ValCurs\b[^>]*\bDate="(\d{2})\.(\d{2})\.(\d{4})"/;
const MS_PER_DAY = 86_400_000;

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`).exec(block);
  return m ? (m[1] ?? "") : null;
}

/**
 * Value / Nominal в десятитысячных долях рубля (целое), округление половина вверх.
 * Целочисленная арифметика: "117,2345" при Nominal 10 → 11,72345 → 11,7235 (117235 десятитысячных), без float.
 * Value допускает запятую или точку и до 6 знаков после неё.
 */
export function rateToE4(value: string, nominal: number): number {
  const m = /^(\d{1,7})(?:[.,](\d{1,6}))?$/.exec(value.trim());
  if (!m) throw new CbrError("parse", `CBR: bad value "${value}"`);
  const micro = Number(m[1]) * 1_000_000 + Number((m[2] ?? "").padEnd(6, "0"));
  // micro / nominal — в миллионных; делим на 100 → десятитысячные. round(micro / (100·nominal)) без float.
  return Math.floor((2 * micro + 100 * nominal) / (200 * nominal));
}

/** 830000 → "83.0000" (строка для numeric без потери точности). */
export function formatE4(e4: number): string {
  const int = Math.floor(e4 / 10_000);
  return `${int}.${String(e4 % 10_000).padStart(4, "0")}`;
}

function parseDate(xml: string, now: Date): string {
  const m = VAL_CURS_DATE.exec(xml);
  if (!m) throw new CbrError("parse", "CBR: no date");
  const [, dd, mm, yyyy] = m;
  const ts = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));
  const d = new Date(ts);
  // Реальная дата календаря (31.02.2026 → отказ).
  if (d.getUTCFullYear() !== Number(yyyy) || d.getUTCMonth() !== Number(mm) - 1 || d.getUTCDate() !== Number(dd)) {
    throw new CbrError("parse", `CBR: invalid date ${dd}.${mm}.${yyyy}`);
  }
  const days = (ts - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / MS_PER_DAY;
  if (days < -PLAUSIBLE_DATE_PAST_DAYS || days > PLAUSIBLE_DATE_FUTURE_DAYS) {
    throw new CbrError("parse", `CBR: implausible date ${yyyy}-${mm}-${dd}`);
  }
  return `${yyyy}-${mm}-${dd}`;
}

/** Разбор тела XML_daily.asp (уже декодированного). Бросает CbrError("parse") при любой неправдоподобности. */
export function parseCbrXml(xml: string, now: Date = new Date()): CbrRates {
  const date = parseDate(xml, now);
  const found = new Map<string, number>();
  for (const block of xml.matchAll(VALUTE_BLOCK)) {
    const body = block[1] ?? "";
    const code = tag(body, "CharCode");
    if (code !== "USD" && code !== "CNY") continue;
    const nominalRaw = tag(body, "Nominal");
    const value = tag(body, "Value");
    if (nominalRaw === null || !/^\d{1,4}$/.test(nominalRaw) || Number(nominalRaw) < 1) throw new CbrError("parse", `CBR: bad nominal for ${code}`);
    if (value === null) throw new CbrError("parse", `CBR: no value for ${code}`);
    found.set(code, rateToE4(value, Number(nominalRaw)));
  }
  const out: Record<Currency, number> = { USD: 0, CNY: 0 };
  for (const cur of CURRENCIES) {
    const e4 = found.get(cur);
    if (e4 === undefined) throw new CbrError("parse", `CBR: no ${cur}`);
    const { min, max } = PLAUSIBLE_RATE_RUB[cur];
    if (e4 < min * 10_000 || e4 > max * 10_000) throw new CbrError("parse", `CBR: implausible ${cur} rate ${formatE4(e4)}`);
    out[cur] = e4 / 10_000; // кратно 1/10000 — toFixed(4) возвращает ту же строку, что formatE4
  }
  return { date, USD: out.USD, CNY: out.CNY };
}

// ---------- Запрос ----------

export interface FetchCbrOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
  now?: () => Date;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchOnce(opts: Required<Pick<FetchCbrOptions, "url" | "fetchImpl" | "timeoutMs">>, now: Date): Promise<CbrRates> {
  let body: ArrayBuffer;
  try {
    const res = await opts.fetchImpl(opts.url, { signal: AbortSignal.timeout(opts.timeoutMs), cache: "no-store" });
    if (!res.ok) throw new CbrError("http", `CBR HTTP ${res.status}`);
    // Таймаут действует и на чтение тела: abort рвёт arrayBuffer().
    body = await res.arrayBuffer();
  } catch (err) {
    if (err instanceof CbrError) throw err;
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw new CbrError("timeout", `CBR timeout after ${opts.timeoutMs} ms`, { cause: err });
    throw new CbrError("network", `CBR network error: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  return parseCbrXml(new TextDecoder("windows-1251").decode(body), now);
}

/** Курс USD и CNY на дату из XML. Retry 0 / 2 / 5 с; после последней неудачи — последняя ошибка (CbrError). */
export async function fetchCbrRates(options: FetchCbrOptions = {}): Promise<CbrRates> {
  const delays = options.retryDelaysMs ?? CBR_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? realSleep;
  const base = { url: options.url ?? CBR_URL, fetchImpl: options.fetchImpl ?? fetch, timeoutMs: options.timeoutMs ?? CBR_TIMEOUT_MS };
  let lastError: CbrError | null = null;
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    try {
      return await fetchOnce(base, (options.now ?? (() => new Date()))());
    } catch (err) {
      lastError = err instanceof CbrError ? err : new CbrError("network", String(err), { cause: err });
    }
  }
  throw lastError ?? new CbrError("network", "CBR: no attempts");
}

// ---------- Загрузка в БД (cron шаг 1 и POST /api/admin/exchange-rates/refresh) ----------

export interface ExchangeRateInsert { currency: Currency; rate: string; rate_date: string }

/** БД курсов. Реализация на service-role — cbr-repo.ts; в тестах — память. */
export interface ExchangeRatesRepo {
  /** `insert … on conflict (currency, rate_date) do nothing`; возвращает валюты реально вставленных строк. */
  insertMissing(rows: ExchangeRateInsert[]): Promise<Currency[]>;
  /** Сохранённый курс на дату (для уже существовавших строк). */
  getRates(date: string, currencies: Currency[]): Promise<Partial<Record<Currency, number>>>;
}

export interface RateResult { rate: number; date: string; inserted: boolean }
export type RefreshResult = Record<Currency, RateResult>;

export interface RefreshDeps {
  repo: ExchangeRatesRepo;
  fetchRates?: () => Promise<CbrRates>;
  /**
   * Точка расширения для автопересчёта цен (5.4, День 7): вызывается, если вставлен хотя бы один новый курс.
   * Ошибка хука логируется и не ломает загрузку курса (шаги cron независимы).
   */
  onNewRates?: (result: RefreshResult) => Promise<void>;
}

/**
 * Загрузить курс ЦБ и записать идемпотентно. Уже есть строка на эту дату → inserted: false, rate — сохранённый
 * (его и увидят расчёты цен). Ошибка ЦБ — CbrError; ошибка БД — исключение репозитория.
 */
export async function refreshRates(deps: RefreshDeps): Promise<RefreshResult> {
  const fetched = await (deps.fetchRates ?? (() => fetchCbrRates()))();
  const rows: ExchangeRateInsert[] = CURRENCIES.map((currency) => ({
    currency, rate: fetched[currency].toFixed(4), rate_date: fetched.date,
  }));
  const inserted = new Set(await deps.repo.insertMissing(rows));
  const existing = CURRENCIES.filter((c) => !inserted.has(c));
  const stored = existing.length > 0 ? await deps.repo.getRates(fetched.date, [...existing]) : {};
  const one = (currency: Currency): RateResult => ({
    rate: inserted.has(currency) ? fetched[currency] : (stored[currency] ?? fetched[currency]),
    date: fetched.date,
    inserted: inserted.has(currency),
  });
  const result: RefreshResult = { USD: one("USD"), CNY: one("CNY") };
  if (deps.onNewRates && (result.USD.inserted || result.CNY.inserted)) {
    try {
      await deps.onNewRates(result);
    } catch (err) {
      console.error({ scope: "cbr.onNewRates", err });
    }
  }
  return result;
}
