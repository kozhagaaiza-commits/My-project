import { createTelegramWebhookHandler, type TelegramBotDeps } from "./handler";

// POST /api/webhooks/telegram — апдейты бота (Блок 3). Логика — в handler.ts; здесь реальные зависимости.
// Собираются лениво (при первом запросе): env не разбирается при импорте модуля (сборка, typegen).
let cached: Promise<TelegramBotDeps> | null = null;

async function realDeps(): Promise<TelegramBotDeps> {
  const [{ env }, { createAdminClient }, { createBotOrdersRepo }, { hashOrderToken }, { getTelegramClient }, { getVehicle }, { checkRateLimit }] = await Promise.all([
    import("@/lib/env"),
    import("@/lib/supabase/admin"),
    import("@/lib/notifications/bot-repo"),
    import("@/lib/orders/token"),
    import("@/lib/telegram"),
    import("@/lib/catalog-queries"),
    import("@/lib/rate-limit"),
  ]);
  return {
    secret: env.TELEGRAM_WEBHOOK_SECRET,
    adminChatId: env.TELEGRAM_ADMIN_CHAT_ID,
    telegram: await getTelegramClient(),
    hashToken: hashOrderToken,
    orders: createBotOrdersRepo(createAdminClient()),
    rateLimit: (key, limit, windowSeconds) => checkRateLimit(key, limit, windowSeconds, { failOpen: true }),
    vehicleLabel: async (id) => {
      const v = await getVehicle(id);
      return v ? `${v.make} ${v.model} ${v.generation}` : null;
    },
  };
}

const handler = createTelegramWebhookHandler(() => {
  cached ??= realDeps().catch((err: unknown) => {
    cached = null;
    throw err;
  });
  return cached;
});

// Ответ быстрый, но бот делает до двух обращений к Telegram с ретраями (по 5 с на попытку).
export const maxDuration = 30;

export async function POST(request: Request) {
  return handler(request);
}
