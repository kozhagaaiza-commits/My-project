// Метки времени для оптимистической блокировки (Блок 3: PATCH … where id = $1 and updated_at = $2).
//
// timestamptz в Postgres хранит микросекунды, PostgREST отдаёт их как «2026-10-01T09:05:00.123456+00:00».
// Date#toISOString() обрезает до миллисекунд — после такой нормализации `updated_at = $2` не совпал бы никогда
// (вечный 409). Поэтому метка приводится к UTC строкой, с сохранением всех 6 знаков дробной части:
// «2026-10-01T09:05:00.123456Z». Этот формат проходит z.iso.datetime() и однозначно разбирается Postgres.

const TS = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6})\d*)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** Каноническая UTC-метка с 6 знаками дробной части; неразборчивая строка → null. */
export function canonicalTimestamp(value: string): string | null {
  const m = TS.exec(value.trim());
  if (!m) return null;
  const [, date, time, frac = "", zoneRaw] = m;
  let zone = (zoneRaw ?? "Z").toUpperCase();
  if (zone !== "Z") {
    const z = /^([+-]\d{2}):?(\d{2})?$/.exec(zone);
    if (!z) return null;
    zone = `${z[1]}:${z[2] ?? "00"}`;
  }
  const ms = Date.parse(`${date}T${time}${zone}`);
  if (Number.isNaN(ms)) return null;
  return `${new Date(ms).toISOString().slice(0, 19)}.${frac.padEnd(6, "0")}Z`;
}

/** Метка из ответа БД — всегда разборчива; иначе это ошибка формы данных (→ 500). */
export function dbTimestamp(value: string): string {
  const c = canonicalTimestamp(value);
  if (c === null) throw new Error(`timestamps: неразборчивая метка БД ${JSON.stringify(value)}`);
  return c;
}
