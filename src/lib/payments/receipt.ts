import type { ReceiptItemInput } from "@/lib/yookassa";

// Позиции чека 54-ФЗ из позиций заказа (снапшоты order_items). Чистые функции.

export interface OrderLine {
  title_snapshot: string;
  quantity: number;
  unit_price: number; // копейки
}

export const toReceiptItems = (lines: OrderLine[]): ReceiptItemInput[] =>
  lines.map((l) => ({ title: l.title_snapshot, quantity: l.quantity, unit_price: l.unit_price }));

export const linesTotal = (lines: OrderLine[]): number => lines.reduce((s, l) => s + l.unit_price * l.quantity, 0);

/**
 * Позиции чека возврата (Блок 3 «POST /api/admin/orders/[id]/refund», шаг 3): при полном возврате — все позиции заказа;
 * при частичном — те же позиции пропорционально сумме. Каждая строка частичного возврата — quantity 1 на сумму доли строки
 * (метод наибольшего остатка, целые копейки), строки с нулевой долей опускаются; сумма чека всегда равна amount.
 */
export function refundReceiptItems(lines: OrderLine[], amount: number): ReceiptItemInput[] {
  const total = linesTotal(lines);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > total) {
    throw new RangeError(`refundReceiptItems: сумма ${amount} вне (0, ${total}]`);
  }
  if (amount === total) return toReceiptItems(lines);

  // BigInt: line_total × amount может превышать 2^53.
  const T = BigInt(total);
  const shares = lines.map((l, i) => {
    const num = BigInt(l.unit_price * l.quantity) * BigInt(amount);
    return { i, base: Number(num / T), rem: num % T };
  });
  let rest = amount - shares.reduce((s, x) => s + x.base, 0);
  for (const x of [...shares].sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1))) {
    if (rest <= 0) break;
    x.base += 1;
    rest -= 1;
  }
  return shares
    .filter((x) => x.base > 0)
    .map((x) => ({ title: lines[x.i].title_snapshot, quantity: 1, unit_price: x.base }));
}
