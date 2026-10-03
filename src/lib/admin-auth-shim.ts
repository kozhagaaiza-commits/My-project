import "server-only";
import { apiError } from "@/lib/api-error";
import { getSessionContext } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/csrf";

// ВРЕМЕННАЯ обёртка (День 6): настоящий requireAdminApi — в src/lib/admin/guard.ts (backend A). Когда он появится,
// в route.ts меняется один импорт: `import { requireAdminApi } from "@/lib/admin/guard"` (см. 3.0).
// Порядок как в 3.0 / 5.10: сессия (401) → роль (403) → Origin на мутациях (403).
// Возвращает готовый Response-ошибку или null, если запрос от администратора.
// Rate limit /api/admin/* (300 / 60 с на пользователя) — в настоящем guard'е, здесь не дублируется.
export async function requireAdminApi(request: Request): Promise<Response | null> {
  // Dev-подмена как в guard.ts: инлайн-условие, чтобы бандлер вырезал её из production.
  if (process.env.NODE_ENV !== "production" && process.env.ADMIN_FIXTURES === "1") return assertSameOrigin(request);
  const ctx = await getSessionContext();
  if (!ctx.user) return apiError("UNAUTHORIZED", "Войдите в аккаунт", 401);
  if (ctx.role !== "admin") return apiError("FORBIDDEN", "Недостаточно прав", 403);
  return assertSameOrigin(request);
}
