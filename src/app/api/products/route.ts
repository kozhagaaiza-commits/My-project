import { listProducts } from "@/lib/catalog-queries";
import { PRIVATE_NO_STORE, internalError, notFound, ok, queryObject, validationError } from "@/lib/catalog/http";
import { getCatalogContext } from "@/lib/catalog/session";
import { limitCatalog } from "@/lib/rate-limit";
import { productsQuery } from "@/lib/schemas/catalog";

// GET /api/products — список каталога с фильтрами (Блок 3 «Каталог»).
// Порядок: rate limit → Zod → сессия (atelierId для price_atelier) → данные.
export async function GET(request: Request) {
  try {
    const limited = await limitCatalog(request);
    if (limited) return limited;
    const parsed = productsQuery.safeParse(queryObject(request.url));
    if (!parsed.success) return validationError("Неверные параметры фильтра", parsed.error);
    const ctx = await getCatalogContext();
    const result = await listProducts(parsed.data, ctx);
    if (result.kind === "vehicle_not_found") return notFound("Автомобиль не найден, показаны все товары");
    return ok(result.data, PRIVATE_NO_STORE, result.meta);
  } catch (err) {
    return internalError("products.list", err);
  }
}
