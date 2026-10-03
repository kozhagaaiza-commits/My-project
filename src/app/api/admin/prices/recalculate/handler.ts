import { apiError } from "@/lib/api-error";
import type { AdminProductsDeps } from "@/lib/admin/products/deps";
import { okJson, readJson, runAdmin, zodError } from "@/lib/admin/products/http";
import { recalculateAutoPrices } from "@/lib/admin/products/recalc";
import { pricesRecalculateBody } from "@/lib/schemas/admin-products";

// POST /api/admin/prices/recalculate (Блок 3; 5.4): пересчёт всех pricing_mode = 'auto' товаров по последнему курсу
// той же computeAutoPrice. dry_run — только показать изменения. Расчёт и правила пропусков — общий код с cron
// (src/lib/admin/products/recalc.ts, 5.12 шаг 2).

async function recalculate(request: Request, deps: AdminProductsDeps): Promise<Response> {
  const denied = await deps.requireAdmin(request);
  if (denied) return denied;
  const parsed = pricesRecalculateBody.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  const result = await recalculateAutoPrices(await deps.repo(), { dryRun: parsed.data.dry_run, now: deps.now() });
  if (result.kind === "rate_not_loaded") return apiError("RATE_NOT_LOADED", `Курс ${result.currency} не загружен`, 422);
  return okJson(result.data);
}

export function createRecalculateHandler(deps: AdminProductsDeps) {
  return { POST: (request: Request) => runAdmin("admin.prices.recalculate", () => recalculate(request, deps)) };
}
