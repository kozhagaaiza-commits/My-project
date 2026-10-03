// Форматирование для админки. Все даты — Europe/Moscow (CLAUDE.md); «чистые» даты YYYY-MM-DD не сдвигаются поясом.
export { formatStepDate as formatOrderDate } from "@/lib/order-page-format";

const MOSCOW_TZ = "Europe/Moscow";
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const fullFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MOSCOW_TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const ymdFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: MOSCOW_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const rateFormatter = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «01.10.2026 12:30» (МСК); нечитаемая дата → пустая строка. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const part = (type: string) => fullFormatter.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  return `${part("day")}.${part("month")}.${part("year")} ${part("hour")}:${part("minute")}`;
}

/** «2026-10-01» → «01.10.2026»; не дата → пустая строка. */
export function formatIsoDate(value: string | null): string {
  const m = value ? DATE_ONLY.exec(value) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

/** Курс ЦБ: 83.56 → «83,56 ₽» (курс — не сумма заказа, копейки не участвуют). */
export const formatRate = (rate: number): string => `${rateFormatter.format(rate)} ₽`;

/** Склонение: pluralRu(3, "день", "дня", "дней") → «дня». */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

const toDayNumber = (ymd: string): number | null => {
  const m = DATE_ONLY.exec(ymd);
  return m ? Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000) : null;
};

/** Сколько дней прошло от даты YYYY-MM-DD до «сегодня» по Москве; нечитаемая дата → null. */
export function daysSince(ymd: string | null, now: Date = new Date()): number | null {
  const from = ymd ? toDayNumber(ymd) : null;
  const today = toDayNumber(ymdFormatter.format(now));
  return from === null || today === null ? null : today - from;
}
