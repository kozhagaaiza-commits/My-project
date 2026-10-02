import "server-only";
import { getSessionContext } from "@/lib/auth";
import type { CatalogContext } from "@/types/catalog";

/** Контекст каталога для Server Components: одобренное ателье видит price_atelier. Любая ошибка сессии → розница. */
export async function getCatalogContext(): Promise<CatalogContext> {
  try {
    const { atelierId } = await getSessionContext();
    return { atelierId };
  } catch {
    return { atelierId: null };
  }
}
