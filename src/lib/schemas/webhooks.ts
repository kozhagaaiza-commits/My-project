import { z } from "zod";

// POST /api/webhooks/yookassa (Чертёж, Блок 3) — дословно. Минимальная форма: данные дальше берутся из повторного GET.
// .passthrough() в Zod 4 помечен устаревшим (аналог .loose()), оставлен как в Чертеже — поведение то же.
export const yookassaWebhookBody = z.object({
  type: z.literal("notification"),
  event: z.enum(["payment.succeeded", "payment.canceled", "payment.waiting_for_capture", "refund.succeeded"]),
  object: z.object({ id: z.string().min(10).max(64) }).passthrough(),
});

export type YookassaWebhookBody = z.infer<typeof yookassaWebhookBody>;
