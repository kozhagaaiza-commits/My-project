// Характеристики позиции заказа для сверки инженером (Чертёж, Блок 4 «Админка — Заказ», карточка «Позиции»).
const KNOWN_LABELS: Record<string, string> = {
  diameter_in: "Диаметр",
  width_front_in: "Ширина перед",
  width_rear_in: "Ширина зад",
  et_front_mm: "ET перед",
  et_rear_mm: "ET зад",
  pcd: "PCD",
  center_bore_mm: "ЦО",
  bolt_seat: "Посадка",
  construction: "Конструкция",
  finish: "Покрытие",
  weight_kg: "Вес",
  material: "Материал",
};

const UNITS: Record<string, string> = {
  diameter_in: "″",
  width_front_in: "J",
  width_rear_in: "J",
  et_front_mm: " мм",
  et_rear_mm: " мм",
  center_bore_mm: " мм",
  weight_kg: " кг",
};

const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export interface SpecLine {
  key: string;
  label: string;
  value: string;
}

function formatValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return `${numberFormatter.format(value)}${UNITS[key] ?? ""}`;
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "string") return value;
  return null;
}

/** specs → список «подпись — значение»; служебный `type` не показываем. */
export function specLines(specs: Record<string, unknown>): SpecLine[] {
  const lines: SpecLine[] = [];
  for (const [key, raw] of Object.entries(specs)) {
    if (key === "type") continue;
    const value = formatValue(key, raw);
    if (value !== null) lines.push({ key, label: KNOWN_LABELS[key] ?? key, value });
  }
  return lines;
}
