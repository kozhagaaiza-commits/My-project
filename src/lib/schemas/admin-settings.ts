import { z } from "zod";

// Zod-схема PATCH /api/admin/settings (Чертёж, Блок 3 «Админка — настройки»). Одна схема на клиенте и сервере.
// Сообщения для множителя — текст примера 400 Блока 3; остальные ограничения — как в Чертеже (сообщения Zod по умолчанию).

export const MARKUP_MULTIPLIER_MESSAGE = "Множитель от 1.00 до 5.00";

export const settingsPatchBody = z.object({
  markup_multiplier: z.number(MARKUP_MULTIPLIER_MESSAGE).min(1, MARKUP_MULTIPLIER_MESSAGE).max(5, MARKUP_MULTIPLIER_MESSAGE)
    .multipleOf(0.01, MARKUP_MULTIPLIER_MESSAGE).optional(),
  price_rounding_rub: z.union([z.literal(1), z.literal(10), z.literal(100), z.literal(1000)]).optional(),
  auto_reprice: z.boolean().optional(),
  reprice_threshold: z.number().min(0).max(20).optional(),
});
export type SettingsPatchBody = z.infer<typeof settingsPatchBody>;
