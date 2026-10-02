import { getProductBySlug } from "@/lib/catalog-queries";
import { PRIVATE_NO_STORE, internalError, notFound, ok, queryObject, validationError } from "@/lib/catalog/http";
import { getCatalogContext } from "@/lib/catalog/session";
import { limitCatalog } from "@/lib/rate-limit";
import { productDetailQuery, productSlugParams } from "@/lib/schemas/catalog";

// GET /api/products/[slug]?vehicle=<uuid> — карточка товара. draft/archived → 404 (admin — 200 со status).
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const limited = await limitCatalog(request);
    if (limited) return limited;
    const slug = productSlugParams.safeParse(await params);
    if (!slug.success) return validationError("Неверные параметры запроса", slug.error);
    const query = productDetailQuery.safeParse(queryObject(request.url));
    if (!query.success) return validationError("Неверные параметры запроса", query.error);
    const ctx = await getCatalogContext();
    const result = await getProductBySlug(slug.data.slug, query.data.vehicle, ctx);
    // vehicle_not_found в карточке не возникает (fitment = null), но контракт его допускает.
    if (result.kind !== "ok") return notFound("Товар больше не продаётся");
    return ok(result.data, PRIVATE_NO_STORE);
  } catch (err) {
    return internalError("products.get", err);
  }
}
