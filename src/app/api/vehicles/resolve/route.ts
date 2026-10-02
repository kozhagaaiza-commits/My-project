import { resolveVehicle } from "@/lib/catalog-queries";
import {
  PRIVATE_NO_STORE, internalError, notFound, ok, queryObject, validationError, vehicleValidationMessage,
} from "@/lib/catalog/http";
import { limitCatalog } from "@/lib/rate-limit";
import { vehicleResolveQuery } from "@/lib/schemas/vehicles";

// GET /api/vehicles/resolve?make=BMW&model=5%20Series&year=2017 — поколения, выпускавшиеся в этот год.
// Кэш в Чертеже для resolve не задан — не кэшируем.
export async function GET(request: Request) {
  try {
    const limited = await limitCatalog(request);
    if (limited) return limited;
    const parsed = vehicleResolveQuery.safeParse(queryObject(request.url));
    if (!parsed.success) return validationError(vehicleValidationMessage(parsed.error), parsed.error);
    const { make, model, year } = parsed.data;
    const generations = await resolveVehicle(make, model, year);
    if (generations.length === 0) return notFound(`Для ${make} ${model} ${year} года данных нет`);
    return ok(generations, PRIVATE_NO_STORE);
  } catch (err) {
    return internalError("vehicles.resolve", err);
  }
}
