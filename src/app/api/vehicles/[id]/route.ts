import { getVehicle } from "@/lib/catalog-queries";
import { PUBLIC_DICTIONARY_CACHE, internalError, notFound, ok, validationError } from "@/lib/catalog/http";
import { limitCatalog } from "@/lib/rate-limit";
import { vehicleIdParams } from "@/lib/schemas/vehicles";

// GET /api/vehicles/[id] — параметры автомобиля (бейдж в шапке, «Подходит/не подходит»).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await limitCatalog(request);
    if (limited) return limited;
    const parsed = vehicleIdParams.safeParse(await params);
    if (!parsed.success) return validationError("Неверные параметры запроса", parsed.error);
    const vehicle = await getVehicle(parsed.data.id);
    if (!vehicle) return notFound("Автомобиль не найден");
    return ok(vehicle, PUBLIC_DICTIONARY_CACHE);
  } catch (err) {
    return internalError("vehicles.get", err);
  }
}
