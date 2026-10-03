// Маски полей оформления заказа (Блок 4 «Оформление заказа»): собственный onChange, без библиотек.
// Чистые функции без React и window — тестируются node:test.

const digitsOf = (value: string): string => value.replace(/\D/g, "");

/** Форматирует до 10 цифр номера (без кода страны) → «+7 (916) 555-12-34»; пустой набор → «+7». */
function formatPhoneDigits(d: string): string {
  if (d.length === 0) return "+7";
  let out = `+7 (${d.slice(0, 3)}`;
  if (d.length >= 3) out += ")";
  if (d.length > 3) out += ` ${d.slice(3, 6)}`;
  if (d.length > 6) out += `-${d.slice(6, 8)}`;
  if (d.length > 8) out += `-${d.slice(8, 10)}`;
  return out;
}

/**
 * Маска телефона +7 (999) 999-99-99.
 * raw — новое значение поля после ввода, prev — предыдущее. Ведущие 7/8/+7 (вставка «8 916…», сам префикс маски)
 * отбрасываются. Если пользователь стёр ровно один символ маски («)», пробел, дефис) — удаляется последняя цифра,
 * иначе маска вернула бы тот же текст и курсор «застрял» бы.
 */
export function applyPhoneMask(raw: string, prev = ""): string {
  let digits = digitsOf(raw);
  const hadCountryDigit = /^[78]/.test(digits);
  if (hadCountryDigit) digits = digits.slice(1);
  const deleting = raw.length < prev.length;
  const erasedMaskChar = raw.length === prev.length - 1 && digits === digitsOf(prev).replace(/^[78]/, "");
  if (erasedMaskChar) digits = digits.slice(0, -1);
  digits = digits.slice(0, 10);
  if (digits.length === 0) return deleting || !hadCountryDigit ? "" : "+7";
  return formatPhoneDigits(digits);
}

/** Индекс — только цифры, не больше 6. */
export const applyPostalMask = (raw: string): string => digitsOf(raw).slice(0, 6);

/** Код ПВЗ СДЭК и VIN вводятся в верхнем регистре; пробелы внутри не нужны. */
export const applyUpperMask = (raw: string): string => raw.replace(/\s/g, "").toUpperCase();
