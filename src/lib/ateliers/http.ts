import { apiError } from "@/lib/api-error";
import { atelierStatusLabel } from "@/lib/ateliers/labels";
import type { MyAtelier } from "@/types/ateliers";

// Общие ответы эндпоинтов ателье (Блок 3). Без env и БД — импортируется обработчиками и тестами.

/** BR-20: FEATURE_ATELIER = false → 404 FEATURE_DISABLED (текст Блока 3, GET /api/ateliers/me). */
export const featureDisabled = () => apiError("FEATURE_DISABLED", "Раздел для ателье скоро откроется", 404);

/** 409 ALREADY_APPLIED (Блок 3). Для одобренной заявки текст «Заявка уже одобрена» (Приложение A). */
export const alreadyApplied = (status: "pending" | "approved") =>
  apiError("ALREADY_APPLIED", status === "approved" ? "Заявка уже одобрена" : "Заявка уже на рассмотрении", 409);

export function toMyAtelier(r: {
  id: string; company_name: string; inn: string; city: string; status: MyAtelier["status"];
  rejection_reason: string | null; created_at: string;
}): MyAtelier {
  return {
    id: r.id,
    company_name: r.company_name,
    inn: r.inn,
    city: r.city,
    status: r.status,
    status_label: atelierStatusLabel(r.status),
    // Причина отказа показывается только у отклонённой заявки (US-009).
    rejection_reason: r.status === "rejected" ? r.rejection_reason : null,
    created_at: new Date(r.created_at).toISOString(),
  };
}
