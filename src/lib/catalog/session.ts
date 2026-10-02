import "server-only";
import { cache } from "react";
import { getSessionContext } from "@/lib/auth";
import type { CatalogContext } from "@/types/catalog";

/**
 * Контекст каталога из сессии: atelierId (только approved, BR-10) и признак admin.
 * React cache(): один вызов getSessionContext() (getUser + profiles + ateliers) на запрос,
 * даже если страница обращается к каталогу несколько раз (главная — две витрины).
 * Сбой проверки сессии не роняет публичный каталог: покупатель видит розничные цены
 * (безопасная сторона — price_atelier скрыт), ошибка пишется в лог.
 */
export const getCatalogContext = cache(async (): Promise<CatalogContext> => {
  try {
    const ctx = await getSessionContext();
    return { atelierId: ctx.atelierId, isAdmin: ctx.role === "admin" };
  } catch (err) {
    console.error({ scope: "catalog.session", err });
    return { atelierId: null, isAdmin: false };
  }
});
