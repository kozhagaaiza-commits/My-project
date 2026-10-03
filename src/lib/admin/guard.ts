import "server-only";
import { notFound, redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { FIXTURE_ADMIN, type AdminApiContext } from "./api-guard";

// Проверка /api/admin/* (requireAdminApi, authorizeAdminApi) — в api-guard.ts, реэкспорт ниже.
export {
  ADMIN_RATE_LIMIT, authorizeAdminApi, authorizeAdminApiWith, requireAdminApi,
  type AdminApiAuth, type AdminApiDeps, type AdminApiOptions,
} from "./api-guard";

export type AdminPageContext = AdminApiContext;

/**
 * Проверка роли admin для страниц /admin/* (layout). Не вошёл → /auth/login?next=/admin;
 * вошёл, но не admin → 404 (не раскрываем существование админки).
 * Dev-подмена: ADMIN_FIXTURES=1 вне production пропускает проверку (инлайн-условие, чтобы бандлер вырезал её из prod).
 */
export async function requireAdminPage(): Promise<AdminPageContext> {
  if (process.env.NODE_ENV !== "production" && process.env.ADMIN_FIXTURES === "1") {
    return { ...FIXTURE_ADMIN };
  }
  const ctx = await getSessionContext();
  if (!ctx.user) redirect("/auth/login?next=/admin");
  if (ctx.role !== "admin") notFound();
  return { userId: ctx.user.id, email: ctx.user.email ?? null };
}
