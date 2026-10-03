import { authorizeAdminApi } from "@/lib/admin/api-guard";
import { selectAppSettings, selectLatestRates, updateAppSettings } from "@/lib/admin/settings-db";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSettingsHandlers } from "./handler";

// GET / PATCH /api/admin/settings — множитель наценки, округление, автопересчёт, курсы ЦБ (Блок 3). Логика — handler.ts.
// Service-role (5.10: админские эндпоинты) — только после authorizeAdminApi.

const handlers = createSettingsHandlers({
  authorize: (request, opts) => authorizeAdminApi(request, opts),
  selectSettings: () => selectAppSettings(createAdminClient()),
  updateSettings: (patch) => updateAppSettings(createAdminClient(), patch),
  selectLatestRates: () => selectLatestRates(createAdminClient()),
});

export async function GET(request: Request) {
  return handlers.GET(request);
}

export async function PATCH(request: Request) {
  return handlers.PATCH(request);
}
