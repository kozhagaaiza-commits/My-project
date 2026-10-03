import { z } from "zod";
import { wheelFitsVehicle } from "@/lib/catalog/fitment";
import { vehicleUpsertBody } from "@/lib/admin-products-ui/schemas";
import type { AdminVehicleRow } from "@/lib/admin-products-ui/types";
import { vehicleLabel } from "@/lib/catalog";
import type { AdminFixtureStore } from "@/lib/admin-products-fixtures/store";
import { fail, isRecord, notFound, ok, type FixtureResponse } from "@/lib/admin-products-fixtures/respond";

/** Число активных дисков, подходящих автомобилю (как fitting_products_count в API). */
export function fittingCount(store: AdminFixtureStore, v: AdminVehicleRow): number {
  return store.products.filter(({ detail: d }) => {
    if (d.type !== "wheel_set" || d.status !== "active" || !d.wheel) return false;
    return wheelFitsVehicle({ type: "wheel_set", ...d.wheel }, v).fits;
  }).length;
}

const withCount = (store: AdminFixtureStore, v: AdminVehicleRow): AdminVehicleRow => ({ ...v, fitting_products_count: fittingCount(store, v) });

export function listVehicles(store: AdminFixtureStore, sp: URLSearchParams): FixtureResponse {
  if (store.failLists.vehicles > 0) {
    store.failLists.vehicles -= 1;
    return fail(500, "INTERNAL_ERROR", "Что-то пошло не так. Мы уже разбираемся");
  }
  const make = sp.get("make");
  const q = (sp.get("q") ?? "").toLowerCase();
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const per = store.vehiclesPerPage;
  const rows = store.vehicles.filter((v) => (!make || v.make === make) && (!q || v.model.toLowerCase().includes(q)));
  return ok(rows.slice((page - 1) * per, page * per).map((v) => withCount(store, v)), 200, { total: rows.length, page, per_page: per });
}

export function createVehicle(store: AdminFixtureStore, json: unknown): FixtureResponse {
  const parsed = vehicleUpsertBody.safeParse(json);
  if (!parsed.success) return fail(400, "VALIDATION_ERROR", "Проверьте поля формы", { fields: z.flattenError(parsed.error).fieldErrors });
  const b = parsed.data;
  if (store.vehicles.some((v) => v.make === b.make && v.model === b.model && v.generation === b.generation)) {
    return fail(409, "CONFLICT", `${b.make} ${b.model} ${b.generation} уже есть в справочнике`);
  }
  store.seq += 1;
  const row: AdminVehicleRow = { ...b, id: `c1000000-0000-4000-8000-${String(store.seq).padStart(12, "0")}`, fitting_products_count: 0 };
  store.vehicles.push(row);
  return ok({ id: row.id, label: vehicleLabel(row) }, 201);
}

export function patchVehicle(store: AdminFixtureStore, id: string, json: unknown): FixtureResponse {
  const idx = store.vehicles.findIndex((v) => v.id === id);
  if (idx < 0) return notFound("Автомобиль не найден");
  if (isRecord(json) && Object.keys(json).length === 1 && "is_active" in json && store.failVehicleToggle > 0) {
    store.failVehicleToggle -= 1;
    return fail(500, "INTERNAL_ERROR", "Что-то пошло не так. Мы уже разбираемся");
  }
  const { id: _id, fitting_products_count: _count, ...current } = store.vehicles[idx];
  void _id; void _count;
  const parsed = vehicleUpsertBody.safeParse({ ...current, ...(isRecord(json) ? json : {}) });
  if (!parsed.success) return fail(400, "VALIDATION_ERROR", "Проверьте поля формы", { fields: z.flattenError(parsed.error).fieldErrors });
  store.vehicles[idx] = { ...parsed.data, id, fitting_products_count: 0 };
  return ok({ id, ...(isRecord(json) ? json : {}), fitting_products_count: fittingCount(store, store.vehicles[idx]) });
}

export function deleteVehicle(store: AdminFixtureStore, id: string): FixtureResponse {
  if (!store.vehicles.some((v) => v.id === id)) return notFound("Автомобиль не найден");
  store.vehicles = store.vehicles.filter((v) => v.id !== id);
  return ok({ deleted: true });
}
