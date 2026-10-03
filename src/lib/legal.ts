// Реквизиты продавца (Блок 0, 4 «Статичные страницы», 5.11). Значения заполняет владелец ДО продакшн-сборки:
// `next build` падает, если любая константа — пустая строка (проверка в next.config.ts).
// Значения не выдумываем: оставлены пустыми намеренно.
export const SELLER_NAME = ""; // ФИО или наименование ИП, например «ИП Иванов Иван Иванович»
export const SELLER_INN = "";
export const SELLER_OGRNIP = "";
export const SELLER_EMAIL = "";

export const LEGAL_CONSTANTS = { SELLER_NAME, SELLER_INN, SELLER_OGRNIP, SELLER_EMAIL } as const;

/** Имена пустых констант (для проверки сборки и подсказок). */
export function emptyLegalConstants(): string[] {
  return Object.entries(LEGAL_CONSTANTS)
    .filter(([, value]) => value.trim() === "")
    .map(([name]) => name);
}

const INN_RE = /^(\d{10}|\d{12})$/;
// Простая проверка формата адреса: одна «@», без пробелов, домен с точкой.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Ошибки формата ЗАПОЛНЕННЫХ констант (пустые проверяет emptyLegalConstants): ИНН — 10 или 12 цифр, email — адрес.
 * Параметр — для тестов; по умолчанию проверяются реальные значения.
 */
export function legalFormatErrors(values: { SELLER_INN: string; SELLER_EMAIL: string } = LEGAL_CONSTANTS): string[] {
  const errors: string[] = [];
  const inn = values.SELLER_INN.trim();
  if (inn !== "" && !INN_RE.test(inn)) errors.push("SELLER_INN: 10 или 12 цифр");
  const email = values.SELLER_EMAIL.trim();
  if (email !== "" && !EMAIL_RE.test(email)) errors.push("SELLER_EMAIL: адрес вида name@example.ru");
  return errors;
}

/** Значение для показа на странице: пустое → «—» (в production-сборку пустые не попадают). */
export const legalValue = (value: string): string => (value.trim() === "" ? "—" : value);
