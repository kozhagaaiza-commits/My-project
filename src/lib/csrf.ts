import { apiError } from "@/lib/api-error";

// CSRF-защита мутирующих публичных и пользовательских эндпоинтов (Чертёж, 5.10 «CORS»).
// Вызывается в начале POST/PATCH/PUT/DELETE Route Handlers, КРОМЕ /api/webhooks/* и /api/cron/*
// (их вызывают ЮKassa, Telegram и Vercel Cron без Origin нашего сайта — там своя проверка подлинности).
//
// Правила (Приложение A, A27):
// - Origin должен совпадать с new URL(NEXT_PUBLIC_SITE_URL).origin;
// - в NODE_ENV !== "production" дополнительно принимаются http://localhost:<порт> и http://127.0.0.1:<порт>
//   (dev-серверы на разных портах);
// - нет заголовка Origin → 403: браузер шлёт его в каждом POST/PATCH/PUT/DELETE, без него — не наш фронтенд.
// NEXT_PUBLIC_SITE_URL читается из process.env, а не из env.ts: модуль не должен требовать все серверные переменные.

const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

/** origin из URL сайта или null, если переменная не задана / не URL. */
function siteOrigin(siteUrl: string | undefined): string | null {
  if (!siteUrl) return null;
  try {
    return new URL(siteUrl).origin;
  } catch {
    return null;
  }
}

/** Чистая проверка (для тестов): допустим ли заголовок Origin. */
export function isAllowedOrigin(origin: string | null, siteUrl: string | undefined, nodeEnv: string | undefined): boolean {
  if (!origin || origin === "null") return false;
  const expected = siteOrigin(siteUrl);
  if (expected !== null && origin === expected) return true;
  return nodeEnv !== "production" && DEV_ORIGIN.test(origin);
}

/** null — запрос можно обрабатывать; иначе готовый 403 FORBIDDEN. */
export function assertSameOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (isAllowedOrigin(origin, process.env.NEXT_PUBLIC_SITE_URL, process.env.NODE_ENV)) return null;
  return apiError("FORBIDDEN", "Недопустимый источник запроса", 403);
}
