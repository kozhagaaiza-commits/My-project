import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationInput } from "@/lib/notifications/types";

// Постановка уведомления в notification_queue (Чертёж 2.13). Отправку (Telegram / SMTP) и разбор очереди
// делает День 5 (integrations-engineer); здесь — только insert строки status = 'pending'.
// next_attempt_at и attempts — значения по умолчанию таблицы (now() сервера БД, 0).
// Ошибка постановки НЕ пробрасывается: обработка платежа важнее уведомления (заказ всё равно виден в /admin).

export type { NotificationInput } from "@/lib/notifications/types";

/** Insert в notification_queue на переданном клиенте (service-role). true — запись создана. */
export async function insertNotification(client: SupabaseClient, n: NotificationInput): Promise<boolean> {
  try {
    const { error } = await client.from("notification_queue").insert({
      channel: n.channel,
      recipient: n.recipient,
      template: n.template,
      payload: n.payload,
      status: "pending",
    });
    if (error) throw new Error(`notification_queue.insert: ${error.code ?? ""} ${error.message}`);
    return true;
  } catch (err) {
    // Получатель (email / chat_id) — персональные данные: в лог не пишется.
    console.error({ scope: "notifications.enqueue", template: n.template, channel: n.channel, err });
    return false;
  }
}

/** Постановка в очередь через service-role клиент (создаётся лениво: модуль не читает env при импорте). */
export async function enqueueNotification(n: NotificationInput): Promise<boolean> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    return await insertNotification(createAdminClient(), n);
  } catch (err) {
    console.error({ scope: "notifications.enqueue", template: n.template, channel: n.channel, err });
    return false;
  }
}
