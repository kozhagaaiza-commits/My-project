import "server-only";
import { requireAdmin } from "@/lib/admin/products/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminVehiclesRepo } from "./db";
import type { AdminVehiclesDeps } from "./deps";

// Реальные зависимости route.ts справочника автомобилей: сессионный клиент на запрос, service-role — только RPC.

export const adminVehiclesDeps: AdminVehiclesDeps = {
  requireAdmin,
  repo: async () => createAdminVehiclesRepo(await createClient(), createAdminClient),
};
