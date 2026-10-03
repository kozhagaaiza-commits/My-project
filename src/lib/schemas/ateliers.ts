import { z } from "zod";
import { page, phoneRu } from "./common";

// Схемы функции «Опт для ателье» (Блок 3: POST /api/ateliers, GET/PATCH /api/admin/ateliers*; 5.1). Одна схема на
// клиенте (AtelierApplyForm, диалог отклонения) и сервере.

// Контрольная сумма ИНН (10 и 12 цифр) по алгоритму ФНС.
export function isValidInn(inn: string): boolean {
  const d = inn.split("").map(Number);
  const check = (w: number[]) => (w.reduce((s, k, i) => s + k * d[i], 0) % 11) % 10;
  if (d.length === 10) return check([2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[9];
  if (d.length === 12)
    return check([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[10]
      && check([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[11];
  return false;
}

// FIX(blueprint): в Чертеже website — `z.url()` без ограничения схемы; он принимает `javascript:`, `data:` и т. п.,
// а сайт ателье выводится ссылкой в админке. Разрешены только http/https с доменным именем (Приложение A).
const websiteUrl = z.url({ protocol: /^https?$/, hostname: z.regexes.domain, error: "Ссылка вида https://site.ru" });

export const atelierApplyBody = z.object({
  company_name: z.string().trim().min(2).max(120),
  inn: z.string().trim().regex(/^(\d{10}|\d{12})$/, "ИНН — 10 или 12 цифр")
       .refine(isValidInn, "Проверьте ИНН — контрольная сумма не совпадает"),
  city: z.string().trim().min(2).max(80),
  contact_name: z.string().trim().min(2).max(100),
  phone: phoneRu,
  website: z.string().trim().max(200).pipe(websiteUrl).nullable(),
  comment: z.string().trim().max(1000).nullable(),
});

export type AtelierApplyBody = z.infer<typeof atelierApplyBody>;

export const atelierReviewBody = z.discriminatedUnion("status", [
  z.object({ status: z.literal("approved"), rejection_reason: z.null() }),
  z.object({ status: z.literal("rejected"), rejection_reason: z.string().trim().min(10).max(500) }),
]);

export type AtelierReviewBody = z.infer<typeof atelierReviewBody>;

export const ATELIER_STATUSES = ["pending", "approved", "rejected"] as const;
export type AtelierStatus = (typeof ATELIER_STATUSES)[number];

// GET /api/admin/ateliers?status=pending&page=1 (Блок 3).
export const adminAteliersQuery = z.object({ status: z.enum(ATELIER_STATUSES).optional(), page });

export type AdminAteliersQuery = z.infer<typeof adminAteliersQuery>;
