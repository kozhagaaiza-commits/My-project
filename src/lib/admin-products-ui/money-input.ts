// Ввод денег в формах админки: строка «800.00» / «133 700» / «83,5» ↔ целые минимальные единицы.
// Разбор целочисленный (без Number("…") * 100), как rubStringToKopecks в src/lib/money.ts.

/** «800», «800.5», «800,50», «133 700.00» → 80000 / 80050 / 13370000; пусто или мусор → undefined. */
export function parseMoneyToMinor(input: string): number | undefined {
  const s = input.trim().replace(/[\s ]/g, "").replace(",", ".");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return undefined;
  const minor = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : undefined;
}

/** 80000 → «800.00»; null → «». Целочисленно, без деления на float. */
export function minorToInput(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  const whole = Math.trunc(minor / 100);
  return `${whole}.${String(minor - whole * 100).padStart(2, "0")}`;
}

/** Цена в рублях без копеек, если они нулевые: 13370000 → «133700», 13370050 → «133700.50». */
export function kopecksToPriceInput(kopecks: number | null | undefined): string {
  const s = minorToInput(kopecks);
  return s.endsWith(".00") ? s.slice(0, -3) : s;
}

/** Строка из поля → число для схемы: пусто → null, мусор → undefined (схема даст «Введите число»). */
export function parseNumberField(input: string): number | null | undefined {
  const s = input.trim().replace(",", ".");
  if (s === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  return Number(s);
}
