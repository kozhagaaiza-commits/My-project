const rub = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const formatRub = (kopecks: number) => rub.format(kopecks / 100); // 13370000 → "133 700 ₽"

// "133700.00" → 13370000. Целочисленный разбор без float; на невалидной строке бросает ошибку,
// чтобы NaN/0 не ушли в mark_order_paid (там сравнение с NULL молча пропускает проверку суммы).
// FIX(blueprint): в Чертеже было Math.round(Number(v) * 100).
export const rubStringToKopecks = (v: string): number => {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(v.trim());
  if (!m) throw new Error(`Invalid RUB amount: ${JSON.stringify(v)}`);
  const kopecks = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(kopecks)) throw new Error(`RUB amount out of range: ${JSON.stringify(v)}`);
  return kopecks;
};

export const kopecksToRubString = (k: number) => (k / 100).toFixed(2);       // 13370000 → "133700.00"
