import { apiError } from "@/lib/api-error";
import { firstForwardedIp, isYookassaIp } from "@/lib/payments/ip-allowlist";
import { needsRedelivery, type ProcessResult, type RefundProcessResult } from "@/lib/payments/process-types";
import { yookassaWebhookBody } from "@/lib/schemas/webhooks";
import { YookassaApiError } from "@/lib/yookassa/errors";
import type { YookassaPayment, YookassaRefund } from "@/lib/yookassa/schemas";

// Тело POST /api/webhooks/yookassa с внедряемыми зависимостями (route.ts — тонкая обёртка с реальными).
// Модуль не импортирует env / service-role клиент — тестируется node:test без сети.
// Порядок (Блок 3): IP (первый адрес x-forwarded-for) ∈ сети ЮKassa → JSON → Zod → повторный GET объекта в ЮKassa
// (тело уведомления не доверенное: статус и сумма — только из ответа API, BR-12, Edge Case 26) → общий путь обработки.
// Ответы:
//  - 200 { data: { received: true } } после обработки или если объект уже обработан;
//  - 200 и при 404 ЮKassa на повторный GET (объекта нет в нашем магазине): повтор ничего не изменит, а 500 ЮKassa
//    повторяла бы сутки; случай пишется в лог (частая причина — уведомления тестового магазина на боевом сайте);
//  - 500 при любой другой ошибке (БД, сеть, 5xx ЮKassa) и когда автоматический возврат повторной оплаты ждёт повтора
//    после сбоя сети — ЮKassa доставит уведомление снова.
// CSRF/Origin и rate limit на webhook не применяются (5.10).

export interface YookassaWebhookDeps {
  getPayment(id: string): Promise<YookassaPayment>;
  getRefund(id: string): Promise<YookassaRefund>;
  processPayment(payment: YookassaPayment): Promise<ProcessResult>;
  processRefund(refund: YookassaRefund): Promise<RefundProcessResult>;
}

const NO_STORE = "no-store";
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

const received = () => Response.json({ data: { received: true } }, { status: 200 });
const badFormat = () => apiError("VALIDATION_ERROR", "Неверный формат уведомления", 400);
const failed = () => apiError("INTERNAL_ERROR", "Ошибка обработки уведомления", 500);

async function handle(request: Request, deps: YookassaWebhookDeps): Promise<Response> {
  const ip = firstForwardedIp(request.headers.get("x-forwarded-for"));
  if (!isYookassaIp(ip)) {
    console.error({ scope: "webhooks.yookassa", msg: "уведомление не из сетей ЮKassa", ip });
    return apiError("FORBIDDEN", "Источник уведомления не подтверждён", 403);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await request.text());
  } catch {
    return badFormat();
  }
  const parsed = yookassaWebhookBody.safeParse(raw);
  if (!parsed.success || !SAFE_ID.test(parsed.data.object.id)) return badFormat();
  const { event, object } = parsed.data;

  try {
    if (event === "refund.succeeded") {
      await deps.processRefund(await deps.getRefund(object.id));
      return received();
    }
    const result = await deps.processPayment(await deps.getPayment(object.id));
    if (needsRedelivery(result)) {
      console.error({ scope: "webhooks.yookassa", msg: "автовозврат повторной оплаты ждёт повтора", event, object_id: object.id });
      return failed();
    }
    return received();
  } catch (err) {
    if (err instanceof YookassaApiError && err.status === 404) {
      console.error({ scope: "webhooks.yookassa", msg: "объект уведомления не найден в ЮKassa (404), уведомление принято", event, object_id: object.id });
      return received();
    }
    console.error({ scope: "webhooks.yookassa", event, object_id: object.id, err });
    return failed();
  }
}

export function createYookassaWebhookHandler(deps: YookassaWebhookDeps) {
  return async function POST(request: Request): Promise<Response> {
    const res = await handle(request, deps);
    res.headers.set("Cache-Control", NO_STORE);
    return res;
  };
}
