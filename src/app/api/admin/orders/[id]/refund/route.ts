// TODO(День 6): заменить на `import { authorizeAdminApi } from "@/lib/admin/guard";` и удалить src/lib/payments/admin-auth.ts.
import { authorizeAdminApi } from "@/lib/payments/admin-auth";
import { createAdminRefund } from "@/lib/payments/admin-refund";
import { createAdminRefundHandler } from "./handler";

// POST /api/admin/orders/[id]/refund — ручной возврат из админки (Блок 3, US-008). Логика — в handler.ts
// и src/lib/payments/admin-refund.ts; здесь только реальные зависимости.
// Потолок функции: доводка pending-возвратов (GET ≤ 8 с) + POST /v3/refunds (дедлайн 25 с) укладываются в 60 с.
export const maxDuration = 60;

const handler = createAdminRefundHandler({ authorize: authorizeAdminApi, createRefund: createAdminRefund });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(request, { params });
}
