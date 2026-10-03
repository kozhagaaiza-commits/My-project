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

/** Значение для показа на странице: пустое → «—» (в production-сборку пустые не попадают). */
export const legalValue = (value: string): string => (value.trim() === "" ? "—" : value);
