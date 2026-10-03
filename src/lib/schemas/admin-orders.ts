import { z } from "zod";
import { page, uuid } from "@/lib/schemas/common";

// Zod-схемы «Админка — заказы» (Чертёж, Блок 3). Одна схема на клиенте и сервере.

export const ORDER_STATUSES_ALL = [
  "pending_payment", "paid", "confirmed", "ordered_from_supplier", "in_transit", "arrived", "shipped", "delivered", "cancelled", "refunded",
] as const;

export const orderStatus = z.enum(["pending_payment", "paid", "confirmed", "ordered_from_supplier", "in_transit", "arrived", "shipped", "delivered", "cancelled", "refunded"]);
/**
 * ОТСТУПЛЕНИЕ (решение координатора, День 6): в Чертеже status — один enum. Вкладки «Под заказ» и «Отменён/возврат»
 * (Блок 4) объединяют несколько статусов, поэтому принимается один статус или список через запятую
 * («ordered_from_supplier,in_transit»); каждый элемент проверяется по enum, повторы убираются. Результат — массив.
 */
export const orderStatusList = z.string().trim()
  .transform((v) => [...new Set(v.split(",").map((x) => x.trim()))])
  .pipe(z.array(orderStatus).min(1).max(10));

export const adminOrdersQuery = z.object({
  status: orderStatusList.optional(),
  kind: z.enum(["stock", "preorder"]).optional(),
  // FIX(blueprint): в Чертеже z.coerce.boolean() — он превращает строку "false" в true (Boolean("false")),
  // и ?attention=false фильтровал бы «требуют внимания». z.stringbool(): "true"/"1" → true, "false"/"0" → false.
  attention: z.stringbool().optional(),
  q: z.string().trim().min(3).max(60).optional(),
  page,
});
export type AdminOrdersQuery = z.infer<typeof adminOrdersQuery>;

/** [id] из пути. Не uuid — тот же 404 «Заказ не найден», что и «нет заказа». */
export const adminOrderParams = z.object({ id: uuid });

/** Текст inline-ошибки US-007 (шаг 7) и примера 400 Блока 3. */
export const TRACKING_REQUIRED_MESSAGE = "Укажите трек-номер СДЭК";
/**
 * Для курьера по Москве US-007 требует courier_note, но текста ошибки Чертёж не даёт — подпись поля из Блока 4
 * («Заметка для курьера»). ОТСТУПЛЕНИЕ: текст сформулирован здесь, нужно подтвердить.
 */
export const COURIER_NOTE_REQUIRED_MESSAGE = "Укажите заметку для курьера";

export const orderStatusChangeBody = z.object({
  to_status: orderStatus.exclude(["pending_payment", "paid", "refunded"]),  // paid — только webhook, refunded — только через refund
  tracking_number: z.string().trim().regex(/^[A-Za-z0-9-]{5,40}$/).nullable().default(null),
  courier_note: z.string().trim().max(300).nullable().default(null),
  note: z.string().trim().max(500).nullable().default(null),
  updated_at: z.iso.datetime(),
});
export type OrderStatusChangeBody = z.infer<typeof orderStatusChangeBody>;

export const orderMetaPatchBody = z.object({
  expected_ready_at: z.iso.date().nullable().optional(),
  customer_visible_note: z.string().trim().max(500).nullable().optional(),
  admin_note: z.string().trim().max(2000).nullable().optional(),
  tracking_number: z.string().trim().regex(/^[A-Za-z0-9-]{5,40}$/).nullable().optional(),
  courier_note: z.string().trim().max(300).nullable().optional(),
  needs_attention: z.boolean().optional(),
  updated_at: z.iso.datetime(),
});
export type OrderMetaPatchBody = z.infer<typeof orderMetaPatchBody>;
