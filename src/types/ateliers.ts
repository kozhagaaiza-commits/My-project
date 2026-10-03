// Контракты API функции «Опт для ателье» (Блок 3, «Аккаунт и ателье» и «Админка — ателье»).

export type AtelierStatusValue = "pending" | "approved" | "rejected";

/** GET /api/ateliers/me → { data: MyAtelier | null }. */
export interface MyAtelier {
  id: string;
  company_name: string;
  inn: string;
  city: string;
  status: AtelierStatusValue;
  status_label: string;
  rejection_reason: string | null;
  created_at: string; // ISO
}

/** POST /api/ateliers → 201 { data: AtelierApplied }. */
export interface AtelierApplied {
  id: string;
  status: "pending";
  status_label: string;
}

/** GET /api/admin/ateliers → { data: AdminAtelierListItem[], meta }. */
export interface AdminAtelierListItem {
  id: string;
  company_name: string;
  inn: string;
  city: string;
  contact_name: string;
  phone: string;
  email: string | null;
  website: string | null;
  comment: string | null;
  status: AtelierStatusValue;
  orders_count: number;
  created_at: string; // ISO
}

/** PATCH /api/admin/ateliers/[id] → { data: AtelierReviewed }. */
export interface AtelierReviewed {
  id: string;
  status: "approved" | "rejected";
  reviewed_at: string; // ISO
}
