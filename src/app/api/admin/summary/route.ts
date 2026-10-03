import { authorizeAdminApi } from "@/lib/admin/api-guard";
import { createSummaryRepo } from "@/lib/admin/summary-db";
import { FEATURE_ATELIER } from "@/lib/config";
import { kickNotificationQueue } from "@/lib/notifications/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUMMARY_QUEUE_LIMIT, createSummaryHandler } from "./handler";

// GET /api/admin/summary — сводка /admin + разбор просроченных уведомлений (не более 10 за вызов, после ответа).
// Логика — handler.ts. Service-role (5.10) — только после authorizeAdminApi; репозиторий создаётся на запрос после неё.
// Потолок функции: разбор очереди в after() ограничен бюджетом processNotificationQueue (25 с).
export const maxDuration = 30;

const handler = createSummaryHandler({
  authorize: (request) => authorizeAdminApi(request),
  repo: () => createSummaryRepo(createAdminClient()),
  kickNotificationQueue: () => kickNotificationQueue(SUMMARY_QUEUE_LIMIT),
  featureAtelier: FEATURE_ATELIER,
  now: () => new Date(),
});

export async function GET(request: Request) {
  return handler(request);
}
