// Подписи статусов заявки ателье (Блок 3 «На рассмотрении»; Блок 4 — вкладки «На рассмотрении / Одобрены / Отклонены»).
// Чистый модуль: используется сервером (status_label в ответах) и может импортироваться клиентом.

export const ATELIER_STATUS_LABELS: Record<string, string> = {
  pending: "На рассмотрении",
  approved: "Одобрена",
  rejected: "Отклонена",
};

export const atelierStatusLabel = (status: string): string => ATELIER_STATUS_LABELS[status] ?? status;
