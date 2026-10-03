import "server-only";
import { apiError } from "@/lib/api-error";
import { assertSameOrigin } from "@/lib/csrf";

// Проверка /api/admin/* — отдельный модуль без next/navigation (его реэкспортирует guard.ts): обработчики и тесты
// не тянут клиентский рантайм навигации. Сессия (auth.ts → next/headers) и лимиты (rate-limit.ts → env.ts) — лениво.

export interface AdminApiContext {
  userId: string;
  email: string | null;
}

/** Фиктивный админ dev-подмены ADMIN_FIXTURES=1 (только вне production) — тот же, что у requireAdminPage. */
export const FIXTURE_ADMIN: AdminApiContext = { userId: "00000000-0000-4000-8000-000000000001", email: "admin@fixtures.local" };

// ---------- /api/admin/* (Блок 3.0, 5.10; Edge Case 23) ----------
// Порядок: сессия (401 «Войдите в аккаунт») → роль (403 «Недостаточно прав») → Origin на мутациях (403, A27) →
// rate limit 300 / 60 с на пользователя (ключ admin:<user.id>, 429 + Retry-After). Всё — ДО любой работы обработчика.
// Rate limit fail-open: сбой таблицы лимитов не должен блокировать админку (доступ уже проверен), ошибка — в лог.

export const ADMIN_RATE_LIMIT = { limit: 300, windowSeconds: 60 } as const;

/** 429 из 3.0 + Retry-After (как rateLimitedResponse в rate-limit.ts; тот модуль тянет env — импортируется лениво). */
function adminRateLimited(retryAfterSeconds: number): Response {
  const res = apiError("RATE_LIMITED", "Слишком много запросов. Повторите через минуту", 429, { retry_after_seconds: retryAfterSeconds });
  res.headers.set("Retry-After", String(retryAfterSeconds));
  return res;
}

export interface AdminApiOptions {
  /** Проверять Origin (CSRF). По умолчанию — для всех методов, кроме GET/HEAD/OPTIONS. */
  mutation?: boolean;
}

export type AdminApiAuth = { ok: true; admin: AdminApiContext } | { ok: false; response: Response };

export interface AdminApiDeps {
  /** Сессия: user из auth.getUser(), role из profiles. */
  getSession(): Promise<{ user: { id: string; email?: string | null } | null; role: string | null }>;
  assertSameOrigin(request: Request): Response | null;
  /** true — разрешено. Может бросать: ошибка → запрос пропускается (fail-open) с записью в лог. */
  checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

const isMutation = (request: Request, opts: AdminApiOptions) =>
  opts.mutation ?? !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());

export async function authorizeAdminApiWith(deps: AdminApiDeps, request: Request, opts: AdminApiOptions = {}): Promise<AdminApiAuth> {
  const session = await deps.getSession();
  if (!session.user) return { ok: false, response: apiError("UNAUTHORIZED", "Войдите в аккаунт", 401) };
  if (session.role !== "admin") return { ok: false, response: apiError("FORBIDDEN", "Недостаточно прав", 403) };
  if (isMutation(request, opts)) {
    const denied = deps.assertSameOrigin(request);
    if (denied) return { ok: false, response: denied };
  }
  const userId = session.user.id;
  let allowed = true;
  try {
    allowed = await deps.checkRateLimit(`admin:${userId}`, ADMIN_RATE_LIMIT.limit, ADMIN_RATE_LIMIT.windowSeconds);
  } catch (err) {
    console.error({ scope: "admin.rate-limit", failOpen: true, err });
  }
  if (!allowed) return { ok: false, response: adminRateLimited(ADMIN_RATE_LIMIT.windowSeconds) };
  return { ok: true, admin: { userId, email: session.user.email ?? null } };
}

const defaultAdminApiDeps: AdminApiDeps = {
  getSession: async () => {
    const ctx = await (await import("@/lib/auth")).getSessionContext();
    const role: unknown = ctx.role;
    return { user: ctx.user, role: typeof role === "string" ? role : null };
  },
  assertSameOrigin,
  // Лениво: rate-limit.ts → supabase/admin.ts → env.ts валидирует все серверные переменные при импорте,
  // а requireAdminPage (layout) должен работать и в dev-подмене без полного .env.
  checkRateLimit: async (key, limit, windowSeconds) => (await import("@/lib/rate-limit")).checkRateLimit(key, limit, windowSeconds),
};

/**
 * Для /api/admin/*, которым нужен id администратора (changed_by, created_by): { ok: true, admin } или готовый ответ-ошибка.
 * Dev-подмена ADMIN_FIXTURES=1 вне production: фиктивный админ без сессии и лимита, Origin на мутациях проверяется.
 */
export async function authorizeAdminApi(request: Request, opts: AdminApiOptions = {}): Promise<AdminApiAuth> {
  if (process.env.NODE_ENV !== "production" && process.env.ADMIN_FIXTURES === "1") {
    const denied = isMutation(request, opts) ? assertSameOrigin(request) : null;
    return denied ? { ok: false, response: denied } : { ok: true, admin: { ...FIXTURE_ADMIN } };
  }
  return authorizeAdminApiWith(defaultAdminApiDeps, request, opts);
}

/** Короткая форма: null — запрос от администратора, иначе готовый 401 / 403 / 429 (контракт requireAdmin(request) обработчиков exchange-rates и товаров). */
export async function requireAdminApi(request: Request, opts: AdminApiOptions = {}): Promise<Response | null> {
  const auth = await authorizeAdminApi(request, opts);
  return auth.ok ? null : auth.response;
}
