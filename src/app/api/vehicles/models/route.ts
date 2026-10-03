import { listModels } from "@/lib/catalog-queries";
import { PUBLIC_DICTIONARY_CACHE, internalError, ok, queryObject, validationError } from "@/lib/catalog/http";
import { limitCatalog } from "@/lib/rate-limit";
import { vehicleModelsQuery } from "@/lib/schemas/vehicles";

// GET /api/vehicles/models?make=BMW — модели марки.
export async function GET(request: Request) {
  try {
    const limited = await limitCatalog(request);
    if (limited) return limited;
    const parsed = vehicleModelsQuery.safeParse(queryObject(request.url));
    if (!parsed.success) return validationError("Неизвестная марка", parsed.error);
    return ok(await listModels(parsed.data.make), PUBLIC_DICTIONARY_CACHE);
  } catch (err) {
    return internalError("vehicles.models", err);
  }
}
