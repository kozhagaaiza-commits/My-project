import type { AdminAteliersQuery, AtelierApplyBody, AtelierStatus } from "@/lib/schemas/ateliers";

// Контракты зависимостей обработчиков ателье (реальные — session.ts / admin-deps.ts, в тестах — in-memory).

export interface OwnAtelier {
  id: string;
  company_name: string;
  inn: string;
  city: string;
  status: AtelierStatus;
  rejection_reason: string | null;
  created_at: string;
}

/** Своя заявка текущего пользователя (сессионный клиент, RLS). */
export interface OwnAtelierRepo {
  find(): Promise<OwnAtelier | null>;
  /** id новой заявки; 23505 (заявка уже есть) — DbError с pgCode. */
  insert(body: AtelierApplyBody): Promise<string>;
  /** rejected → pending; null — заявка уже не в rejected. */
  resubmit(id: string, body: AtelierApplyBody): Promise<string | null>;
}

export interface AtelierSession {
  userId: string;
  repo: OwnAtelierRepo;
}

export interface AdminAtelier extends OwnAtelier {
  user_id: string;
  contact_name: string;
  phone: string;
  website: string | null;
  comment: string | null;
  reviewed_at: string | null;
}

/** Админка ателье (service-role, только после authorizeAdminApi). */
export interface AdminAteliersRepo {
  list(q: AdminAteliersQuery): Promise<{ rows: AdminAtelier[]; total: number }>;
  countOrders(atelierId: string): Promise<number>;
  /** Email из auth.users; null — не найден. Может бросать. */
  userEmail(userId: string): Promise<string | null>;
  byId(id: string): Promise<AdminAtelier | null>;
  existsOtherApprovedInn(inn: string, exceptId: string): Promise<boolean>;
  updateReview(
    id: string, prevStatus: AtelierStatus,
    patch: { status: "approved" | "rejected"; rejection_reason: string | null; reviewed_at: string },
  ): Promise<{ id: string; status: AtelierStatus; reviewed_at: string } | null>;
  /** Число изменённых строк profiles. */
  setRole(userId: string, role: "atelier" | "customer", fromRoles: string[]): Promise<number>;
}
