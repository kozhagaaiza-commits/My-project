import { authorizeAdminApi } from "@/lib/admin/api-guard";
import { createAdminAteliersRepo } from "@/lib/ateliers/admin-deps";
import { FEATURE_ATELIER } from "@/lib/config";
import { createAdminAteliersListHandler } from "./handler";

// GET /api/admin/ateliers (Блок 3). Логика — в handler.ts; service-role — только после authorizeAdminApi.

const handler = createAdminAteliersListHandler({
  featureAtelier: FEATURE_ATELIER,
  authorize: (request) => authorizeAdminApi(request),
  repo: createAdminAteliersRepo,
});

export async function GET(request: Request) {
  return handler(request);
}
