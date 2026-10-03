import "server-only";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminProductsRepo, createImageStorage } from "./db";
import type { AdminProductsDeps } from "./deps";
import { requireAdmin } from "./require-admin";

// Реальные зависимости для route.ts админки товаров. Клиенты создаются на каждый запрос (после requireAdmin):
// сессионный — для таблиц и Storage (RLS / политики is_admin()), service-role — только RPC reserved_qty_map.

export const adminProductsDeps: AdminProductsDeps = {
  requireAdmin,
  repo: async () => createAdminProductsRepo(await createClient(), createAdminClient),
  storage: async () => createImageStorage(await createClient()),
  supabaseUrl: () => env.NEXT_PUBLIC_SUPABASE_URL,
  now: () => new Date(),
  randomUUID: () => randomUUID(),
};
