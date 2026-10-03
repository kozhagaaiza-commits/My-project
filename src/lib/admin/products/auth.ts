import { apiError } from "@/lib/api-error";

// Проверка администратора для /api/admin/products*, /api/admin/vehicles*, /api/admin/prices/* (Блок 3.0, 5.10).
//
// ВРЕМЕННАЯ обёртка (День 6): requireAdminApi в src/lib/admin/guard.ts добавляет backend A. Когда он появится,
// route.ts этой зоны импортируют `requireAdmin` из ./require-admin.ts, поэтому замена — одна строка там
// (`export { requireAdminApi as requireAdmin } from "@/lib/admin/guard"`), при условии того же контракта:
// (request) => Promise<Response | null>, null — запрос от администратора. Здесь — чистая логика (тестируется).
//
// Порядок (как в shim других маршрутов и в 3.0): сессия (401) → роль (403) → Origin на мутациях (403, A27)
// → rate limit `admin:<user.id>` 300 / 60 с (5.10), 429 + Retry-After.
// Origin проверяется только для POST/PATCH/PUT/DELETE: браузер не шлёт Origin в same-origin GET.

export type RequireAdmin = (request: Request) => Promise<Response | null>;

export interface AdminSession {
  userId: string | null;
  role: string | null;
}

export interface RequireAdminDeps {
  getSession(): Promise<AdminSession>;
  assertSameOrigin(request: Request): Response | null;
  /** true — разрешено. Ключ, лимит, окно. */
  checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

/** Лимит /api/admin/* из таблицы 5.10: 300 на пользователя за 60 с. */
export const ADMIN_RATE_LIMIT = { limit: 300, windowSeconds: 60 } as const;
const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function createRequireAdmin(deps: RequireAdminDeps): RequireAdmin {
  return async (request) => {
    const s = await deps.getSession();
    if (!s.userId) return apiError("UNAUTHORIZED", "Войдите в аккаунт", 401);
    if (s.role !== "admin") return apiError("FORBIDDEN", "Недостаточно прав", 403);
    if (MUTATING.has(request.method.toUpperCase())) {
      const forbidden = deps.assertSameOrigin(request);
      if (forbidden) return forbidden;
    }
    const { limit, windowSeconds } = ADMIN_RATE_LIMIT;
    if (!(await deps.checkRateLimit(`admin:${s.userId}`, limit, windowSeconds))) {
      const res = apiError("RATE_LIMITED", "Слишком много запросов. Повторите через минуту", 429, { retry_after_seconds: windowSeconds });
      res.headers.set("Retry-After", String(windowSeconds));
      return res;
    }
    return null;
  };
}
