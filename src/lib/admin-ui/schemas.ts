import { z } from "zod";
import { formatRub, rubStringToKopecks } from "@/lib/money";

// TODO(frontend-developer): заменить на схемы из src/lib/schemas/admin-* (orderStatusChangeBody, refundBody,
// settingsPatchBody), когда backend-engineer их создаст. Здесь — форменные (строковые) версии тех же правил Чертежа
// (Блок 3, 5.1): поля ввода — строки, в числа/копейки переводятся при отправке.

export const TRACKING_RE = /^[A-Za-z0-9-]{5,40}$/;
export const TRACKING_MESSAGE = "Трек-номер: 5–40 символов, латиница, цифры и дефис";

/** null — значение допустимо (пустое значение допустимо: поле необязательное). */
export function trackingError(value: string): string | null {
  const v = value.trim();
  return v === "" || TRACKING_RE.test(v) ? null : TRACKING_MESSAGE;
}

export const normalizeDecimal = (v: string): string => v.trim().replace(",", ".");

// --- Отправка (US-007, шаг 7) ---
export const shipFormSchema = (needsTracking: boolean) =>
  z
    .object({
      tracking_number: z.string().trim(),
      courier_note: z.string().trim().max(300, "Не больше 300 символов"),
      note: z.string().trim().max(500, "Не больше 500 символов"),
    })
    .superRefine((v, ctx) => {
      if (needsTracking && v.tracking_number === "") {
        ctx.addIssue({ code: "custom", path: ["tracking_number"], message: "Укажите трек-номер СДЭК" });
      } else if (!needsTracking && v.courier_note === "") {
        ctx.addIssue({ code: "custom", path: ["courier_note"], message: "Укажите заметку для курьера" });
      }
      if (v.tracking_number !== "" && !TRACKING_RE.test(v.tracking_number)) {
        ctx.addIssue({ code: "custom", path: ["tracking_number"], message: TRACKING_MESSAGE });
      }
    });
export type ShipFormValues = z.infer<ReturnType<typeof shipFormSchema>>;

// --- Возврат (US-008) ---
const AMOUNT_RE = /^\d+(?:[.,]\d{1,2})?$/;

export const refundFormSchema = (maxKopecks: number) =>
  z.object({
    amount: z
      .string()
      .trim()
      .superRefine((v, ctx) => {
        if (!AMOUNT_RE.test(v)) {
          ctx.addIssue({ code: "custom", message: "Введите сумму, например 133700.00" });
          return;
        }
        const kopecks = rubStringToKopecks(normalizeDecimal(v));
        if (kopecks <= 0) ctx.addIssue({ code: "custom", message: "Сумма должна быть больше нуля" });
        else if (kopecks > maxKopecks) ctx.addIssue({ code: "custom", message: `Максимум к возврату: ${formatRub(maxKopecks)}` });
      }),
    reason: z.string().trim().min(5, "Минимум 5 символов").max(500, "Не больше 500 символов"),
    restock: z.boolean(),
  });
export type RefundFormValues = z.infer<ReturnType<typeof refundFormSchema>>;

// --- Настройки цен (Блок 3: settingsPatchBody) ---
export const ROUNDING_OPTIONS = ["1", "10", "100", "1000"] as const;

export const settingsFormSchema = z.object({
  markup_multiplier: z
    .string()
    .trim()
    .refine((v) => /^\d(?:[.,]\d{1,2})?$/.test(v) && Number(normalizeDecimal(v)) >= 1 && Number(normalizeDecimal(v)) <= 5, {
      message: "Множитель от 1.00 до 5.00",
    }),
  price_rounding_rub: z.enum(ROUNDING_OPTIONS),
  auto_reprice: z.boolean(),
  reprice_threshold: z
    .string()
    .trim()
    .refine((v) => /^\d{1,2}(?:[.,]\d{1,2})?$/.test(v) && Number(normalizeDecimal(v)) <= 20, {
      message: "Порог от 0 до 20 %",
    }),
});
export type SettingsFormValues = z.infer<typeof settingsFormSchema>;

/** Тело PATCH /api/admin/settings из значений формы. */
export function settingsPatchFromForm(v: SettingsFormValues) {
  return {
    markup_multiplier: Number(normalizeDecimal(v.markup_multiplier)),
    price_rounding_rub: Number(v.price_rounding_rub),
    auto_reprice: v.auto_reprice,
    reprice_threshold: Number(normalizeDecimal(v.reprice_threshold)),
  };
}

// --- Ограничения текстовых полей карточки заказа ---
export const LIMITS = { customerNote: 500, adminNote: 2000, courierNote: 300 } as const;
