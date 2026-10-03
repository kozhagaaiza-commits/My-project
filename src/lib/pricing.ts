import { formatRub } from "@/lib/money";

// Ценообразование (Чертёж, Блок 5.4; BR-08; US-006; A8). Чистый модуль без env и БД — общий для сервера
// (POST/PATCH /api/admin/products, POST /api/admin/prices/recalculate) и превью в форме товара.
//
// FIX(blueprint): в Чертеже формула считается во float (`(cost / 100) * rate * multiplier`, затем
// `Math.ceil(Math.round(rub * 100) / 100 / roundingRub)`). Здесь та же семантика в целых числах (BigInt):
//   1) точная сумма в копейках = cost × rate × multiplier (курс — 4 знака, numeric(12,4); множитель — 2 знака,
//      numeric(4,2));
//   2) округление до копейки «половина вверх» (= Math.round для положительных — шаг из Чертежа);
//   3) округление ВВЕРХ до roundingRub рублей (= ceil(… / roundingRub) × roundingRub).
// Float-деление на шаге 3 давало «лишние» 100 ₽ на значениях вида 1337.0000000000002; целые — нет.
// US-006: при roundingRub = 100 это ceil(purchase_cost / 100 × rate × markup_multiplier / 100) × 100 ₽.

const RATE_SCALE = 4; // exchange_rates.rate numeric(12,4)
const MULTIPLIER_SCALE = 2; // app_settings.markup_multiplier numeric(4,2)
// BigInt без литералов `2n`: tsconfig target ES2017 их не допускает.
const ONE = BigInt(1);
const TWO = BigInt(2);

/**
 * Десятичное число → целое × 10^scale без потерь. Значение с бо́льшим числом знаков (не из БД) — RangeError:
 * молча округлять курс или множитель нельзя, цена разошлась бы с расчётом на экране.
 */
export function toScaledInt(value: number, scale: number): bigint {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`pricing: ожидалось положительное число, получено ${value}`);
  const factor = 10 ** scale;
  const raw = value * factor;
  const scaled = Math.round(raw);
  // Допуск — только на ошибку представления double (~1e-16 относительной), а не на лишние знаки.
  if (Math.abs(raw - scaled) > Math.abs(raw) * 1e-12 + 1e-9 || !Number.isSafeInteger(scaled)) {
    throw new RangeError(`pricing: ${value} не представимо с ${scale} знаками после запятой`);
  }
  return BigInt(scaled);
}

function assertPositiveInt(name: string, v: number): void {
  if (!Number.isSafeInteger(v) || v <= 0) throw new RangeError(`pricing: ${name} должно быть целым > 0, получено ${v}`);
}

export interface AutoPriceDetails {
  /** Точная сумма, округлённая до копейки (133 696 ₽ → 13369600). */
  exactKopecks: number;
  /** Цена после округления вверх до roundingRub рублей, копейки (13370000). */
  price: number;
}

/** Расчёт с промежуточной суммой (для строки расчёта). Аргументы — как у computeAutoPrice. */
export function computeAutoPriceDetails(
  purchaseCostMinor: number, rate: number, multiplier: number, roundingRub: number,
): AutoPriceDetails {
  assertPositiveInt("purchaseCostMinor", purchaseCostMinor);
  assertPositiveInt("roundingRub", roundingRub);
  // cost (1/100 ед.) × rate (1/10^4 ₽) × multiplier (1/100) = рубли × 10^8 = копейки × 10^6.
  const scaledKopecks = BigInt(purchaseCostMinor) * toScaledInt(rate, RATE_SCALE) * toScaledInt(multiplier, MULTIPLIER_SCALE);
  const divisor = BigInt(10) ** BigInt(RATE_SCALE + MULTIPLIER_SCALE); // минимальные единицы (1/100) = копейки
  const exact = (scaledKopecks + divisor / TWO) / divisor; // половина вверх (как Math.round для > 0)
  const step = BigInt(roundingRub) * BigInt(100);
  const price = ((exact + step - ONE) / step) * step;
  if (price > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("pricing: цена вне диапазона");
  return { exactKopecks: Number(exact), price: Number(price) };
}

/**
 * purchaseCostMinor — закупка в минимальных единицах валюты (80000 = $800.00)
 * rate — рублей за 1 единицу валюты (83.56); для RUB = 1
 * Возвращает цену в копейках, округлённую ВВЕРХ до roundingRub рублей.
 * Пример: 80000, 83.56, 2.00, 100 → 800 × 83.56 × 2 = 133 696 ₽ → 133 700 ₽ → 13370000
 */
export function computeAutoPrice(purchaseCostMinor: number, rate: number, multiplier: number, roundingRub: number): number {
  return computeAutoPriceDetails(purchaseCostMinor, rate, multiplier, roundingRub).price;
}

/** 80000 → «800.00» (целочисленно). */
export function minorUnitsToString(minor: number): string {
  const whole = Math.trunc(minor / 100);
  return `${whole}.${String(minor - whole * 100).padStart(2, "0")}`;
}

/** Целое × 10^scale → строка с ровно scale знаками: 835600, 4 → «83.5600». */
function scaledToString(v: bigint, scale: number): string {
  const s = v.toString().padStart(scale + 1, "0");
  return `${s.slice(0, -scale)}.${s.slice(-scale)}`;
}

export type PurchaseCurrency = "USD" | "CNY" | "RUB";

/**
 * Строка расчёта из ответа POST /api/admin/products (Блок 3):
 * «800.00 USD × 83.5600 × 2.00 = 133 696 ₽ → 133 700 ₽». Суммы — через formatRub.
 */
export function formatPriceCalculation(
  purchaseCostMinor: number, currency: PurchaseCurrency, rate: number, multiplier: number, roundingRub: number,
): string {
  const { exactKopecks, price } = computeAutoPriceDetails(purchaseCostMinor, rate, multiplier, roundingRub);
  return `${minorUnitsToString(purchaseCostMinor)} ${currency} × ${scaledToString(toScaledInt(rate, RATE_SCALE), RATE_SCALE)}` +
    ` × ${scaledToString(toScaledInt(multiplier, MULTIPLIER_SCALE), MULTIPLIER_SCALE)}` +
    ` = ${formatRub(exactKopecks)} → ${formatRub(price)}`;
}
