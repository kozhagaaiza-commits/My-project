// Безопасный redirect после входа (Блок 5.1 «Аутентификация», Edge Case 28): только относительный путь —
// начинается с «/», но не с «//» и не с «/\». Управляющие символы и пробелы отбрасываются целиком: браузеры
// вырезают \t \n \r из URL, и «/\t/evil.example» превратился бы в «//evil.example».
// Без server-only: используется в клиентских формах, callback и proxy.

export const DEFAULT_NEXT = "/account";

export function safeNextPath(next: string | null | undefined, fallback: string = DEFAULT_NEXT): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2000) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f\\]/.test(next)) return fallback;
  return next;
}

/** `?next=…` для ссылок между экранами auth (только если значение безопасно и не по умолчанию). */
export function nextQuery(next: string | null | undefined): string {
  const safe = safeNextPath(next, "");
  return safe && safe !== DEFAULT_NEXT ? `?next=${encodeURIComponent(safe)}` : "";
}
