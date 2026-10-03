import { getCartProducts } from "@/lib/catalog-queries";
import { getCatalogContext } from "@/lib/catalog/session";
import { assertSameOrigin } from "@/lib/csrf";
import { limitCart } from "@/lib/rate-limit";
import { createCartValidateHandler } from "./handler";

// POST /api/cart/validate — сверка корзины с БД: цены, наличие, лимиты (Блок 3 «Корзина и заказ»).
// Логика и порядок проверок — в handler.ts; здесь только реальные зависимости.
const handler = createCartValidateHandler({ assertSameOrigin, limitCart, getCatalogContext, getCartProducts });

export async function POST(request: Request) {
  return handler(request);
}
