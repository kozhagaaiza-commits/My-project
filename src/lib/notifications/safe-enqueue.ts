import "server-only";
import type { NotifyDeps } from "@/lib/notifications/deps";
import type { NotificationInput } from "@/lib/notifications/types";

// Общая постановка уведомлений: ни одна функция не бросает (сбой уведомления не должен ломать основной запрос),
// после успешной постановки запускается разбор очереди (deps.kick → after()), чтобы письмо ушло ≤ 1 мин (US-003).

export type QueueDeps = Pick<NotifyDeps, "enqueue" | "kick" | "customerChatId">;

/** true — все уведомления поставлены в очередь; false — сборка или хотя бы одна постановка не удалась (ошибка в логе). */
export async function safeEnqueue(
  deps: QueueDeps, build: () => NotificationInput[] | Promise<NotificationInput[]>,
): Promise<boolean> {
  let list: NotificationInput[];
  try {
    list = await build();
  } catch (err) {
    console.error({ scope: "notifications.enqueue", msg: "не удалось собрать уведомление", err });
    return false;
  }
  let all = true;
  let queued = 0;
  for (const n of list) {
    try {
      if (await deps.enqueue(n)) queued++;
      else all = false;
    } catch (err) {
      all = false;
      console.error({ scope: "notifications.enqueue", template: n.template, err });
    }
  }
  if (queued > 0) await kickQuietly(deps);
  return all;
}

async function kickQuietly(deps: QueueDeps): Promise<void> {
  try {
    await deps.kick?.();
  } catch (err) {
    console.error({ scope: "notifications.enqueue", msg: "kick очереди не запущен", err });
  }
}

/** Telegram-подписка покупателя (orders.telegram_chat_id) или null; сбой чтения — null (письмо всё равно уйдёт). */
export async function customerChat(deps: QueueDeps, orderNumber: string): Promise<string | null> {
  try {
    return (await deps.customerChatId?.(orderNumber)) ?? null;
  } catch (err) {
    console.error({ scope: "notifications.enqueue", msg: "telegram_chat_id не прочитан", err });
    return null;
  }
}

