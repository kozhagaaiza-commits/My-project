import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectAppSettings } from "../settings-db";
import { autoRepriceAfterRates } from "./auto-reprice";
import { createAdminProductsRepo } from "./db";

/**
 * Автопересчёт цен на service-role клиенте (5.4; 5.12 шаг 2; ручная загрузка курса в админке): без сессии администратора,
 * тот же код расчёта, что POST /api/admin/prices/recalculate (recalc.ts). Вызывать только из cron и после authorizeAdminApi.
 */
export async function repriceWithServiceRole(now: Date) {
  const client = createAdminClient();
  return autoRepriceAfterRates(createAdminProductsRepo(client, createAdminClient), await selectAppSettings(client), now);
}
