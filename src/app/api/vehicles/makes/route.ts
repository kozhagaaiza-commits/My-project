import { listMakes } from "@/lib/catalog-queries";
import { PUBLIC_DICTIONARY_CACHE, internalError, ok } from "@/lib/catalog/http";
import { limitCatalog } from "@/lib/rate-limit";

// GET /api/vehicles/makes — марки с активными автомобилями (Блок 3 «Подбор по авто»).
// Кэш — заголовок Cache-Control (см. PUBLIC_DICTIONARY_CACHE), а не `export const revalidate`.
export async function GET(request: Request) {
  try {
    const limited = await limitCatalog(request);
    if (limited) return limited;
    return ok(await listMakes(), PUBLIC_DICTIONARY_CACHE);
  } catch (err) {
    return internalError("vehicles.makes", err);
  }
}
