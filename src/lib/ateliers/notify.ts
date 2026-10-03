import type { NotificationInput } from "@/lib/notifications/types";

// Уведомления функции «Опт для ателье» (5.9.2): сборка строк notification_queue. Тексты и escapeHtml — в templates.ts,
// здесь только payload. Постановка — через safeEnqueue (не бросает: сбой уведомления не ломает заявку/решение).

/** 🏁 Новая заявка ателье: Garage 77, ИНН 7801234567, Санкт-Петербург — админу в Telegram (US-009 шаг 5). */
export function atelierAppliedNotification(
  adminChatId: string, a: { company_name: string; inn: string; city: string },
): NotificationInput {
  return {
    channel: "telegram", recipient: adminChatId, template: "admin_atelier_applied",
    payload: { company_name: a.company_name, inn: a.inn, city: a.city },
  };
}

/** Письмо владельцу заявки: atelier_approved / atelier_rejected (Блок 3 PATCH /api/admin/ateliers/[id]). */
export function atelierReviewNotification(
  email: string, companyName: string, decision: { status: "approved" } | { status: "rejected"; rejection_reason: string },
): NotificationInput {
  return decision.status === "approved"
    ? { channel: "email", recipient: email, template: "atelier_approved", payload: { company_name: companyName } }
    : {
      channel: "email", recipient: email, template: "atelier_rejected",
      payload: { company_name: companyName, rejection_reason: decision.rejection_reason },
    };
}
