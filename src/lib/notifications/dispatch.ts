import "server-only";
import { after } from "next/server";
import type { MailResult } from "@/lib/mailer";
import { renderNotification } from "@/lib/notifications/templates";
import type { NotificationQueueRepo, QueueRow } from "@/lib/notifications/queue-repo";
import { redactSecrets, type TelegramResult } from "@/lib/telegram";

// Отправка уведомлений из notification_queue (Чертёж 5.9.2 «Fallback», 5.9.3, 5.12 шаг 5, Edge Cases 7 и 8).
// Строка: pending → sent | (повтор) | failed. Каждая отправка — одна «попытка» очереди (внутри — свои ретраи клиентов:
// Telegram 3×, SMTP 2×). Расписание повторов после неудачи: +5 мин, +30 мин, +2 ч, +12 ч; пятая неудача → failed.
// Захват строки атомарный (lease): next_attempt_at = now + 2 мин по условию status = 'pending' и next_attempt_at ≤ now —
// два параллельных запуска (kick, cron, /api/admin/summary) одну строку не отправят дважды; при падении процесса
// строка вернётся в работу после окончания lease.
// Ничего не бросает наружу: сбой БД/сети → счётчики + поле error + структурный console.error без получателей и текстов.

export const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000] as const;
export const MAX_QUEUE_ATTEMPTS = 5;
export const LEASE_MS = 2 * 60_000;
/** Запас на расхождение часов приложения и БД: строка с next_attempt_at = now() БД считается due сразу. */
export const DEFAULT_DUE_SKEW_MS = 15_000;

export interface DispatchDeps {
  repo: NotificationQueueRepo;
  sendTelegram(chatId: string, text: string): Promise<TelegramResult<unknown>>;
  sendEmail(message: { to: string; subject: string; html: string; text: string }): Promise<MailResult>;
}

export interface ProcessOptions {
  limit: number;
  now?: () => Date;
  deps?: DispatchDeps;
  /** Не начинать новые строки после этого бюджета (мс). */
  budgetMs?: number;
  dueSkewMs?: number;
  clock?: () => number;
}

export interface ProcessResult {
  sent: number;
  /** Строки, ставшие failed (исчерпаны попытки, 403, битый payload). */
  failed: number;
  /** Строки, оставленные в очереди на повтор. */
  retried: number;
  /** Строки pending после запуска. */
  remaining: number;
  /** Сбой уровня БД (очередь не разобрана). */
  error?: string;
}

type Outcome =
  | { kind: "sent" }
  | { kind: "retry"; error: string }
  | { kind: "blocked"; error: string }
  | { kind: "invalid"; error: string };

const clean = (s: string) => redactSecrets(s).slice(0, 500);

async function deliver(row: QueueRow, deps: DispatchDeps): Promise<Outcome> {
  const rendered = renderNotification({ template: row.template, channel: row.channel, payload: row.payload });
  if (!rendered.ok) return { kind: "invalid", error: rendered.error };
  const msg = rendered.message;
  if (msg.channel === "telegram") {
    const res = await deps.sendTelegram(row.recipient, msg.text);
    switch (res.kind) {
      case "ok": return { kind: "sent" };
      case "blocked": return { kind: "blocked", error: `Telegram 403: ${res.error}` };
      case "rate_limited": return { kind: "retry", error: `Telegram 429, retry_after ${res.retryAfterSeconds} с` };
      case "rejected": return { kind: "retry", error: `Telegram ${res.status}: ${res.error}` };
      case "failed": return { kind: "retry", error: `Telegram: ${res.error}` };
    }
  }
  const res = await deps.sendEmail({ to: row.recipient, subject: msg.subject, html: msg.html, text: msg.text });
  return res.kind === "ok" ? { kind: "sent" } : { kind: "retry", error: `SMTP: ${res.error}` };
}

/** Применяет результат отправки к строке очереди и обновляет счётчики. */
async function settle(row: QueueRow, outcome: Outcome, deps: DispatchDeps, now: Date, counters: ProcessResult): Promise<void> {
  const attempts = row.attempts + 1;
  switch (outcome.kind) {
    case "sent":
      await deps.repo.markSent(row.id, attempts);
      counters.sent++;
      return;
    case "invalid":
      await deps.repo.markFailed(row.id, attempts, clean(outcome.error));
      counters.failed++;
      return;
    case "blocked":
      // Бот заблокирован: повторять бессмысленно; подписку на заказ снимаем (Блок 5.9.2).
      await deps.repo.markFailed(row.id, attempts, clean(outcome.error));
      counters.failed++;
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
        await deps.repo.reschedule(row.id, attempts, new Date(now.getTime() + delay), clean(outcome.error));
        counters.retried++;
      }
  }
}

export async function processNotificationQueue(opts: ProcessOptions): Promise<ProcessResult> {
  const counters: ProcessResult = { sent: 0, failed: 0, retried: 0, remaining: 0 };
  try {
    const deps = opts.deps ?? (await getDefaultDispatchDeps());
    const now = opts.now ?? (() => new Date());
    const clock = opts.clock ?? Date.now;
    const started = clock();
    const dueBefore = new Date(now().getTime() + (opts.dueSkewMs ?? DEFAULT_DUE_SKEW_MS));
    const due = await deps.repo.listDue(dueBefore, opts.limit);

    for (const candidate of due) {
      if (opts.budgetMs !== undefined && clock() - started >= opts.budgetMs) break;
      try {
        const row = await deps.repo.claim(candidate.id, dueBefore, new Date(now().getTime() + LEASE_MS));
        if (!row) continue; // забрал другой запуск
        let outcome: Outcome;
        try {
          outcome = await deliver(row, deps);
        } catch (err: unknown) {
          outcome = { kind: "retry", error: `ошибка отправки: ${err instanceof Error ? err.name : "unknown"}: ${err instanceof Error ? err.message : ""}` };
        }
        await settle(row, outcome, deps, now(), counters);
      } catch (err: unknown) {
        // Сбой БД на одной строке: строка вернётся в работу после lease; остальные продолжаем.
        console.error({ scope: "notifications.dispatch", msg: "строка очереди не обработана", id: candidate.id, err: clean(String(err)) });
      }
    }
    counters.remaining = await deps.repo.countPending();
  } catch (err: unknown) {
    counters.error = clean(err instanceof Error ? err.message : String(err));
    console.error({ scope: "notifications.dispatch", msg: "очередь не разобрана", err: counters.error });
  }
  return counters;
}

let defaultDeps: Promise<DispatchDeps> | null = null;

/** Реальные зависимости: service-role клиент, Telegram и SMTP из env (лениво, при первом разборе). */
export function getDefaultDispatchDeps(): Promise<DispatchDeps> {
  defaultDeps ??= (async (): Promise<DispatchDeps> => {
    const [{ createAdminClient }, { createQueueRepo }, { getTelegramClient }, { getMailer }] = await Promise.all([
      import("@/lib/supabase/admin"),
      import("@/lib/notifications/queue-repo"),
      import("@/lib/telegram"),
      import("@/lib/mailer"),
    ]);
    return {
      repo: createQueueRepo(createAdminClient()),
      sendTelegram: async (chatId, text) => (await getTelegramClient()).sendMessage(chatId, text),
      sendEmail: (message) => getMailer().sendMail(message),
    };
  })().catch((err: unknown) => {
    defaultDeps = null;
    throw err;
  });
  return defaultDeps;
}

export const KICK_FALLBACK_BUDGET_MS = 8000;
const KICK_PROCESS_BUDGET_MS = 25_000;
const defaultRun = (limit: number) => processNotificationQueue({ limit, budgetMs: KICK_PROCESS_BUDGET_MS });

/**
 * Разбор очереди ПОСЛЕ ответа (US-003: письмо ≤ 1 мин после webhook): `after()` из next/server запускает работу, когда ответ уже
 * отправлен, и продлевает жизнь serverless-вызова (waitUntil на Vercel). `after` бросает вне request-scope (скрипт, тест, cron
 * вне запроса) — тогда ждём разбор inline, но не дольше ~8 с (при превышении работа продолжается в фоне, вызывающий не ждёт).
 * Никогда не бросает.
 */
export async function kickNotificationQueue(
  limit = 10,
  run: (limit: number) => Promise<unknown> = defaultRun,
  fallbackBudgetMs = KICK_FALLBACK_BUDGET_MS,
): Promise<void> {
  const task = async () => {
    try {
      await run(limit);
    } catch (err: unknown) {
      console.error({ scope: "notifications.kick", err: clean(err instanceof Error ? err.message : String(err)) });
    }
  };
  try {
    after(task);
    return;
  } catch {
    // вне request-scope — ниже
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([task(), new Promise<void>((resolve) => { timer = setTimeout(resolve, fallbackBudgetMs); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
