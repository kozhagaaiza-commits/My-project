import { createCronHandler, type CronDeps } from "./handler";

// GET /api/cron/daily — ежедневные задачи (Блок 3, 5.12), вызывается Vercel Cron (`0 6 * * *` UTC = 09:00 МСК, vercel.json).
// Логика — handler.ts. Зависимости собираются лениво: env не разбирается при импорте модуля (сборка, typegen).
// Потолок функции: общий дедлайн шагов CRON_DEADLINE_MS = 50 с (handler.ts), очередь получает остаток времени.
export const maxDuration = 60;

let cached: Promise<CronDeps> | null = null;

function getDeps(): Promise<CronDeps> {
  cached ??= import("@/lib/cron/real-deps").then((m) => m.createCronDeps()).catch((err: unknown) => {
    cached = null;
    throw err;
  });
  return cached;
}

const handler = createCronHandler(getDeps);

export async function GET(request: Request) {
  return handler(request);
}
