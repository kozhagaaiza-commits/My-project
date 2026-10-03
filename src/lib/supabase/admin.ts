import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Service-role клиент: обходит RLS. Разрешён ТОЛЬКО в местах из Блока 5.10:
// публичное чтение каталога (PUBLIC_PRODUCT_COLUMNS), create_order, mark_order_paid,
// webhook'и, cron, смена роли при одобрении ателье.
// Функция, а не синглтон: новый клиент на вызов, сессия не хранится.
export function createAdminClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
