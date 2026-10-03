import "server-only";
import type { NotificationInput } from "@/lib/notifications/types";

// Зависимости постановки уведомлений для кода, который их создаёт (платёжный контур, админка, ателье).
// Реальные собираются лениво (service-role клиент создаётся при первом обращении; env не читается при импорте).

export interface NotifyDeps {
  /** Постановка в notification_queue; не бросает (false — не поставлено, ошибка уже в логе). */
  enqueue: (n: NotificationInput) => Promise<boolean>;
  /** orders.telegram_chat_id заказа по номеру (подписка покупателя на Telegram) или null. Не бросает. */
  customerChatId?: (orderNumber: string) => Promise<string | null>;
  /** Запуск разбора очереди после постановки (after()); не бросает. */
  kick?: () => Promise<void>;
}

/** Реальные зависимости: insert в очередь, чтение orders.telegram_chat_id (service-role), kickNotificationQueue(). */
export async function getDefaultNotifyDeps(): Promise<NotifyDeps> {
  const [{ createAdminClient }, { insertNotification }, { kickNotificationQueue }] = await Promise.all([
    import("@/lib/supabase/admin"),
    import("@/lib/notifications/enqueue"),
    import("@/lib/notifications/dispatch"),
  ]);
  const client = createAdminClient();
  return {
    enqueue: (n) => insertNotification(client, n),
    customerChatId: async (orderNumber) => {
      try {
        const { data, error } = await client.from("orders").select("telegram_chat_id").eq("number", orderNumber).maybeSingle();
        if (error) throw new Error(`orders.telegramChat: ${error.code ?? ""} ${error.message}`);
        const id = (data as { telegram_chat_id?: number | string | null } | null)?.telegram_chat_id;
        return id === null || id === undefined ? null : String(id);
      } catch (err: unknown) {
        console.error({ scope: "notifications.chat_id", err });
        return null;
      }
    },
    kick: () => kickNotificationQueue(),
  };
}
