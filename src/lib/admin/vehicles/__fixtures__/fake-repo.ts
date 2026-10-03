import { DbError } from "@/lib/orders/errors";
import type { RequireAdmin } from "@/lib/admin/products/auth";
import type { AdminVehiclesDeps } from "@/lib/admin/vehicles/deps";
import type { AdminVehicleRow, AdminVehiclesRepo, VehicleListFilter } from "@/lib/admin/vehicles/repo";
import type { VehicleUpsertBody } from "@/lib/schemas/admin-vehicles";

// In-memory справочник автомобилей для node:test: unique (make, model, generation) → 23505, как в 2.3.

export const G30 = "6f2d8a41-9c3e-4b75-a0d2-3e8f1c7b9d64";
export const NEW_VEHICLE = "f5a2c8e1-3b9d-4f7a-8e60-2d4c1b9e7f36";

export const g30 = (over: Partial<AdminVehicleRow> = {}): AdminVehicleRow => ({
  id: G30, make: "BMW", model: "5 Series", generation: "G30", year_from: 2017, year_to: 2023, pcd: "5x112",
  center_bore_mm: 66.6, seat_type: "cone60", fastener_spec: "Болт M14×1.25", diameter_min_in: 18, diameter_max_in: 21,
  width_min_in: 8, width_max_in: 10, et_min_mm: 20, et_max_mm: 40, is_active: true, ...over,
});

export class FakeVehiclesDb implements AdminVehiclesRepo {
  rows = new Map<string, AdminVehicleRow>();
  fitting = new Map<string, number>();
  calls: Array<[string, ...unknown[]]> = [];

  constructor(...rows: AdminVehicleRow[]) {
    for (const r of rows) this.rows.set(r.id, { ...r });
  }
  private unique(v: AdminVehicleRow) {
    for (const r of this.rows.values()) {
      if (r.id !== v.id && r.make === v.make && r.model === v.model && r.generation === v.generation) {
        throw new DbError("fake.vehicles", "23505", 'duplicate key value violates unique constraint "vehicles_make_model_generation_key"');
      }
    }
  }
  async list(f: VehicleListFilter) {
    this.calls.push(["list", f]);
    const all = [...this.rows.values()].filter((r) => (!f.make || r.make === f.make)
      && (!f.q || `${r.model} ${r.generation}`.toLowerCase().includes(f.q.toLowerCase())));
    return { rows: all.slice((f.page - 1) * f.perPage, f.page * f.perPage), total: all.length };
  }
  async get(id: string) {
    this.calls.push(["get", id]);
    return this.rows.get(id) ?? null;
  }
  async insert(v: VehicleUpsertBody) {
    this.calls.push(["insert", v]);
    const row = { id: NEW_VEHICLE, ...v };
    this.unique(row);
    this.rows.set(row.id, row);
    return row;
  }
  async update(id: string, patch: Partial<VehicleUpsertBody>) {
    this.calls.push(["update", id, patch]);
    const cur = this.rows.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    this.unique(next);
    this.rows.set(id, next);
    return next;
  }
  async delete(id: string) {
    this.calls.push(["delete", id]);
    return this.rows.delete(id);
  }
  async fittingWheelsCount(id: string) {
    this.calls.push(["fittingWheelsCount", id]);
    return this.fitting.get(id) ?? 0;
  }
}

export function fakeVehicleDeps(db: FakeVehiclesDb) {
  const admin: { deny: Response | null; calls: number } = { deny: null, calls: 0 };
  const requireAdmin: RequireAdmin = async () => {
    admin.calls++;
    return admin.deny;
  };
  const deps: AdminVehiclesDeps = { requireAdmin, repo: async () => db };
  return { deps, admin };
}
