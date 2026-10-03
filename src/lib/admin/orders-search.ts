// Поиск заказов в админке (Блок 3: GET /api/admin/orders, параметр q — «номер заказа, email или телефон»;
// Блок 4 «Админка — Заказы»). Чистая функция: строка поиска → один фильтр PostgREST.
//  - есть «@» → email (ILIKE по подстроке, без учёта регистра);
//  - начинается с «FC» → номер (ILIKE, верхний регистр);
//  - только цифры, пробелы, +, -, скобки → номер ИЛИ телефон: телефон нормализуется как phoneRu (8XXXXXXXXXX → 7XXXXXXXXXX),
//    в БД он хранится как +7XXXXXXXXXX, поэтому ищется по цифрам без «+»;
//  - иначе → часть email («yandex.ru», «artem»).
// Спецсимволы LIKE (% _ \) экранируются. В .or() попадают только цифры — экранировать синтаксис PostgREST не нужно.

export type OrderSearchFilter =
  | { kind: "ilike"; column: "customer_email" | "number"; pattern: string }
  | { kind: "or"; filter: string };

const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** Цифры телефона в виде, как они стоят в +7XXXXXXXXXX: «8 916 555-12-34» → «79165551234». */
export function phoneSearchDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("8") ? `7${digits.slice(1)}` : digits;
}

export function orderSearchFilter(q: string): OrderSearchFilter {
  const s = q.trim();
  if (s.includes("@")) return { kind: "ilike", column: "customer_email", pattern: `%${escapeLike(s.toLowerCase())}%` };
  if (/^fc/i.test(s)) return { kind: "ilike", column: "number", pattern: `%${escapeLike(s.toUpperCase())}%` };
  if (/^[+\d\s()-]+$/.test(s)) {
    const digits = s.replace(/\D/g, "");
    if (digits.length >= 3) {
      return { kind: "or", filter: `number.ilike.%${digits}%,customer_phone.ilike.%${phoneSearchDigits(s)}%` };
    }
    return { kind: "ilike", column: "number", pattern: `%${escapeLike(s)}%` };
  }
  return { kind: "ilike", column: "customer_email", pattern: `%${escapeLike(s.toLowerCase())}%` };
}
