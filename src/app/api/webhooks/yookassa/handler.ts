import { apiError } from "@/lib/api-error";
import { firstForwardedIp, isYookassaIp } from "@/lib/payments/ip-allowlist";
import type { ProcessResult, RefundProcessResult } from "@/lib/payments/process";
import { yookassaWebhookBody } from "@/lib/schemas/webhooks";
import type { YookassaPayment, YookassaRefund } from "@/lib/yookassa";

// Тело POST /api/webhooks/yookassa с внедряемыми зависимостями (route.ts — тонкая обёртка с реальными).
// Модуль не импортирует env / service-role клиент — тестируется node:test без сети.
// Порядок (Блок 3): IP (первый адрес x-forwarded-for) ∈ сети ЮKassa → JSON → Zod → повторный GET объекта в ЮKassa
// (тело уведомления не доверенное: статус и сумма — только из ответа API, BR-12, Edge Case 26) → общий путь обработки.
// Ответ 200 { data: { received: true } } после обработки или если объект уже обработан; любая ошибка → 500, ЮKassa повторит.
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
      const refund = await deps.getRefund(object.id);
      await deps.processRefund(refund);
    } else {
      const payment = await deps.getPayment(object.id);
      await deps.processPayment(payment);
    }
    return received();
  } catch (err) {
    console.error({ scope: "webhooks.yookassa", event, object_id: object.id, err });
    return apiError("INTERNAL_ERROR", "Ошибка обработки уведомления", 500);
  }
}

export function createYookassaWebhookHandler(deps: YookassaWebhookDeps) {
  return async function POST(request: Request): Promise<Response> {
    const res = await handle(request, deps);
    res.headers.set("Cache-Control", NO_STORE);
    return res;
  };
}
