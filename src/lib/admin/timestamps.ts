// Метки времени для оптимистической блокировки (Блок 3: PATCH /api/admin/orders/[id]{,/status}; Edge Case 14).
// PostgREST отдаёт timestamptz как "2026-10-01T15:02:44.123456+00:00" (микросекунды, смещение), а схема тела —
// z.iso.datetime() (только "Z"). Поэтому:
//  - наружу updated_at отдаётся в UTC с "Z" и ВСЕМИ цифрами дробной части (toIsoUtc) — клиент возвращает его как есть;
//  - сравнение «тот же момент» идёт в микросекундах (sameInstant): обрезка до миллисекунд (Date) давала бы ложный CONFLICT.

const TS_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/i;

interface Parsed { epochMs: number; fraction: string }

function parse(ts: string): Parsed | null {
  const m = TS_RE.exec(ts.trim());
  if (!m) return null;
  let offset = m[4].toUpperCase();
  if (offset !== "Z" && /^[+-]\d{2}$/.test(offset)) offset = `${offset}:00`;
  else if (offset !== "Z" && !offset.includes(":")) offset = `${offset.slice(0, 3)}:${offset.slice(3)}`;
  const epochMs = Date.parse(`${m[1]}T${m[2]}${offset}`);
  if (Number.isNaN(epochMs)) return null;
  return { epochMs, fraction: m[3] ?? "" };
}

/** "…44.123456+00:00" → "2026-10-01T15:02:44.123456Z"; без дробной части → ".000Z". Не метка времени — исходная строка. */
export function toIsoUtc(ts: string): string {
  const p = parse(ts);
  if (!p) return ts;
  const base = new Date(p.epochMs).toISOString().slice(0, 19); // смещения — целые минуты, дробная часть от них не зависит
  const fraction = p.fraction.length >= 3 ? p.fraction : p.fraction.padEnd(3, "0");
  return `${base}.${fraction}Z`;
}

/** Момент в микросекундах от эпохи (дробь длиннее 6 цифр отбрасывается). null — не метка времени. */
export function epochMicros(ts: string): number | null {
  const p = parse(ts);
  if (!p) return null;
  return p.epochMs * 1000 + Number(p.fraction.padEnd(6, "0").slice(0, 6));
}

/** Два представления одного момента ("…Z" и "…+00:00", разная длина дроби) считаются равными. */
export function sameInstant(a: string, b: string): boolean {
  const x = epochMicros(a);
  const y = epochMicros(b);
  return x !== null && y !== null && x === y;
}

/** null-безопасная нормализация для полей ответа. */
export const isoOrNull = (ts: string | null): string | null => (ts === null ? null : toIsoUtc(ts));
