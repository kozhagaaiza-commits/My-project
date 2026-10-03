import "server-only";
import { repriceWithServiceRole } from "@/lib/admin/products/reprice-real";
import { selectLatestRates } from "@/lib/admin/settings-db";
import { ratesDate } from "@/lib/admin/summary";
import { refreshRates } from "@/lib/cbr";
import { createExchangeRatesRepo } from "@/lib/cbr-repo";
import { env } from "@/lib/env";
import { processNotificationQueue } from "@/lib/notifications/dispatch";
import { rpcCancelExpiredOrders } from "@/lib/orders/db";
import { reconcileStalePayments } from "@/lib/payments/reconcile";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTelegramClient } from "@/lib/telegram";
import type { CronDeps } from "@/app/api/cron/daily/handler";

// Реальные зависимости cron (5.12). Service-role клиент (5.10: «cron»), новый на каждый шаг — сессий нет.
// Бюджет разбора очереди оставляет запас до maxDuration маршрута: курс (до ~37 с) + сверка + очередь.

export const CRON_QUEUE_LIMIT = 50;
export const CRON_QUEUE_BUDGET_MS = 20_000;

export function createCronDeps(): CronDeps {
  return {
    secret: env.CRON_SECRET,
    refreshRates: () => refreshRates({ repo: createExchangeRatesRepo(createAdminClient()) }),
    repriceProducts: () => repriceWithServiceRole(new Date()),
    cancelExpiredOrders: () => rpcCancelExpiredOrders(createAdminClient()),
    reconcilePayments: async () => {
      const { checked, paid, failed } = await reconcileStalePayments();
      return { checked, paid, failed };
    },
    processQueue: () => processNotificationQueue({ limit: CRON_QUEUE_LIMIT, budgetMs: CRON_QUEUE_BUDGET_MS }),
    cleanupRateLimits: async (olderThan) => {
      const { error, count } = await createAdminClient().from("rate_limit_hits")
        .delete({ count: "exact" }).lt("window_start", olderThan.toISOString());
      if (error) throw new Error(`rate_limit_hits.cleanup: ${error.code ?? ""} ${error.message}`);
      return count ?? 0;
    },
    latestRateDate: async () => ratesDate(await selectLatestRates(createAdminClient())),
    alertAdmin: async (text) => (await (await getTelegramClient()).sendMessage(env.TELEGRAM_ADMIN_CHAT_ID, text)).kind === "ok",
    now: () => new Date(),
  };
}
