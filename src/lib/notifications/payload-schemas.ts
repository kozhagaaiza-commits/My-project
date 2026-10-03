import { z } from "zod";

// Zod-схемы payload уведомлений (форма совпадает с types.ts). payload из БД не доверенный: каждая запись проверяется
// перед рендером (templates.ts). Ограничения длины — часть защиты лимита Telegram 4096 символов (см. templates.ts).

const isHttpUrl = (s: string) => /^https?:\/\/[^\s"<>]+$/i.test(s);
const urlField = z.string().max(2048).refine(isHttpUrl, "ожидается http(s)-ссылка");
const text = (max = 1000) => z.string().max(max);
const money = z.number().int();

export const itemSchema = z.object({ title: text(300), quantity: z.number().int().positive().max(10_000) });

export const adminOrderPaid = z.object({
  order_id: text(64), order_number: text(40), total: money, total_formatted: text(40),
  items: z.array(itemSchema).max(100), vehicle_label: text(200).nullable(), vin: text(40).nullable(),
  delivery_label: text(300), admin_url: urlField, needs_attention: z.boolean(),
});
export const customerOrderPaid = z.object({
  order_number: text(40), kind: z.enum(["stock", "preorder"]), total: money, total_formatted: text(40),
  items: z.array(itemSchema.extend({ line_total: money, line_total_formatted: text(40) })).max(100),
  delivery_method_label: text(100), delivery_label: text(300), order_url: urlField,
});
export const adminAttention = z.object({
  order_id: text(64), order_number: text(40),
  kind: z.enum(["payment_create_failed", "paid_needs_attention", "duplicate_payment", "payment_currency_mismatch"]),
  reason: text(2000), admin_url: urlField,
});
export const customerRefund = z.object({
  order_number: text(40), amount: money, amount_formatted: text(40), order_url: urlField.nullable(),
});
export const adminAtelierApplied = z.object({ company_name: text(200), inn: text(20), city: text(100) });
export const customerStatusChanged = z.object({
  order_number: text(40), status: text(40), status_label: text(100),
  tracking_number: text(60).nullable(), tracking_url: urlField.nullable(), order_url: urlField.nullable(),
});
export const atelierApproved = z.object({ company_name: text(200) });
export const atelierRejected = z.object({ company_name: text(200), rejection_reason: text(1000) });
