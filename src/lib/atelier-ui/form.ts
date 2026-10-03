import type { z } from "zod";
import type { FieldError, Resolver } from "react-hook-form";
import { atelierApplyBody } from "@/lib/schemas/ateliers";
import type { MyAtelier } from "@/types/ateliers";

// Значения полей формы заявки — строки; пустые «Сайт» и «Комментарий» уходят в схему как null (Блок 3: nullable).

export interface AtelierFormValues {
  company_name: string;
  inn: string;
  city: string;
  contact_name: string;
  phone: string;
  website: string;
  comment: string;
}

export const ATELIER_FIELDS = ["company_name", "inn", "city", "contact_name", "phone", "website", "comment"] as const;

export const EMPTY_ATELIER_VALUES: AtelierFormValues = {
  company_name: "", inn: "", city: "", contact_name: "", phone: "", website: "", comment: "",
};

/** Повторная подача: известны только поля из GET /api/ateliers/me (название, ИНН, город). */
export function valuesFromPrevious(prev: MyAtelier | null): AtelierFormValues {
  return prev ? { ...EMPTY_ATELIER_VALUES, company_name: prev.company_name, inn: prev.inn, city: prev.city } : EMPTY_ATELIER_VALUES;
}

export function toApplyInput(values: AtelierFormValues) {
  return { ...values, website: values.website.trim() === "" ? null : values.website, comment: values.comment.trim() === "" ? null : values.comment };
}

/** Тело запроса после разбора схемой (телефон нормализован в +7XXXXXXXXXX); null — значения невалидны. */
export function parseApplyPayload(values: AtelierFormValues) {
  const parsed = atelierApplyBody.safeParse(toApplyInput(values));
  return parsed.success ? parsed.data : null;
}

/** Русское сообщение: встроенные тексты zod (min/max без своего message) английские, свои — уже русские. */
function issueMessage(issue: z.core.$ZodIssue): string {
  if (issue.code === "too_small" && issue.origin === "string") return `Минимум ${issue.minimum} символа`;
  if (issue.code === "too_big" && issue.origin === "string") return `Не больше ${issue.maximum} символов`;
  return issue.message;
}

/** zodResolver не подходит из-за «пусто → null»: разбираем atelierApplyBody вручную, первая ошибка на поле. */
export const atelierResolver: Resolver<AtelierFormValues> = async (values) => {
  const parsed = atelierApplyBody.safeParse(toApplyInput(values));
  if (parsed.success) return { values, errors: {} };
  const errors: Partial<Record<keyof AtelierFormValues, FieldError>> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && (ATELIER_FIELDS as readonly string[]).includes(key) && !(key in errors)) {
      errors[key as keyof AtelierFormValues] = { type: "validation", message: issueMessage(issue) };
    }
  }
  return { values: {}, errors };
};
