import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { one, rows } from "@/lib/catalog/db";

// Доступ к notification_queue (Чертёж 2.13) и orders.telegram_chat_id для отправщика. Клиент — service-role,
// его передаёт вызывающий код (модуль не читает env). Явные колонки; ответы проверяются Zod; ошибка БД → исключение со scope.

export const QUEUE_COLUMNS = "id,channel,recipient,template,payload,attempts";

const queueRow = z.object({
  id: z.string(),
  channel: z.string(),
  recipient: z.string(),
  template: z.string(),
  payload: z.unknown(),
  attempts: z.number().int(),
});
export type QueueRow = z.infer<typeof queueRow>;

export interface NotificationQueueRepo {
  /** status = 'pending' и next_attempt_at ≤ dueBefore, по возрастанию next_attempt_at. */
  listDue(dueBefore: Date, limit: number): Promise<QueueRow[]>;
  /**
   * Атомарный захват (lease): next_attempt_at = leaseUntil, ТОЛЬКО если строка всё ещё pending и due.
   * null — строку уже забрал параллельный запуск.
   */
  claim(id: string, dueBefore: Date, leaseUntil: Date): Promise<QueueRow | null>;
  markSent(id: string, attempts: number): Promise<void>;
  markFailed(id: string, attempts: number, error: string): Promise<void>;
  reschedule(id: string, attempts: number, nextAttemptAt: Date, error: string): Promise<void>;
  /** Количество строк pending (любых). */
  countPending(): Promise<number>;
  /** 403 от Telegram: orders.telegram_chat_id = null у всех заказов этого чата. */
  clearTelegramChat(chatId: string): Promise<void>;
}

function check(res: { error: { message: string; code?: string } | null }, scope: string) {
  if (res.error) throw new Error(`${scope}: ${res.error.code ?? ""} ${res.error.message}`);
}

export function createQueueRepo(c: SupabaseClient): NotificationQueueRepo {
  return {
    async listDue(dueBefore, limit) {
      const res = await c.from("notification_queue").select(QUEUE_COLUMNS)
        .eq("status", "pending").lte("next_attempt_at", dueBefore.toISOString())
        .order("next_attempt_at", { ascending: true }).limit(limit);
      return rows(queueRow, res, "notification_queue.listDue");
    },
    async claim(id, dueBefore, leaseUntil) {
      const res = await c.from("notification_queue").update({ next_attempt_at: leaseUntil.toISOString() })
        .eq("id", id).eq("status", "pending").lte("next_attempt_at", dueBefore.toISOString())
        .select(QUEUE_COLUMNS).maybeSingle();
      return one(queueRow, res, "notification_queue.claim");
    },
    async markSent(id, attempts) {
      check(await c.from("notification_queue").update({ status: "sent", attempts, last_error: null }).eq("id", id), "notification_queue.markSent");
    },
    async markFailed(id, attempts, error) {
      check(await c.from("notification_queue").update({ status: "failed", attempts, last_error: error }).eq("id", id), "notification_queue.markFailed");
    },
    async reschedule(id, attempts, nextAttemptAt, error) {
      check(
        await c.from("notification_queue").update({ attempts, last_error: error, next_attempt_at: nextAttemptAt.toISOString() }).eq("id", id),
        "notification_queue.reschedule",
      );
    },
    async countPending() {
      const res = await c.from("notification_queue").select("id", { count: "exact", head: true }).eq("status", "pending");
      check(res, "notification_queue.countPending");
      return res.count ?? 0;
    },
    async clearTelegramChat(chatId) {
      check(await c.from("orders").update({ telegram_chat_id: null }).eq("telegram_chat_id", chatId), "orders.clearTelegramChat");
    },
  };
}
