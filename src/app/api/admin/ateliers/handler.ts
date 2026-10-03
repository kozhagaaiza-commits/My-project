import { apiError } from "@/lib/api-error";
import type { AdminApiAuth } from "@/lib/admin/api-guard";
import { adminInternalError, adminOk, noStore } from "@/lib/admin/http";
import { ADMIN_PAGE_SIZE } from "@/lib/admin/products/http";
import { mapLimit } from "@/lib/admin/vehicles/fitting";
import { featureDisabled } from "@/lib/ateliers/http";
import type { AdminAtelier, AdminAteliersRepo } from "@/lib/ateliers/types";
import { queryObject } from "@/lib/catalog/http";
import { adminAteliersQuery } from "@/lib/schemas/ateliers";
import type { AdminAtelierListItem } from "@/types/ateliers";
import { z } from "zod";

// GET /api/admin/ateliers?status=pending&page=1 (Блок 3 «Админка — ателье»; Блок 4 «Админка — Ателье»).
// Порядок: FEATURE_ATELIER (404, BR-20) → admin (401 / 403 / 429) → Zod → список (новые сверху, по 20) →
// orders_count — одним запросом по id страницы; email (auth.users) — по строке, не больше 5 запросов одновременно.
// Сбой чтения email не роняет список (телефон в строке есть): email = null, ошибка в лог.

export interface AdminAteliersListDeps {
  featureAtelier: boolean;
  authorize(request: Request): Promise<AdminApiAuth>;
  repo(): AdminAteliersRepo;
}

export const ATELIER_LOOKUP_CONCURRENCY = 5;

async function toItem(repo: AdminAteliersRepo, r: AdminAtelier, ordersCount: number): Promise<AdminAtelierListItem> {
  const email = await repo.userEmail(r.user_id).catch((err: unknown) => {
    console.error({ scope: "admin.ateliers.email", atelierId: r.id, err });
    return null;
  });
  return {
    id: r.id,
    company_name: r.company_name,
    inn: r.inn,
    city: r.city,
    contact_name: r.contact_name,
    phone: r.phone,
    email,
    website: r.website,
    comment: r.comment,
    status: r.status,
    orders_count: ordersCount,
    created_at: new Date(r.created_at).toISOString(),
  };
}

async function handle(request: Request, deps: AdminAteliersListDeps): Promise<Response> {
  if (!deps.featureAtelier) return featureDisabled();
  const auth = await deps.authorize(request);
  if (!auth.ok) return auth.response;

  const parsed = adminAteliersQuery.safeParse(queryObject(request.url));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Неверные параметры запроса", 400, { fields: z.flattenError(parsed.error).fieldErrors });
  }
  const repo = deps.repo();
  const { rows, total } = await repo.list(parsed.data);
  const counts = await repo.countOrders(rows.map((r) => r.id));
  const items = await mapLimit(rows, ATELIER_LOOKUP_CONCURRENCY, (r) => toItem(repo, r, counts.get(r.id) ?? 0));
  return adminOk(items, { total, page: parsed.data.page, per_page: ADMIN_PAGE_SIZE });
}

export function createAdminAteliersListHandler(deps: AdminAteliersListDeps) {
  return async function GET(request: Request): Promise<Response> {
    try {
      return noStore(await handle(request, deps));
    } catch (err) {
      return noStore(adminInternalError("admin.ateliers.list", err));
    }
  };
}
