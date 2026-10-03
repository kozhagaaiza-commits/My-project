import type { AtelierStatusValue } from "@/types/ateliers";

// URL-параметры списка заявок ателье (Чертёж, Блок 4 «Админка — Ателье»): status (вкладка, по умолчанию pending), page.

export interface AteliersFilters {
  status: AtelierStatusValue;
  page: number;
}

export const ATELIER_TABS: ReadonlyArray<{ key: AtelierStatusValue; label: string; empty: string }> = [
  { key: "pending", label: "На рассмотрении", empty: "Новых заявок нет" },
  { key: "approved", label: "Одобрены", empty: "Одобренных заявок нет" },
  { key: "rejected", label: "Отклонены", empty: "Отклонённых заявок нет" },
];

export const DEFAULT_ATELIER_TAB: AtelierStatusValue = "pending";
export const ATELIERS_PER_PAGE = 20;
/** Длина причины отказа — atelierReviewBody (Блок 3). */
export const ATELIER_REJECTION_MIN = 10;
export const ATELIER_REJECTION_MAX = 500;

export const isAtelierStatus = (v: unknown): v is AtelierStatusValue => ATELIER_TABS.some((t) => t.key === v);

export function parseAteliersFilters(search: string | URLSearchParams): AteliersFilters {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const status = params.get("status");
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  return {
    status: isAtelierStatus(status) ? status : DEFAULT_ATELIER_TAB,
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

/** Ссылка на /admin/ateliers; значения по умолчанию в URL не пишутся. */
export function ateliersHref(f: AteliersFilters): string {
  const params = new URLSearchParams();
  if (f.status !== DEFAULT_ATELIER_TAB) params.set("status", f.status);
  if (f.page > 1) params.set("page", String(f.page));
  const qs = params.toString();
  return qs ? `/admin/ateliers?${qs}` : "/admin/ateliers";
}

export const ateliersApiUrl = (f: AteliersFilters): string => `/api/admin/ateliers?status=${f.status}&page=${f.page}`;

/** Проверка ИНН по реестру ЕГРЮЛ (Блок 4): открывается в новой вкладке. */
export const EGRUL_URL = "https://egrul.nalog.ru/";
