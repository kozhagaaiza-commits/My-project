const rub = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const formatRub = (kopecks: number) => rub.format(kopecks / 100); // 13370000 → "133 700 ₽"
export const rubStringToKopecks = (v: string) => Math.round(Number(v) * 100); // "133700.00" → 13370000
export const kopecksToRubString = (k: number) => (k / 100).toFixed(2);       // 13370000 → "133700.00"
