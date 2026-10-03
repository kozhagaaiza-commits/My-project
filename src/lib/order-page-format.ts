// Форматирование дат и брони на странице заказа (Блок 4 «Статус заказа»). Без React — тестируется node:test.
// Все даты — Europe/Moscow; «чистые» даты API (YYYY-MM-DD) не сдвигаются часовым поясом.

const MOSCOW_TZ = "Europe/Moscow";
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const stepFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MOSCOW_TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const dayMonthFormatter = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "long" });
const moscowYearFormatter = new Intl.DateTimeFormat("en-US", { timeZone: MOSCOW_TZ, year: "numeric" });

/** «04.10 15:02» (МСК) для шага таймлайна; нечитаемая дата → пустая строка. */
export function formatStepDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const part = (type: string) => stepFormatter.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  return `${part("day")}.${part("month")} ${part("hour")}:${part("minute")}`;
}

interface DayParts {
  year: number;
  month: number; // 1–12
  day: number;
}

function parseDateOnly(value: string): DayParts | null {
  const m = DATE_ONLY.exec(value);
  if (!m) return null;
  const parts = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  const valid =
    check.getUTCFullYear() === parts.year && check.getUTCMonth() === parts.month - 1 && check.getUTCDate() === parts.day;
  return valid ? parts : null;
}

const utcNoon = (p: DayParts): Date => new Date(Date.UTC(p.year, p.month - 1, p.day, 12));

/** Месяц в родительном падеже («октября»): берётся из формата «день + месяц» — отдельный month: "long" даёт «октябрь». */
const monthGenitive = (p: DayParts): string =>
  dayMonthFormatter.formatToParts(utcNoon(p)).find((part) => part.type === "month")?.value ?? "";

const moscowYear = (now: Date): number => Number(moscowYearFormatter.format(now));

/** Год добавляется, только если он отличается от текущего (по Москве): «5 ноября» / «5 ноября 2027». */
const yearSuffix = (year: number, now: Date): string => (year === moscowYear(now) ? "" : ` ${year}`);

/** «5 ноября» (YYYY-MM-DD → дата без сдвига часового пояса); некорректная дата → null. */
export function formatDay(value: string, now: Date = new Date()): string | null {
  const p = parseDateOnly(value);
  if (!p) return null;
  return `${dayMonthFormatter.format(utcNoon(p))}${yearSuffix(p.year, now)}`;
}

/** «4–7 октября», «30 октября – 3 ноября», «31 декабря 2026 – 2 января 2027»; одна дата — «4 октября». */
export function formatDateRange(from: string, to: string, now: Date = new Date()): string | null {
  const a = parseDateOnly(from);
  const b = parseDateOnly(to);
  if (!a || !b) return null;
  const start = a.year * 10000 + a.month * 100 + a.day;
  const end = b.year * 10000 + b.month * 100 + b.day;
  if (start === end) return formatDay(from, now);
  if (start > end) return formatDay(to, now); // перепутанные границы не показываем как «7–4»
  if (a.year === b.year && a.month === b.month) {
    return `${a.day}–${b.day} ${monthGenitive(b)}${yearSuffix(b.year, now)}`;
  }
  const left = a.year === b.year ? dayMonthFormatter.format(utcNoon(a)) : `${dayMonthFormatter.format(utcNoon(a))} ${a.year}`;
  return `${left} – ${dayMonthFormatter.format(utcNoon(b))}${yearSuffix(b.year, now)}`;
}

/** «Ожидаемая доставка: 4–7 октября». */
export function expectedDeliveryText(range: { from: string; to: string } | null, now: Date = new Date()): string | null {
  const text = range ? formatDateRange(range.from, range.to, now) : null;
  return text ? `Ожидаемая доставка: ${text}` : null;
}

/** «Ожидаем на складе к 5 ноября» (preorder до прибытия). */
export function expectedReadyText(readyAt: string | null, now: Date = new Date()): string | null {
  const text = readyAt ? formatDay(readyAt, now) : null;
  return text ? `Ожидаем на складе к ${text}` : null;
}

/** Остаток брони: «18 мин», «1 ч 5 мин», «меньше минуты»; бронь истекла / дата нечитаема → null. */
export function formatReserveRemaining(reservedUntil: string | null, now: Date): string | null {
  if (!reservedUntil) return null;
  const until = new Date(reservedUntil).getTime();
  if (Number.isNaN(until)) return null;
  const ms = until - now.getTime();
  if (ms <= 0) return null;
  if (ms < 60_000) return "меньше минуты";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

/** «Бронь действует ещё 18 мин» или null, когда бронь истекла. */
export function reserveText(reservedUntil: string | null, now: Date): string | null {
  const left = formatReserveRemaining(reservedUntil, now);
  return left ? `Бронь действует ещё ${left}` : null;
}

const orderDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MOSCOW_TZ, day: "numeric", month: "short", year: "numeric",
});

/** «5 окт. 2026 г.» (МСК) для списка заказов в кабинете; нечитаемая дата → пустая строка. */
export function formatOrderDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : orderDateFormatter.format(date);
}
