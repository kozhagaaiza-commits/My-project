import { z } from "zod";
import { vehicleLabel } from "@/lib/catalog";
import { ADMIN_PAGE_SIZE, okJson, queryObject, readJson, runAdmin, zodError } from "@/lib/admin/products/http";
import type { AdminVehiclesDeps } from "@/lib/admin/vehicles/deps";
import { fittingCounts } from "@/lib/admin/vehicles/fitting";
import { isUniqueViolation, toAdminVehicle, vehicleDuplicate } from "@/lib/admin/vehicles/responses";
import { adminVehiclesQuery, vehicleUpsertBody } from "@/lib/schemas/admin-vehicles";

// GET /api/admin/vehicles?make=BMW&page=1 и POST /api/admin/vehicles (Блок 3 «Админка — автомобили»).
// fitting_products_count — число строк find_wheels_for_vehicle («Подходящих дисков», Блок 4): только count
// (HEAD-запрос RPC), не больше 5 запросов одновременно.

async function list(request: Request, deps: AdminVehiclesDeps): Promise<Response> {
  const denied = await deps.requireAdmin(request);
  if (denied) return denied;
  const parsed = adminVehiclesQuery.safeParse(queryObject(request.url));
  if (!parsed.success) {
    const makeError = "make" in z.flattenError(parsed.error).fieldErrors;
    return zodError(parsed.error, makeError ? "Неизвестная марка" : "Неверные параметры запроса");
  }
  const q = parsed.data;
  const repo = await deps.repo();
  const { rows, total } = await repo.list({ make: q.make, q: q.q, page: q.page, perPage: ADMIN_PAGE_SIZE });
  const counts = await fittingCounts(repo, rows.map((r) => r.id));
  return okJson(rows.map((r, i) => toAdminVehicle(r, counts[i])), 200, { total, page: q.page, per_page: ADMIN_PAGE_SIZE });
}

async function create(request: Request, deps: AdminVehiclesDeps): Promise<Response> {
  const denied = await deps.requireAdmin(request);
  if (denied) return denied;
  const parsed = vehicleUpsertBody.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);
  const repo = await deps.repo();
  let row;
  try {
    row = await repo.insert(parsed.data);
  } catch (err) {
    if (isUniqueViolation(err)) return vehicleDuplicate(parsed.data);
    throw err;
  }
  // fitting_products_count — сверх JSON Чертежа: тост «Сохранено. Подходящих дисков: 7» (Блок 4) и после создания.
  return okJson({ id: row.id, label: vehicleLabel(row), fitting_products_count: await repo.fittingWheelsCount(row.id) }, 201);
}

export function createAdminVehiclesHandlers(deps: AdminVehiclesDeps) {
  return {
    GET: (request: Request) => runAdmin("admin.vehicles.list", () => list(request, deps)),
    POST: (request: Request) => runAdmin("admin.vehicles.create", () => create(request, deps)),
  };
}
