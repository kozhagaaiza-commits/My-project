import { authorizeAdminApi } from "@/lib/admin/api-guard";
import { createAdminAteliersRepo } from "@/lib/ateliers/admin-deps";
import { FEATURE_ATELIER } from "@/lib/config";
import { getDefaultNotifyDeps } from "@/lib/notifications/deps";
import { safeEnqueue } from "@/lib/notifications/safe-enqueue";
import { createAdminAtelierReviewHandler } from "./handler";

// PATCH /api/admin/ateliers/[id] (Блок 3). Логика — в handler.ts; service-role — только после authorizeAdminApi.

const handler = createAdminAtelierReviewHandler({
  featureAtelier: FEATURE_ATELIER,
  authorize: (request) => authorizeAdminApi(request),
  repo: createAdminAteliersRepo,
  enqueue: async (n) => {
    try {
      await safeEnqueue(await getDefaultNotifyDeps(), () => [n]);
    } catch (err) {
      console.error({ scope: "admin.ateliers.review.notify", err });
    }
  },
  now: () => new Date(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(request, { params });
}
