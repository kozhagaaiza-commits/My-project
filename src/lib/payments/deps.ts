import "server-only";
import type { NotificationInput } from "@/lib/notifications/types";
import type { PaymentsRepo } from "@/lib/payments/db";
import type { YookassaClient } from "@/lib/yookassa";

// Зависимости платёжного контура. Бизнес-модули (create / process / reconcile / webhook handler) получают их явно
// и тестируются на fake-ЮKassa и in-memory БД. Реальные зависимости собираются лениво (dynamic import):
// модули не разбирают env при импорте.

export interface PaymentsDeps {
  repo: PaymentsRepo;
  yookassa: YookassaClient;
  /** Постановка в notification_queue; не бросает (false — не поставлено, ошибка уже в логе). */
  enqueue: (n: NotificationInput) => Promise<boolean>;
  siteUrl: string;
  adminChatId: string;
  /** Абсолютная ссылка на страницу заказа с токеном (A28: токен детерминирован от client_request_id). */
  orderUrl: (orderNumber: string, clientRequestId: string) => string;
  now: () => Date;
}

/** Реальные зависимости: service-role клиент (новый на вызов), ЮKassa из env, токен заказа. */
export async function getDefaultPaymentsDeps(): Promise<PaymentsDeps> {
  const [{ env }, { createAdminClient }, token, { getYookassaClient }, { insertNotification }, { createPaymentsRepo }] = await Promise.all([
    import("@/lib/env"),
    import("@/lib/supabase/admin"),
    import("@/lib/orders/token"),
    import("@/lib/yookassa"),
    import("@/lib/notifications/enqueue"),
    import("@/lib/payments/db"),
  ]);
  const client = createAdminClient();
  return {
    repo: createPaymentsRepo(client),
    yookassa: await getYookassaClient(),
    enqueue: (n) => insertNotification(client, n),
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
    adminChatId: env.TELEGRAM_ADMIN_CHAT_ID,
    orderUrl: (orderNumber, clientRequestId) => token.orderPageUrl(orderNumber, token.orderToken(clientRequestId)),
    now: () => new Date(),
  };
}
