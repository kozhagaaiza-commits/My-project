import type { AdminApiAuth } from "@/lib/admin/api-guard";
import { adminInternalError, adminOk, adminValidationError, noStore, readJsonBody } from "@/lib/admin/http";
import type { AppSettingsRow, LatestRates } from "@/lib/admin/settings-db";
import { toIsoUtc } from "@/lib/admin/timestamps";
import { MARKUP_MULTIPLIER_MESSAGE, settingsPatchBody, type SettingsPatchBody } from "@/lib/schemas/admin-settings";
import { z } from "zod";

// GET / PATCH /api/admin/settings (Блок 3 «Админка — настройки»; Блок 4 «Админка — Настройки»). Зависимости внедряются.
// GET: admin → app_settings + последние курсы USD/CNY → { data }. Валюта без курса в rates не попадает
// (экран показывает «Курс ещё не загружался»).
// PATCH: admin + Origin → JSON + Zod → update app_settings (только переданные поля; {} — без записи) → { data }.
// 400: при ошибке множителя message = «Множитель от 1.00 до 5.00» (пример Блока 3), иначе общий текст формы.

export interface SettingsDeps {
  authorize(request: Request, opts?: { mutation?: boolean }): Promise<AdminApiAuth>;
  selectSettings(): Promise<AppSettingsRow>;
  updateSettings(patch: SettingsPatchBody): Promise<AppSettingsRow>;
  selectLatestRates(): Promise<LatestRates>;
}

const settingsData = (s: AppSettingsRow) => ({
  markup_multiplier: s.markup_multiplier,
  price_rounding_rub: s.price_rounding_rub,
  auto_reprice: s.auto_reprice,
  reprice_threshold: s.reprice_threshold,
});

async function handleGet(request: Request, deps: SettingsDeps): Promise<Response> {
  const auth = await deps.authorize(request);
  if (!auth.ok) return auth.response;
  const [settings, rates] = await Promise.all([deps.selectSettings(), deps.selectLatestRates()]);
  return adminOk({ ...settingsData(settings), rates, updated_at: toIsoUtc(settings.updated_at) });
}

async function handlePatch(request: Request, deps: SettingsDeps): Promise<Response> {
  const auth = await deps.authorize(request, { mutation: true });
  if (!auth.ok) return auth.response;
  const body = settingsPatchBody.safeParse(await readJsonBody(request));
  if (!body.success) {
    const fields = z.flattenError(body.error).fieldErrors;
    return fields.markup_multiplier ? adminValidationError(body.error, MARKUP_MULTIPLIER_MESSAGE) : adminValidationError(body.error);
  }
  const patch = Object.fromEntries(Object.entries(body.data).filter(([, v]) => v !== undefined)) as SettingsPatchBody;
  const saved = Object.keys(patch).length === 0 ? await deps.selectSettings() : await deps.updateSettings(patch);
  return adminOk({ ...settingsData(saved), updated_at: toIsoUtc(saved.updated_at) });
}

export function createSettingsHandlers(deps: SettingsDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      try {
        return noStore(await handleGet(request, deps));
      } catch (err) {
        return noStore(adminInternalError("admin.settings.get", err));
      }
    },
    async PATCH(request: Request): Promise<Response> {
      try {
        return noStore(await handlePatch(request, deps));
      } catch (err) {
        return noStore(adminInternalError("admin.settings.patch", err));
      }
    },
  };
}
