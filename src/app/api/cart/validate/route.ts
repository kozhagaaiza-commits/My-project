import { buildCartValidation } from "@/lib/cart/validate";
import { isAtelierPricing } from "@/lib/catalog";
import { getCartProducts } from "@/lib/catalog-queries";
import { PRIVATE_NO_STORE, internalError, ok, validationError } from "@/lib/catalog/http";
import { getCatalogContext } from "@/lib/catalog/session";
import { assertSameOrigin } from "@/lib/csrf";
import { limitCart } from "@/lib/rate-limit";
import { cartValidateBody, cartValidationMessage } from "@/lib/schemas/cart";

// POST /api/cart/validate — сверка корзины с БД: цены, наличие, лимиты (Блок 3 «Корзина и заказ»).
// Порядок: Origin (5.10, CSRF) → rate limit 60/60 с на IP → JSON → Zod → сессия (уровень цены, BR-10)
// → товары (service-role, явные колонки) → чистая сборка ответа.
async function handle(request: Request): Promise<Response> {
  try {
    const forbidden = assertSameOrigin(request);
    if (forbidden) return forbidden;
    const limited = await limitCart(request);
    if (limited) return limited;

    // Пустое или битое тело разбирается как null → Zod-ошибка «Проверьте корзину» (400 VALIDATION_ERROR).
    let raw: unknown = null;
    try {
      raw = JSON.parse(await request.text());
    } catch {
      raw = null;
    }
    const parsed = cartValidateBody.safeParse(raw);
    if (!parsed.success) return validationError(cartValidationMessage(parsed.error), parsed.error);

    const ctx = await getCatalogContext();
    const items = parsed.data.items;
    const products = await getCartProducts(items.map((i) => i.product_id), ctx);
    const data = buildCartValidation(items, products, isAtelierPricing(ctx) ? "atelier" : "retail");
    return ok(data, PRIVATE_NO_STORE);
  } catch (err) {
    return internalError("cart.validate", err);
  }
}

export async function POST(request: Request) {
  const res = await handle(request);
  // Ответ зависит от сессии (цены ателье) и остатков: никогда не кэшируется, в том числе ошибки.
  res.headers.set("Cache-Control", PRIVATE_NO_STORE);
  return res;
}
