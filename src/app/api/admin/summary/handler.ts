import type { AdminApiAuth } from "@/lib/admin/api-guard";
import { adminInternalError, adminOk, noStore } from "@/lib/admin/http";
import { buildAdminSummary, type SummaryRepo } from "@/lib/admin/summary";

// Тело GET /api/admin/summary (Блок 3; Блок 4 «Админка — Сводка»; 5.9.2 «Fallback»; A40; BACKLOG «Повторы очереди»).
// Порядок: admin (401 / 403 / 429) → запуск разбора notification_queue (не более 10 строк, ПОСЛЕ ответа через after(),
// ответ не ждёт; сбой — в лог) → метрики → { data }. Разбор очереди запускается и при ошибке метрик: повторы
// уведомлений не должны зависеть от сводки.

export interface SummaryDeps {
  authorize(request: Request): Promise<AdminApiAuth>;
  /** Репозиторий создаётся ПОСЛЕ проверки admin (service-role клиент). */
  repo(): SummaryRepo;
  /** kickNotificationQueue(10): processNotificationQueue({ limit: 10 }) после ответа; не бросает. */
  kickNotificationQueue(): Promise<void>;
  featureAtelier: boolean;
  now(): Date;
}

export const SUMMARY_QUEUE_LIMIT = 10;

async function handle(request: Request, deps: SummaryDeps): Promise<Response> {
  const auth = await deps.authorize(request);
  if (!auth.ok) return auth.response;
  try {
    await deps.kickNotificationQueue();
  } catch (err) {
    console.error({ scope: "admin.summary.queue", err });
  }
  return adminOk(await buildAdminSummary(deps.repo(), { now: deps.now(), featureAtelier: deps.featureAtelier }));
}

export function createSummaryHandler(deps: SummaryDeps) {
  return async function GET(request: Request): Promise<Response> {
    try {
      return noStore(await handle(request, deps));
    } catch (err) {
      return noStore(adminInternalError("admin.summary", err));
    }
  };
}
