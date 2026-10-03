import { apiError } from "@/lib/api-error";
import type { AdminApiAuth } from "@/lib/admin/api-guard";
import { adminInternalError, adminOk, noStore, readJsonBody } from "@/lib/admin/http";
import { isUuid } from "@/lib/admin/products/http";
import { featureDisabled } from "@/lib/ateliers/http";
import { atelierReviewNotification } from "@/lib/ateliers/notify";
import type { AdminAtelier, AdminAteliersRepo } from "@/lib/ateliers/types";
import type { NotificationInput } from "@/lib/notifications/types";
import { DbError } from "@/lib/orders/errors";
import { atelierReviewBody, type AtelierReviewBody } from "@/lib/schemas/ateliers";
import type { AtelierReviewed } from "@/types/ateliers";
import { z } from "zod";

// PATCH /api/admin/ateliers/[id] (Блок 3; US-009 шаг 6; BR-10, BR-20; 5.10).
// Порядок: FEATURE_ATELIER (404) → admin + Origin + лимит (401 / 403 / 429) → id (404) → Zod (400) → заявка (404) →
// решение (service-role) → письмо atelier_approved / atelier_rejected (сбой — в лог) → 200 { id, status, reviewed_at }.
//
// Переходы: pending → approved | rejected; rejected → approved (передумали); approved → rejected (отзыв: Блок 3 «при
// rejected — profiles.role = 'customer' (если был atelier)»). Повтор того же решения (двойной клик, вторая вкладка) —
// 200 с текущим состоянием без записи и без повторного письма.
// Порядок записей выбран так, чтобы частичный сбой не открыл цены ателье: цены видит только role = 'atelier' И
// ateliers.status = 'approved' (getSessionContext). Одобрение: роль → статус (сбой статуса — роль откатывается; роль
// без approved цен не даёт). Отказ: статус → роль (после записи статуса цены уже закрыты; сбой роли — только в лог).
// Роль меняется только customer ↔ atelier: администратор не теряет роль admin из-за собственной заявки.

export interface AdminAtelierReviewDeps {
  featureAtelier: boolean;
  authorize(request: Request): Promise<AdminApiAuth>;
  repo(): AdminAteliersRepo;
  /** Постановка письма в очередь; не бросает. */
  enqueue(n: NotificationInput): Promise<void>;
  now(): Date;
}

const notFound = () => apiError("NOT_FOUND", "Заявка не найдена", 404);
const raceConflict = () => apiError("CONFLICT", "Заявку изменили в другой вкладке. Обновите страницу", 409);
const innConflict = (inn: string) => apiError("CONFLICT", `Ателье с ИНН ${inn} уже одобрено под другим аккаунтом`, 409);

const reviewed = (r: { id: string; status: "approved" | "rejected"; reviewed_at: string }): Response => {
  const data: AtelierReviewed = { id: r.id, status: r.status, reviewed_at: new Date(r.reviewed_at).toISOString() };
  return adminOk(data);
};

async function revertRole(repo: AdminAteliersRepo, a: AdminAtelier): Promise<void> {
  try {
    await repo.setRole(a.user_id, "customer", ["atelier"]);
  } catch (err) {
    // Роль atelier без approved цен не открывает (getSessionContext) — только лог.
    console.error({ scope: "admin.ateliers.review.revertRole", atelierId: a.id, err });
  }
}

async function approve(repo: AdminAteliersRepo, a: AdminAtelier, reviewedAt: string): Promise<Response | null> {
  if (await repo.existsOtherApprovedInn(a.inn, a.id)) return innConflict(a.inn);
  const changed = await repo.setRole(a.user_id, "atelier", ["customer"]);
  let row;
  try {
    row = await repo.updateReview(a.id, a.status, { status: "approved", rejection_reason: null, reviewed_at: reviewedAt });
  } catch (err) {
    if (changed > 0) await revertRole(repo, a);
    // Гонка: тот же ИНН одобрили параллельно (uq_ateliers_inn_approved).
    if (err instanceof DbError && err.pgCode === "23505") return innConflict(a.inn);
    throw err;
  }
  if (row === null) {
    if (changed > 0) await revertRole(repo, a);
    return raceConflict();
  }
  return null;
}

async function reject(repo: AdminAteliersRepo, a: AdminAtelier, reason: string, reviewedAt: string): Promise<Response | null> {
  const row = await repo.updateReview(a.id, a.status, { status: "rejected", rejection_reason: reason, reviewed_at: reviewedAt });
  if (row === null) return raceConflict();
  try {
    await repo.setRole(a.user_id, "customer", ["atelier"]);
  } catch (err) {
    console.error({ scope: "admin.ateliers.review.role", atelierId: a.id, err });
  }
  return null;
}

async function notify(deps: AdminAtelierReviewDeps, repo: AdminAteliersRepo, a: AdminAtelier, body: AtelierReviewBody) {
  let email: string | null = null;
  try {
    email = await repo.userEmail(a.user_id);
  } catch (err) {
    console.error({ scope: "admin.ateliers.review.email", atelierId: a.id, err });
    return;
  }
  if (!email) {
    console.error({ scope: "admin.ateliers.review.email", atelierId: a.id, msg: "у пользователя нет email — письмо не отправлено" });
    return;
  }
  await deps.enqueue(atelierReviewNotification(email, a.company_name, body.status === "approved"
    ? { status: "approved" } : { status: "rejected", rejection_reason: body.rejection_reason }));
}

async function handle(request: Request, id: string, deps: AdminAtelierReviewDeps): Promise<Response> {
  if (!deps.featureAtelier) return featureDisabled();
  const auth = await deps.authorize(request);
  if (!auth.ok) return auth.response;
  if (!isUuid(id)) return notFound();

  const parsed = atelierReviewBody.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Проверьте поля формы", 400, { fields: z.flattenError(parsed.error).fieldErrors });
  }
  const body = parsed.data;
  const repo = deps.repo();
  const a = await repo.byId(id);
  if (!a) return notFound();

  if (a.status === body.status) {
    // Повтор решения: состояние уже такое. Для approved роль досинхронизируется (на случай прошлого частичного сбоя).
    if (a.status === "approved") await repo.setRole(a.user_id, "atelier", ["customer"]);
    return reviewed({ id: a.id, status: body.status, reviewed_at: a.reviewed_at ?? deps.now().toISOString() });
  }

  const reviewedAt = deps.now().toISOString();
  const failed = body.status === "approved"
    ? await approve(repo, a, reviewedAt)
    : await reject(repo, a, body.rejection_reason, reviewedAt);
  if (failed) return failed;

  await notify(deps, repo, a, body);
  return reviewed({ id: a.id, status: body.status, reviewed_at: reviewedAt });
}

export function createAdminAtelierReviewHandler(deps: AdminAtelierReviewDeps) {
  return async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    let id = "";
    try {
      ({ id } = await params);
      return noStore(await handle(request, id, deps));
    } catch (err) {
      return noStore(adminInternalError("admin.ateliers.review", err, { atelierId: id }));
    }
  };
}
