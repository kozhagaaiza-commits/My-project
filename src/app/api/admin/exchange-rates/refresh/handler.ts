import { apiError } from "@/lib/api-error";
import { CbrError, type RefreshResult } from "@/lib/cbr";
import { PRIVATE_NO_STORE, internalError, ok } from "@/lib/catalog/http";

// Тело POST /api/admin/exchange-rates/refresh с внедряемыми зависимостями (Блок 3, route.ts — тонкая обёртка).
// Тот же код, что шаг 1 cron (refreshRates). Тело запроса `{}` не используется и не разбирается.
// Порядок: админ (401 / 403, Origin) → загрузка курса → 200 | 502 | 500.

/** Единственный текст 502 из Блока 3; для любых отказов ЦБ (таймаут, HTTP, битый XML) — других текстов в Чертеже нет. */
export const CBR_UNAVAILABLE_MESSAGE = "Сайт ЦБ не ответил за 10 секунд. Повторите позже";

export interface RefreshRatesDeps {
  /** null — запрос от администратора; иначе готовый 401 / 403. */
  requireAdmin(request: Request): Promise<Response | null>;
  refresh(): Promise<RefreshResult>;
}

async function handle(request: Request, deps: RefreshRatesDeps): Promise<Response> {
  try {
    const denied = await deps.requireAdmin(request);
    if (denied) return denied;
    const data = await deps.refresh();
    return ok(data, PRIVATE_NO_STORE);
  } catch (err) {
    if (err instanceof CbrError) {
      console.error({ scope: "admin.exchange-rates.refresh", kind: err.kind, message: err.message });
      return apiError("PAYMENT_PROVIDER_ERROR", CBR_UNAVAILABLE_MESSAGE, 502);
    }
    return internalError("admin.exchange-rates.refresh", err);
  }
}

export function createRefreshRatesHandler(deps: RefreshRatesDeps) {
  return async function POST(request: Request): Promise<Response> {
    const res = await handle(request, deps);
    res.headers.set("Cache-Control", PRIVATE_NO_STORE);
    return res;
  };
}
