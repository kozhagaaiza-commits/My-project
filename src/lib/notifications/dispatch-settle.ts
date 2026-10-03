import type { MailResult } from "@/lib/mailer";
import { renderNotification } from "@/lib/notifications/templates";
import type { NotificationQueueRepo, QueueRow } from "@/lib/notifications/queue-repo";
import { redactSecrets, type TelegramResult } from "@/lib/telegram";

// Отправка одной строки очереди и применение результата (Чертёж 5.9.2 «Fallback», Edge Cases 7 и 8). Используется dispatch.ts.
// Расписание повторов после неудачи: +5 мин, +30 мин, +2 ч, +12 ч; пятая неудача → failed.

export const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000] as const;
export const MAX_QUEUE_ATTEMPTS = 5;
/** Пауза перед единственным повтором markSent после успешной отправки (A40). */
export const MARK_SENT_RETRY_MS = 300;

export interface DispatchDeps {
  repo: NotificationQueueRepo;
  sendTelegram(chatId: string, text: string): Promise<TelegramResult<unknown>>;
  sendEmail(message: { to: string; subject: string; html: string; text: string }): Promise<MailResult>;
}

export interface ProcessResult {
  sent: number;
  /** Строки, ставшие failed (исчерпаны попытки, 403, 4xx Telegram, битый payload). */
  failed: number;
  /** Строки, оставленные в очереди на повтор. */
  retried: number;
  /** Строки pending после запуска. */
  remaining: number;
  /** Сбой уровня БД (очередь не разобрана). */
  error?: string;
}

export type Outcome =
  | { kind: "sent" }
  | { kind: "retry"; error: string }
  /** Повтор не поможет (403, 4xx Telegram): сразу failed; clearChat — снять подписку (403, «chat not found»). */
  | { kind: "final"; error: string; clearChat: boolean }
  | { kind: "invalid"; error: string };

export const clean = (s: string) => redactSecrets(s).slice(0, 500);

export async function deliver(row: QueueRow, deps: DispatchDeps): Promise<Outcome> {
  const rendered = renderNotification({ template: row.template, channel: row.channel, payload: row.payload });
  if (!rendered.ok) return { kind: "invalid", error: rendered.error };
  const msg = rendered.message;
  if (msg.channel === "telegram") {
    const res = await deps.sendTelegram(row.recipient, msg.text);
    switch (res.kind) {
      case "ok": return { kind: "sent" };
      case "blocked": return { kind: "final", error: `Telegram 403: ${res.error}`, clearChat: true };
      // 4xx (разметка, неверный чат, токен) — повтор того же запроса не поможет (A42).
      case "rejected": return { kind: "final", error: `Telegram ${res.status}: ${res.error}`, clearChat: /chat not found/i.test(res.error) };
      case "rate_limited": return { kind: "retry", error: `Telegram 429, retry_after ${res.retryAfterSeconds} с` };
      case "failed": return { kind: "retry", error: `Telegram: ${res.error}` };
    }
  }
  const res = await deps.sendEmail({ to: row.recipient, subject: msg.subject, html: msg.html, text: msg.text });
  return res.kind === "ok" ? { kind: "sent" } : { kind: "retry", error: `SMTP: ${res.error}` };
}

export interface SettleContext {
  deps: DispatchDeps;
  now: Date;
  sleep: (ms: number) => Promise<void>;
}

/**
 * Сообщение уже ушло, а запись «sent» не легла (сбой БД): одна повторная попытка через ~300 мс; не вышло — лог и строка остаётся
 * pending (после lease отправится ещё раз: риск дубля при сбое БД/платформы принят, A40). Не бросает.
 */
async function markSentWithRetry(row: QueueRow, attempts: number, ctx: SettleContext): Promise<void> {
  try {
    await ctx.deps.repo.markSent(row.id, attempts);
    return;
  } catch {
    await ctx.sleep(MARK_SENT_RETRY_MS);
  }
  try {
    await ctx.deps.repo.markSent(row.id, attempts);
  } catch (err: unknown) {
    console.error({ scope: "notifications.dispatch", msg: "отправлено, но markSent не записан (возможен дубль)", id: row.id, err: clean(String(err)) });
  }
}

/** Применяет результат отправки к строке очереди и обновляет счётчики. */
export async function settle(row: QueueRow, outcome: Outcome, ctx: SettleContext, counters: ProcessResult): Promise<void> {
  const { deps } = ctx;
  const attempts = row.attempts + 1;
  switch (outcome.kind) {
    case "sent":
      await markSentWithRetry(row, attempts, ctx);
      counters.sent++;
      return;
    case "invalid":
      await deps.repo.markFailed(row.id, attempts, clean(outcome.error));
      counters.failed++;
      return;
    case "final":
      await deps.repo.markFailed(row.id, attempts, clean(outcome.error));
      counters.failed++;
      if (!outcome.clearChat) return;
      // Бот заблокирован / чата нет: подписку на заказ снимаем (Блок 5.9.2).
      try {
        await deps.repo.clearTelegramChat(row.recipient);
      } catch (err: unknown) {
        console.error({ scope: "notifications.dispatch", msg: "orders.telegram_chat_id не обнулён", err: clean(String(err)) });
      }
      return;
    case "retry":
      if (attempts >= MAX_QUEUE_ATTEMPTS) {
        await deps.repo.markFailed(row.id, attempts, clean(outcome.error));
        counters.failed++;
      } else {
        const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
        await deps.repo.reschedule(row.id, attempts, new Date(ctx.now.getTime() + delay), clean(outcome.error));
        counters.retried++;
      }
  }
}
