import { processPaymentObject, processRefundObject } from "@/lib/payments/process";
import { getPayment, getRefund } from "@/lib/yookassa";
import { createYookassaWebhookHandler } from "./handler";

// POST /api/webhooks/yookassa — HTTP-уведомления ЮKassa: payment.succeeded, payment.canceled, refund.succeeded (Блок 3).
// Логика и порядок проверок — в handler.ts; здесь только реальные зависимости.
const handler = createYookassaWebhookHandler({
  getPayment,
  getRefund,
  processPayment: processPaymentObject,
  processRefund: processRefundObject,
});

export async function POST(request: Request) {
  return handler(request);
}
