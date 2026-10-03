import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ilikeTerm } from "@/lib/admin/products/db";
import { DbError } from "@/lib/orders/errors";
import { ADMIN_VEHICLE_COLUMNS, adminVehicleRow, type AdminVehiclesRepo } from "./repo";

// Реальный AdminVehiclesRepo: таблица vehicles — сессионный клиент (RLS: select/insert/update/delete is_admin()),
// RPC find_wheels_for_vehicle — service-role после проверки роли (A21, 5.10 «админские эндпоинты»).

interface PgError { message: string; code?: string; details?: string | null }
interface PgResult { data: unknown; error: PgError | null; count?: number | null }

function check(scope: string, res: PgResult): unknown {
  if (res.error) throw new DbError(scope, res.error.code || undefined, [res.error.message, res.error.details].filter(Boolean).join(" | "));
  return res.data;
}

const idRow = z.object({ id: z.string() });
const fitRow = z.object({ product_id: z.string() });

export function createAdminVehiclesRepo(c: SupabaseClient, service: () => SupabaseClient): AdminVehiclesRepo {
  return {
    async list(f) {
      let q = c.from("vehicles").select(ADMIN_VEHICLE_COLUMNS, { count: "exact" });
      if (f.make) q = q.eq("make", f.make);
      if (f.q) {
        const t = ilikeTerm(f.q);
        q = q.or(`model.ilike.%${t}%,generation.ilike.%${t}%`);
      }
      const from = (f.page - 1) * f.perPage;
      const res = await q.order("make").order("model").order("year_from").order("generation")
        .range(from, from + f.perPage - 1);
      return { rows: adminVehicleRow.array().parse(check("admin.vehicles.list", res) ?? []), total: res.count ?? 0 };
    },

    async get(id) {
      const data = check("admin.vehicles.one", await c.from("vehicles").select(ADMIN_VEHICLE_COLUMNS).eq("id", id).maybeSingle());
      return data === null || data === undefined ? null : adminVehicleRow.parse(data);
    },

    async insert(v) {
      const data = check("admin.vehicles.insert", await c.from("vehicles").insert(v).select(ADMIN_VEHICLE_COLUMNS).single());
      return adminVehicleRow.parse(data);
    },

    async update(id, patch) {
      const data = check("admin.vehicles.update",
        await c.from("vehicles").update(patch).eq("id", id).select(ADMIN_VEHICLE_COLUMNS).maybeSingle());
      return data === null || data === undefined ? null : adminVehicleRow.parse(data);
    },

    async delete(id) {
      const data = check("admin.vehicles.delete", await c.from("vehicles").delete().eq("id", id).select("id"));
      return idRow.array().parse(data ?? []).length > 0;
    },

    async fittingWheelsCount(vehicleId) {
      const data = check("admin.rpc.find_wheels_for_vehicle", await service().rpc("find_wheels_for_vehicle", { p_vehicle_id: vehicleId }));
      return fitRow.array().parse(data ?? []).length;
    },
  };
}
