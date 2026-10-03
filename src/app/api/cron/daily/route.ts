import { createCronHandler, type CronDeps } from "./handler";

// GET /api/cron/daily — ежедневные задачи (Блок 3, 5.12), вызывается Vercel Cron (`0 6 * * *` UTC = 09:00 МСК, vercel.json).
// Логика — handler.ts. Зависимости собираются лениво: env не разбирается при импорте модуля (сборка, typegen).
// Потолок функции: курс ЦБ (3 попытки × 10 с + паузы 2 и 5 с), сверка платежей с ЮKassa, очередь уведомлений (бюджет 20 с).
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
