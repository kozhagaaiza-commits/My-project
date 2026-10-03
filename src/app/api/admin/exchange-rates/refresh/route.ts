import { requireAdminApi } from "@/lib/admin-auth-shim"; // → "@/lib/admin/guard", когда backend A добавит requireAdminApi
import { refreshRates } from "@/lib/cbr";
import { createExchangeRatesRepo } from "@/lib/cbr-repo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRefreshRatesHandler } from "./handler";

// POST /api/admin/exchange-rates/refresh — загрузить курс ЦБ сейчас (Блок 3; тот же код, что шаг 1 cron).
// Service-role: insert в exchange_rates разрешён только серверу (2.12, 5.10). Логика — в handler.ts.
// До 3 попыток × 10 с + паузы 2 и 5 с ≈ 37 с в худшем случае — потолок функции с запасом.
export const maxDuration = 60;

const handler = createRefreshRatesHandler({
  requireAdmin: requireAdminApi,
  // Автопересчёт цен (День 7): передать onNewRates в refreshRates — см. RefreshDeps.
  refresh: () => refreshRates({ repo: createExchangeRatesRepo(createAdminClient()) }),
});

export async function POST(request: Request) {
  return handler(request);
}
