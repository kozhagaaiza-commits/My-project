import { isUuid, okJson, readJson, runAdmin, zodError } from "@/lib/admin/products/http";
import type { AdminVehiclesDeps } from "@/lib/admin/vehicles/deps";
import { isUniqueViolation, toVehicleShape, vehicleDuplicate, vehicleNotFound } from "@/lib/admin/vehicles/responses";
import { vehiclePatchBody, vehicleUpsertBody, type VehicleUpsertBody } from "@/lib/schemas/admin-vehicles";

// PATCH / DELETE /api/admin/vehicles/[id] (Блок 3). PATCH — подмножество vehicleUpsertBody; refine-проверки
// (годы, диапазоны) — поверх объединения с текущей записью. DELETE: ссылки заказов обнуляются (SET NULL, 2.7).

type Ctx = { params: Promise<{ id: string }> };

async function patch(request: Request, id: string, deps: AdminVehiclesDeps): Promise<Response> {
  const denied = await deps.requireAdmin(request);
  if (denied) return denied;
  if (!isUuid(id)) return vehicleNotFound();
  const parsed = vehiclePatchBody.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;
  const repo = await deps.repo();
  const cur = await repo.get(id);
  if (!cur) return vehicleNotFound();
  const current = toVehicleShape(cur);
  const checked = vehicleUpsertBody.safeParse({ ...current, ...body });
  if (!checked.success) return zodError(checked.error);
  const m = checked.data;

  const changes: Partial<Record<keyof VehicleUpsertBody, unknown>> = {};
  for (const key of Object.keys(body) as Array<keyof VehicleUpsertBody>) {
    if (m[key] !== current[key]) changes[key] = m[key];
  }
  let row = cur;
  if (Object.keys(changes).length > 0) {
    try {
      const updated = await repo.update(id, changes as Partial<VehicleUpsertBody>);
      if (!updated) return vehicleNotFound();
      row = updated;
    } catch (err) {
      if (isUniqueViolation(err)) return vehicleDuplicate(m);
      throw err;
    }
  }
  const shape = toVehicleShape(row);
  const echoed: Record<string, unknown> = {};
  for (const key of Object.keys(body) as Array<keyof VehicleUpsertBody>) echoed[key] = shape[key];
  return okJson({ id: row.id, ...echoed, fitting_products_count: await repo.fittingWheelsCount(row.id) });
}

async function remove(request: Request, id: string, deps: AdminVehiclesDeps): Promise<Response> {
  const denied = await deps.requireAdmin(request);
  if (denied) return denied;
  if (!isUuid(id)) return vehicleNotFound();
  const repo = await deps.repo();
  if (!(await repo.delete(id))) return vehicleNotFound();
  return okJson({ deleted: true });
}

export function createAdminVehicleHandlers(deps: AdminVehiclesDeps) {
  const withId = (scope: string, fn: (r: Request, id: string, d: AdminVehiclesDeps) => Promise<Response>) =>
    async (request: Request, { params }: Ctx) => {
      const { id } = await params;
      return runAdmin(scope, () => fn(request, id, deps), { vehicleId: id });
    };
  return { PATCH: withId("admin.vehicles.patch", patch), DELETE: withId("admin.vehicles.delete", remove) };
}
