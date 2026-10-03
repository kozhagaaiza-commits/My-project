import { z } from "zod";
import { kopecksToRubString } from "@/lib/money";

// Схемы ответов ЮKassa (форма ответа не доверенная) и чек 54-ФЗ (Чертёж 5.9.1).

// 1 = без НДС (ИП на УСН). При другой системе налогообложения бухгалтер называет код, константа меняется здесь.
export const YOOKASSA_VAT_CODE = 1;

const rubAmount = z.object({
  value: z.string().regex(/^\d+(\.\d{1,2})?$/, "amount.value — строка рублей"),
  currency: z.string(),
});
const cancellation = z.looseObject({ party: z.string().optional(), reason: z.string() });

export const yookassaPaymentSchema = z.looseObject({
  id: z.string().min(1).max(64),
  status: z.enum(["pending", "waiting_for_capture", "succeeded", "canceled"]),
  paid: z.boolean(),
  amount: rubAmount,
  payment_method: z.looseObject({ type: z.string() }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  confirmation: z.looseObject({ type: z.string(), confirmation_url: z.string().optional() }).optional(),
  cancellation_details: cancellation.optional(),
  created_at: z.string(),
  captured_at: z.string().optional(),
  test: z.boolean().optional(),
});
export type YookassaPayment = z.infer<typeof yookassaPaymentSchema>;
export type YookassaPaymentStatus = YookassaPayment["status"];

export const yookassaRefundSchema = z.looseObject({
  id: z.string().min(1).max(64),
  payment_id: z.string().min(1).max(64),
  status: z.enum(["pending", "succeeded", "canceled"]),
  amount: rubAmount,
  description: z.string().optional(),
  cancellation_details: cancellation.optional(),
  created_at: z.string(),
});
export type YookassaRefund = z.infer<typeof yookassaRefundSchema>;

export type ReceiptItemInput = { title: string; quantity: number; unit_price: number };

export interface YookassaReceipt {
  customer: { email: string; phone: string };
  items: Array<{
    description: string;
    quantity: number;
    amount: { value: string; currency: "RUB" };
    vat_code: number;
    payment_mode: "full_prepayment";
    payment_subject: "commodity";
  }>;
}

/** Чек (receipt) по Чертежу 5.9.1: телефон без «+», description ≤ 128 символов, суммы — строки рублей. */
export function buildReceipt(p: { email: string; phone: string; items: ReceiptItemInput[] }): YookassaReceipt {
  return {
    customer: { email: p.email, phone: p.phone.replace("+", "") },
    items: p.items.map((i) => ({
      description: i.title.slice(0, 128),
      quantity: i.quantity,
      amount: { value: kopecksToRubString(i.unit_price), currency: "RUB" },
      vat_code: YOOKASSA_VAT_CODE,
      payment_mode: "full_prepayment",
      payment_subject: "commodity",
    })),
  };
}
