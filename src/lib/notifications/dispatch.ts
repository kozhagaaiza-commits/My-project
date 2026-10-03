import "server-only";
import { after } from "next/server";
import {
  clean, deliver, settle, type DispatchDeps, type Outcome, type ProcessResult,
} from "@/lib/notifications/dispatch-settle";

// Отправка уведомлений из notification_queue (Чертёж 5.9.2 «Fallback», 5.9.3, 5.12 шаг 5, Edge Cases 7 и 8).
// Строка: pending → sent | (повтор) | failed. Каждая отправка — одна «попытка» очереди (внутри — свои ретраи клиентов:
// Telegram 3×, SMTP 2×). Отправка строки и применение результата — dispatch-settle.ts.
// Захват строки атомарный (lease): next_attempt_at = now + 2 мин по условию status = 'pending' и next_attempt_at ≤ now —
// два параллельных запуска (kick, cron, /api/admin/summary) одну строку не отправят дважды; при падении процесса
// строка вернётся в работу после окончания lease.
// Ничего не бросает наружу: сбой БД/сети → счётчики + поле error + структурный console.error без получателей и текстов.

export { RETRY_DELAYS_MS, MAX_QUEUE_ATTEMPTS, type DispatchDeps, type ProcessResult } from "@/lib/notifications/dispatch-settle";

export const LEASE_MS = 2 * 60_000;
/** Запас на расхождение часов приложения и БД: строка с next_attempt_at = now() БД считается due сразу. */
export const DEFAULT_DUE_SKEW_MS = 15_000;

export interface ProcessOptions {
  limit: number;
  now?: () => Date;
  deps?: DispatchDeps;
  /** Не начинать новые строки после этого бюджета (мс). */
  budgetMs?: number;
  dueSkewMs?: number;
  clock?: () => number;
  /** Пауза перед повтором markSent; в тестах — мгновенная. */
  sleep?: (ms: number) => Promise<void>;
}

export async function processNotificationQueue(opts: ProcessOptions): Promise<ProcessResult> {
  const counters: ProcessResult = { sent: 0, failed: 0, retried: 0, remaining: 0 };
  try {
    const deps = opts.deps ?? (await getDefaultDispatchDeps());
    const now = opts.now ?? (() => new Date());
    const clock = opts.clock ?? Date.now;
    const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
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
        await settle(row, outcome, { deps, now: now(), sleep }, counters);
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
