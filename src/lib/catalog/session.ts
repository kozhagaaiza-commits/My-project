import "server-only";
import { getSessionContext } from "@/lib/auth";
import type { CatalogContext } from "@/types/catalog";

/**
 * Контекст каталога из сессии: atelierId (только approved, BR-10) и признак admin.
 * Сбой проверки сессии не роняет публичный каталог: покупатель видит розничные цены
 * (безопасная сторона — price_atelier скрыт), ошибка пишется в лог.
 */
export async function getCatalogContext(): Promise<CatalogContext> {
  try {
    const ctx = await getSessionContext();
    return { atelierId: ctx.atelierId, isAdmin: ctx.role === "admin" };
  } catch (err) {
    console.error({ scope: "catalog.session", err });
    return { atelierId: null, isAdmin: false };
  }
}
