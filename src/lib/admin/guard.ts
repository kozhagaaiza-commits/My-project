import "server-only";
import { notFound, redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";

export interface AdminPageContext {
  userId: string;
  email: string | null;
}

/**
 * Проверка роли admin для страниц /admin/* (layout). Не вошёл → /auth/login?next=/admin;
 * вошёл, но не admin → 404 (не раскрываем существование админки).
 * Dev-подмена: ADMIN_FIXTURES=1 вне production пропускает проверку (инлайн-условие, чтобы бандлер вырезал её из prod).
 */
export async function requireAdminPage(): Promise<AdminPageContext> {
  if (process.env.NODE_ENV !== "production" && process.env.ADMIN_FIXTURES === "1") {
    return { userId: "00000000-0000-4000-8000-000000000001", email: "admin@fixtures.local" };
  }
  const ctx = await getSessionContext();
  if (!ctx.user) redirect("/auth/login?next=/admin");
  if (ctx.role !== "admin") notFound();
  return { userId: ctx.user.id, email: ctx.user.email ?? null };
}

// TODO(backend-engineer, День 6): добавить requireAdminApi(request) для /api/admin/* (401/403, Origin на мутациях) — см. 3.0.
