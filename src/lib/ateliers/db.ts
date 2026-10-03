import "server-only";
import { z } from "zod";
import type { Db } from "@/lib/catalog/db";
import { DbError } from "@/lib/orders/errors";
import { ADMIN_PAGE_SIZE } from "@/lib/admin/products/http";
import { ATELIER_STATUSES, type AdminAteliersQuery, type AtelierApplyBody, type AtelierStatus } from "@/lib/schemas/ateliers";

// Слой БД заявок ателье (Чертёж 2.2). Клиента передаёт вызывающий код — модуль не читает env и тестируется на мок-клиенте.
// - «Свои» функции (GET /api/ateliers/me, POST /api/ateliers) — СЕССИОННЫЙ клиент: RLS ateliers_select_own_or_admin,
//   ateliers_insert_own_pending, ateliers_update_own_resubmit проверяют владельца повторно.
// - Админские (GET/PATCH /api/admin/ateliers*) — service-role (Блок 3 «Логика (service-role)», 5.10: смена роли при
//   одобрении, email из auth.users, счётчик заказов) — ТОЛЬКО после authorizeAdminApi.
// Всегда явный список колонок; ответ PostgREST проверяется Zod; ошибка БД → DbError (pgCode нужен для 23505).

interface PgResult { data: unknown; error: { message: string; code?: string } | null; count?: number | null }

function check(scope: string, res: PgResult): void {
  if (res.error) throw new DbError(scope, res.error.code || undefined, res.error.message);
}

const status = z.enum(ATELIER_STATUSES);
const ts = z.string().min(10);

// ---------- свои (сессия) ----------

export const OWN_ATELIER_COLUMNS = "id,company_name,inn,city,status,rejection_reason,created_at";

export const ownAtelierRow = z.object({
  id: z.string(),
  company_name: z.string(),
  inn: z.string(),
  city: z.string(),
  status,
  rejection_reason: z.string().nullable(),
  created_at: ts,
});
export type OwnAtelierRow = z.infer<typeof ownAtelierRow>;

export async function selectOwnAtelier(db: Db, userId: string): Promise<OwnAtelierRow | null> {
  const res = await db.from("ateliers").select(OWN_ATELIER_COLUMNS).eq("user_id", userId).maybeSingle();
  check("ateliers.own", res);
  return res.data === null ? null : ownAtelierRow.parse(res.data);
}

const idRow = z.object({ id: z.string() });

/** Новая заявка (status = 'pending' — RLS ateliers_insert_own_pending). 23505 по user_id → DbError (гонка двух подач). */
export async function insertAtelier(db: Db, userId: string, body: AtelierApplyBody): Promise<string> {
  const res = await db.from("ateliers").insert({ user_id: userId, ...body, status: "pending" }).select("id").single();
  check("ateliers.insert", res);
  return idRow.parse(res.data).id;
}

/**
 * Повторная подача после отказа (US-009: «Подать повторно», статус → pending): только своя строка и только из rejected
 * (RLS ateliers_update_own_resubmit + условие в запросе). Причина и дата прошлого рассмотрения сбрасываются.
 * null — строка уже не rejected (админ успел изменить статус).
 */
export async function resubmitAtelier(db: Db, id: string, userId: string, body: AtelierApplyBody): Promise<string | null> {
  const res = await db.from("ateliers")
    .update({ ...body, status: "pending", rejection_reason: null, reviewed_at: null })
    .eq("id", id).eq("user_id", userId).eq("status", "rejected")
    .select("id").maybeSingle();
  check("ateliers.resubmit", res);
  return res.data === null ? null : idRow.parse(res.data).id;
}

// ---------- админка (service-role) ----------

export const ADMIN_ATELIER_COLUMNS =
  "id,user_id,company_name,inn,city,contact_name,phone,website,comment,status,rejection_reason,reviewed_at,created_at";

export const adminAtelierRow = z.object({
  id: z.string(),
  user_id: z.string(),
  company_name: z.string(),
  inn: z.string(),
  city: z.string(),
  contact_name: z.string(),
  phone: z.string(),
  website: z.string().nullable(),
  comment: z.string().nullable(),
  status,
  rejection_reason: z.string().nullable(),
  reviewed_at: ts.nullable(),
  created_at: ts,
});
export type AdminAtelierRow = z.infer<typeof adminAtelierRow>;

/** Список с фильтром статуса: новые сверху, по 20 (индекс idx_ateliers_status). Страница за пределами → пустой список. */
export async function selectAdminAteliers(db: Db, q: AdminAteliersQuery): Promise<{ rows: AdminAtelierRow[]; total: number }> {
  const from = (q.page - 1) * ADMIN_PAGE_SIZE;
  let list = db.from("ateliers").select(ADMIN_ATELIER_COLUMNS, { count: "exact" });
  if (q.status) list = list.eq("status", q.status);
  const res = await list.order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(from, from + ADMIN_PAGE_SIZE - 1);
  if (res.error?.code === "PGRST103") {
    // Requested range not satisfiable: страница за концом списка — total отдельным head-запросом.
    let head = db.from("ateliers").select("id", { count: "exact", head: true });
    if (q.status) head = head.eq("status", q.status);
    const h = await head;
    check("ateliers.admin.count", h);
    return { rows: [], total: h.count ?? 0 };
  }
  check("ateliers.admin.list", res);
  const rows = adminAtelierRow.array().parse(res.data ?? []);
  return { rows, total: res.count ?? rows.length };
}

/** Число заказов ателье (колонка «Заказов»): head-запрос, строки не читаются. */
export async function countAtelierOrders(db: Db, atelierId: string): Promise<number> {
  const res = await db.from("orders").select("id", { count: "exact", head: true }).eq("atelier_id", atelierId);
  check("ateliers.admin.orders_count", res);
  return res.count ?? 0;
}

/** Email владельца заявки из auth.users (Auth Admin API, только service-role). null — пользователь не найден / без email. */
export async function selectUserEmail(db: Db, userId: string): Promise<string | null> {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error) {
    if (error.status === 404) return null;
    throw new DbError("ateliers.admin.email", error.code ?? String(error.status ?? ""), error.message);
  }
  return data.user?.email ?? null;
}

export async function selectAtelierById(db: Db, id: string): Promise<AdminAtelierRow | null> {
  const res = await db.from("ateliers").select(ADMIN_ATELIER_COLUMNS).eq("id", id).maybeSingle();
  check("ateliers.admin.one", res);
  return res.data === null ? null : adminAtelierRow.parse(res.data);
}

/** Есть ли ДРУГАЯ одобренная заявка с этим ИНН (uq_ateliers_inn_approved) — проверка до смены роли. */
export async function existsOtherApprovedInn(db: Db, inn: string, exceptId: string): Promise<boolean> {
  const res = await db.from("ateliers").select("id", { count: "exact", head: true })
    .eq("inn", inn).eq("status", "approved").neq("id", exceptId);
  check("ateliers.admin.inn", res);
  return (res.count ?? 0) > 0;
}

const reviewedRow = z.object({ id: z.string(), status, reviewed_at: ts });
export type ReviewedRow = z.infer<typeof reviewedRow>;

/**
 * Решение по заявке. Условие на прежний статус — защита от гонки двух вкладок: null — статус уже изменили.
 * 23505 (uq_ateliers_inn_approved, одобрение одного ИНН параллельно) → DbError с pgCode.
 */
export async function updateAtelierReview(
  db: Db, id: string, prevStatus: AtelierStatus,
  patch: { status: "approved" | "rejected"; rejection_reason: string | null; reviewed_at: string },
): Promise<ReviewedRow | null> {
  const res = await db.from("ateliers").update(patch).eq("id", id).eq("status", prevStatus)
    .select("id,status,reviewed_at").maybeSingle();
  check("ateliers.admin.review", res);
  return res.data === null ? null : reviewedRow.parse(res.data);
}

/**
 * profiles.role (Блок 3: при approved — 'atelier', при rejected — 'customer', «если был atelier»). Меняется только из
 * перечисленных ролей: администратор никогда не теряет роль admin из-за собственной заявки. Возвращает число строк.
 */
export async function updateProfileRole(db: Db, userId: string, role: "atelier" | "customer", fromRoles: string[]): Promise<number> {
  const res = await db.from("profiles").update({ role }).eq("id", userId).in("role", fromRoles).select("id");
  check("profiles.role", res);
  return Array.isArray(res.data) ? res.data.length : 0;
}
