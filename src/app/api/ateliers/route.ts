import { atelierAppliedNotification } from "@/lib/ateliers/notify";
import { getAtelierSession } from "@/lib/ateliers/session";
import { FEATURE_ATELIER } from "@/lib/config";
import { assertSameOrigin } from "@/lib/csrf";
import { env } from "@/lib/env";
import { getDefaultNotifyDeps } from "@/lib/notifications/deps";
import { safeEnqueue } from "@/lib/notifications/safe-enqueue";
import { limitAtelierApply } from "@/lib/rate-limit";
import { createAtelierApplyHandler } from "./handler";

// POST /api/ateliers (Блок 3). Логика — в handler.ts. Заявка пишется сессионным клиентом (RLS);
// service-role — только check_rate_limit и notification_queue (как у остальных эндпоинтов).

const handler = createAtelierApplyHandler({
  featureAtelier: FEATURE_ATELIER,
  assertSameOrigin,
  getSession: getAtelierSession,
  limitApply: limitAtelierApply,
  notifyApplied: async (a) => {
    try {
      await safeEnqueue(await getDefaultNotifyDeps(), () => [atelierAppliedNotification(env.TELEGRAM_ADMIN_CHAT_ID, a)]);
    } catch (err) {
      console.error({ scope: "ateliers.apply.notify", err });
    }
  },
});

export async function POST(request: Request) {
  return handler(request);
}
