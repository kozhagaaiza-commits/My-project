import "server-only";
import { getSessionContext } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { createRequireAdmin, type RequireAdmin } from "./auth";

// Реальные зависимости проверки администратора (см. ./auth.ts).
// TODO(День 6): когда в src/lib/admin/guard.ts появится requireAdminApi с контрактом (request) => Promise<Response | null>
// и лимитом 300 / 60 с — заменить тело файла одной строкой:
//   export { requireAdminApi as requireAdmin } from "@/lib/admin/guard";
// Пользователь — только auth.getUser() (внутри getSessionContext). Лимиты админки fail-open: сбой таблицы лимитов
// не должен запирать администратора (доступ уже ограничен ролью).

export const requireAdmin: RequireAdmin = createRequireAdmin({
  getSession: async () => {
    const ctx = await getSessionContext();
    const role: unknown = ctx.role;
    return { userId: ctx.user?.id ?? null, role: typeof role === "string" ? role : null };
  },
  assertSameOrigin,
  checkRateLimit: (key, limit, windowSeconds) => checkRateLimit(key, limit, windowSeconds, { failOpen: true }),
});
