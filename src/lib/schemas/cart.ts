import { z } from "zod";
import { uuid } from "./common";

// POST /api/cart/validate (Чертёж, Блок 3 «Корзина и заказ»). Схема — дословно из Чертежа.
// quantity ≤ 4 — общий потолок; лимит по типу товара (2 комплекта дисков, BR-04) применяет buildCartValidation.
export const cartValidateBody = z.object({
  items: z.array(z.object({ product_id: uuid, quantity: z.number().int().min(1).max(4) })).min(1).max(10)
    .refine((a) => new Set(a.map((i) => i.product_id)).size === a.length, "Один товар — одна позиция"),
});
export type CartValidateBody = z.infer<typeof cartValidateBody>;

/** message для 400: пустой массив items — «Корзина пуста» (пример Блока 3), остальное — «Проверьте корзину». */
export function cartValidationMessage(error: z.ZodError): string {
  const empty = error.issues.some((i) =>
    i.code === "too_small" && i.origin === "array" && i.path.length === 1 && i.path[0] === "items");
  return empty ? "Корзина пуста" : "Проверьте корзину";
}
