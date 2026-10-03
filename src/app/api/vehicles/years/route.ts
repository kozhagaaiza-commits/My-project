import { listYears } from "@/lib/catalog-queries";
import {
  PUBLIC_DICTIONARY_CACHE, internalError, notFound, ok, queryObject, validationError, vehicleValidationMessage,
} from "@/lib/catalog/http";
import { limitCatalog } from "@/lib/rate-limit";
import { vehicleYearsQuery } from "@/lib/schemas/vehicles";

// GET /api/vehicles/years?make=BMW&model=5%20Series — годы модели по убыванию.
export async function GET(request: Request) {
  try {
    const limited = await limitCatalog(request);
    if (limited) return limited;
    const parsed = vehicleYearsQuery.safeParse(queryObject(request.url));
    if (!parsed.success) return validationError(vehicleValidationMessage(parsed.error), parsed.error);
    const years = await listYears(parsed.data.make, parsed.data.model);
    if (years === null) return notFound("Модель не найдена");
    return ok(years, PUBLIC_DICTIONARY_CACHE);
  } catch (err) {
    return internalError("vehicles.years", err);
  }
}
