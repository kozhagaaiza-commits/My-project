import "server-only";
import { apiError } from "@/lib/api-error";
import { assertSameOrigin } from "@/lib/csrf";

// ВРЕМЕННАЯ тонкая обёртка проверки админа для POST /api/admin/orders/[id]/refund (День 6). Форма результата и порядок
// совпадают с authorizeAdminApi из src/lib/admin/guard.ts (backend-engineer): замена — одна строка в route.ts возврата
// (`authorize: authorizeAdminApi` из "@/lib/admin/guard"), после чего этот файл удаляется.
// Порядок (3.0, 5.10): сессия (нет пользователя → 401) → роль (не admin → 403) → Origin на мутациях (403, A27) →
// лимит /api/admin/* 300 / 60 с на пользователя (`admin:<user.id>`, fail-open). Всё — до любой работы с заказом.
// auth.ts и rate-limit.ts подключаются динамически: модуль не разбирает env при импорте (тесты без Supabase).

export type AdminApiAuthResult = { ok: true; admin: { userId: string } } | { ok: false; response: Response };

export interface AdminAuthDeps {
  /** Пользователь из auth.getUser() и роль из profiles (getSessionContext). */
  getSession(): Promise<{ userId: string | null; role: string | null }>;
  assertSameOrigin(request: Request): Response | null;
  /** true — разрешено; может бросать (→ пропуск, fail-open, ошибка в логе). */
  checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export const ADMIN_RATE_LIMIT = { limit: 300, windowSeconds: 60 } as const;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const deny = (response: Response): AdminApiAuthResult => ({ ok: false, response });

export function createAuthorizeAdminApi(deps: AdminAuthDeps) {
  return async function authorizeAdminApi(request: Request): Promise<AdminApiAuthResult> {
    const { userId, role } = await deps.getSession();
    if (!userId) return deny(apiError("UNAUTHORIZED", "Войдите в аккаунт", 401));
    if (role !== "admin") return deny(apiError("FORBIDDEN", "Недостаточно прав", 403));
    if (!SAFE_METHODS.has(request.method.toUpperCase())) {
      const forbidden = deps.assertSameOrigin(request);
      if (forbidden) return deny(forbidden);
    }
    const { limit, windowSeconds } = ADMIN_RATE_LIMIT;
    let allowed = true;
    try {
      allowed = await deps.checkRateLimit(`admin:${userId}`, limit, windowSeconds);
    } catch (err) {
      console.error({ scope: "admin.rate-limit", failOpen: true, err });
    }
    if (!allowed) {
      const res = apiError("RATE_LIMITED", "Слишком много запросов. Повторите через минуту", 429, { retry_after_seconds: windowSeconds });
      res.headers.set("Retry-After", String(windowSeconds));
      return deny(res);
    }
    return { ok: true, admin: { userId } };
  };
}

/** Реальные зависимости: getSessionContext (auth.getUser + profiles.role), csrf.ts, check_rate_limit. */
export const authorizeAdminApi = createAuthorizeAdminApi({
  getSession: async () => {
    const { getSessionContext } = await import("@/lib/auth");
    const ctx = await getSessionContext();
    const role: unknown = ctx.role;
    return { userId: ctx.user?.id ?? null, role: typeof role === "string" ? role : null };
  },
  assertSameOrigin,
  checkRateLimit: async (key, limit, windowSeconds) => (await import("@/lib/rate-limit")).checkRateLimit(key, limit, windowSeconds),
});
