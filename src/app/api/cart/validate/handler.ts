import { buildCartValidation } from "@/lib/cart/validate";
import { isAtelierPricing } from "@/lib/catalog";
import { PRIVATE_NO_STORE, internalError, ok, validationError } from "@/lib/catalog/http";
import { cartValidateBody, cartValidationMessage } from "@/lib/schemas/cart";
import type { CartProduct } from "@/types/cart";
import type { CatalogContext } from "@/types/catalog";

// Тело POST /api/cart/validate с внедряемыми зависимостями (route.ts — тонкая обёртка с реальными).
// Модуль не импортирует env / service-role клиент — тестируется node:test без Supabase.
// Порядок: Origin (5.10, CSRF) → rate limit 60/60 с на IP → JSON → Zod → сессия (уровень цены, BR-10)
// → товары (service-role, явные колонки) → чистая сборка ответа.

export interface CartValidateDeps {
  assertSameOrigin(request: Request): Response | null;
  limitCart(request: Request): Promise<Response | null>;
  getCatalogContext(): Promise<CatalogContext>;
  getCartProducts(ids: string[], ctx: CatalogContext): Promise<CartProduct[]>;
}

async function handle(request: Request, deps: CartValidateDeps): Promise<Response> {
  try {
    const forbidden = deps.assertSameOrigin(request);
    if (forbidden) return forbidden;
    const limited = await deps.limitCart(request);
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

    const ctx = await deps.getCatalogContext();
    const items = parsed.data.items;
    const products = await deps.getCartProducts(items.map((i) => i.product_id), ctx);
    const data = buildCartValidation(items, products, isAtelierPricing(ctx) ? "atelier" : "retail");
    return ok(data, PRIVATE_NO_STORE);
  } catch (err) {
    return internalError("cart.validate", err);
  }
}

export function createCartValidateHandler(deps: CartValidateDeps) {
  return async function POST(request: Request): Promise<Response> {
    const res = await handle(request, deps);
    // Ответ зависит от сессии (цены ателье) и остатков: никогда не кэшируется, в том числе ошибки.
    res.headers.set("Cache-Control", PRIVATE_NO_STORE);
    return res;
  };
}
