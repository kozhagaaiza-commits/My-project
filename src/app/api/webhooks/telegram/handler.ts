import { createHash, timingSafeEqual } from "node:crypto";
import { apiError } from "@/lib/api-error";
import { orderStatusLabel } from "@/lib/order-labels";
import { telegramUpdate } from "@/lib/schemas/webhooks";
import { escapeHtml, redactSecrets, type TelegramClient } from "@/lib/telegram";

// Тело POST /api/webhooks/telegram (Чертёж, Блок 3) с внедряемыми зависимостями; route.ts — тонкая обёртка с реальными.
// Модуль не импортирует env / service-role клиент — тестируется node:test без сети.
// Порядок: секрет (X-Telegram-Bot-Api-Secret-Token, timingSafeEqual) → иначе 403 ДО любых обращений к БД/Telegram →
// JSON → Zod → команды. Ответ ВСЕГДА 200 { data: { ok: true } } (чтобы Telegram не повторял), кроме 403 и сбоя конфигурации (500).
// Команды: /start o_<token>, /start fit_<vehicle_id>, /stop; прочие сообщения не-админа (текст, фото, стикеры, документы) →
// forwardMessage админу. Голый /start — приветствие, админу не пересылается (A43).
// Только private-чаты. Сообщения из чата админа не пересылаются. Лог — без токена бота и ПДн (только update_id).
// Лимит: 10 сообщений / 60 с на чат (ключ tg:<chat_id>, fail-open); сверх лимита — 200 и ничего не делаем (A43).

export const MSG_SUBSCRIBED = (number: string, statusLabel: string) =>
  `Подписка на заказ ${number} оформлена. Текущий статус: ${statusLabel}`;
export const MSG_LINK_INVALID = "Ссылка недействительна. Откройте страницу заказа из письма и нажмите кнопку ещё раз";
export const MSG_FIT = "Напишите модель, год и что ищете — инженер ответит в этом чате в рабочее время (10:00–20:00 МСК)";
export const MSG_FIT_ADMIN = (label: string, chatId: string) => `Запрос подбора: ${label}, чат ${chatId}`;
export const MSG_STOPPED = "Уведомления отключены";
export const MSG_FORWARDED = "Передал инженеру. Ответим в рабочее время";
export const MSG_GREETING = "Это бот ForgeCarbon. Статусы заказа приходят по ссылке из письма. Вопрос — напишите сюда, передам инженеру.";

/** Лимит входящих сообщений бота на чат (Блок 5.10 — через check_rate_limit; здесь, а не в rate-limit.ts, чтобы не трогать общий файл). */
export const TELEGRAM_BOT_RATE_LIMIT = { limit: 10, windowSeconds: 60 } as const;
export const botRateLimitKey = (chatId: string) => `tg:${chatId}`;

const ORDER_TOKEN_FORMAT = /^[A-Za-z0-9_-]{32}$/;
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const START_RE = /^\/start(?:@\w+)?\s+(\S+)$/i;
const BARE_START_RE = /^\/start(?:@\w+)?$/i;
const STOP_RE = /^\/stop(?:@\w+)?$/i;

export interface TelegramBotDeps {
  /** TELEGRAM_WEBHOOK_SECRET. */
  secret: string;
  /** TELEGRAM_ADMIN_CHAT_ID. */
  adminChatId: string;
  telegram: Pick<TelegramClient, "sendMessage" | "forwardMessage">;
  /** sha256(token) в hex (hashOrderToken). */
  hashToken(token: string): string;
  orders: {
    findByTokenHash(hash: string): Promise<{ id: string; number: string; status: string } | null>;
    subscribe(orderId: string, chatId: string): Promise<void>;
    /** orders.telegram_chat_id = null у всех заказов чата. */
    unsubscribe(chatId: string): Promise<void>;
  };
  /** «BMW 5 Series G30» или null, если автомобиля нет. */
  vehicleLabel(vehicleId: string): Promise<string | null>;
  /** check_rate_limit: true — разрешено. fail-open обеспечивает реализация; исключение трактуется как «разрешено». */
  rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

const ok = () => Response.json({ data: { ok: true } }, { status: 200 });

function secretMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  // Сравнение дайджестов одинаковой длины: не зависит от длины и содержимого секрета по времени.
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

async function reply(deps: TelegramBotDeps, chatId: string, text: string): Promise<boolean> {
  const res = await deps.telegram.sendMessage(chatId, text);
  if (res.kind !== "ok") console.error({ scope: "webhooks.telegram", msg: "ответ не отправлен", result: res.kind });
  return res.kind === "ok";
}

async function handleStart(deps: TelegramBotDeps, chatId: string, param: string): Promise<boolean> {
  if (param.startsWith("o_")) {
    const token = param.slice(2);
    const order = ORDER_TOKEN_FORMAT.test(token) ? await deps.orders.findByTokenHash(deps.hashToken(token)) : null;
    if (!order) {
      await reply(deps, chatId, MSG_LINK_INVALID);
      return true;
    }
    await deps.orders.subscribe(order.id, chatId);
    await reply(deps, chatId, escapeHtml(MSG_SUBSCRIBED(order.number, orderStatusLabel(order.status))));
    return true;
  }
  if (param.startsWith("fit_") && UUID_FORMAT.test(param.slice(4))) {
    const vehicleId = param.slice(4);
    let label: string | null = null;
    try {
      label = await deps.vehicleLabel(vehicleId);
    } catch (err: unknown) {
      console.error({ scope: "webhooks.telegram", msg: "автомобиль не прочитан", err: redactSecrets(String(err)) });
    }
    await reply(deps, chatId, MSG_FIT);
    await reply(deps, deps.adminChatId, escapeHtml(MSG_FIT_ADMIN(label ?? vehicleId, chatId)));
    return true;
  }
  return false; // /start с неизвестной нагрузкой — «прочий текст»
}

async function withinRateLimit(deps: TelegramBotDeps, chatId: string): Promise<boolean> {
  try {
    const { limit, windowSeconds } = TELEGRAM_BOT_RATE_LIMIT;
    return await deps.rateLimit(botRateLimitKey(chatId), limit, windowSeconds);
  } catch (err: unknown) {
    console.error({ scope: "webhooks.telegram", msg: "лимит бота не проверен (fail-open)", err: redactSecrets(String(err)) });
    return true;
  }
}

async function handleUpdate(deps: TelegramBotDeps, update: ReturnType<typeof telegramUpdate.parse>): Promise<void> {
  const message = update.message;
  if (!message || message.chat.type !== "private") return;
  const chatId = String(message.chat.id);
  if (!(await withinRateLimit(deps, chatId))) return; // сверх лимита — молча

  const text = message.text?.trim();
  if (text === "") return;

  if (text !== undefined) {
    if (BARE_START_RE.test(text)) {
      await reply(deps, chatId, MSG_GREETING);
      return;
    }
    const start = START_RE.exec(text);
    if (start && (await handleStart(deps, chatId, start[1]))) return;

    if (STOP_RE.test(text)) {
      await deps.orders.unsubscribe(chatId);
      await reply(deps, chatId, MSG_STOPPED);
      return;
    }
  }

  // Прочее (текст, фото, стикеры, документы) — инженеру.
  if (chatId === deps.adminChatId) return; // сообщения админа не пересылаем
  const messageId = message.message_id;
  if (typeof messageId !== "number") return;
  const forwarded = await deps.telegram.forwardMessage(deps.adminChatId, chatId, messageId);
  if (forwarded.kind !== "ok") {
    // Вопрос не дошёл до инженера — «Передал» не отвечаем (иначе обман); причина в логе.
    console.error({ scope: "webhooks.telegram", msg: "сообщение не переслано админу", result: forwarded.kind, update_id: update.update_id });
    return;
  }
  await reply(deps, chatId, MSG_FORWARDED);
}

export function createTelegramWebhookHandler(getDeps: () => Promise<TelegramBotDeps> | TelegramBotDeps) {
  return async function POST(request: Request): Promise<Response> {
    let deps: TelegramBotDeps;
    try {
      deps = await getDeps();
    } catch (err: unknown) {
      console.error({ scope: "webhooks.telegram", msg: "конфигурация бота недоступна", err: redactSecrets(String(err)) });
      return apiError("INTERNAL_ERROR", "Ошибка обработки уведомления", 500);
    }
    if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"), deps.secret)) {
      return apiError("FORBIDDEN", "Неверный секрет", 403);
    }

    let updateId: unknown;
    try {
      const raw: unknown = JSON.parse(await request.text());
      const parsed = telegramUpdate.safeParse(raw);
      if (parsed.success) {
        updateId = parsed.data.update_id;
        await handleUpdate(deps, parsed.data);
      }
    } catch (err: unknown) {
      // Telegram не должен повторять доставку: 200 даже при внутренней ошибке (токен бота и ПДн в лог не пишутся).
      console.error({ scope: "webhooks.telegram", msg: "ошибка обработки апдейта", update_id: updateId, err: redactSecrets(err instanceof Error ? `${err.name}: ${err.message}` : String(err)) });
    }
    const res = ok();
    res.headers.set("Cache-Control", "no-store");
    return res;
  };
}
