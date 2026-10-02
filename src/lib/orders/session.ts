import "server-only";
import { cache } from "react";
import { getSessionContext } from "@/lib/auth";
import type { OrderSessionContext } from "./access";

/**
 * Кто оформляет / открывает заказ: user.id (привязка заказа и доступ владельца), роль (admin) и atelierId
 * (только approved, BR-10). getCatalogContext() не годится: в нём нет user.id.
 * Пользователь — только через auth.getUser() (внутри getSessionContext). Сбой проверки сессии → гость:
 * безопасная сторона (меньше доступа, розничные цены; ателье получит PRICE_CHANGED, Edge Case 20).
 */
export const getOrderSessionContext = cache(async (): Promise<OrderSessionContext> => {
  try {
    const s = await getSessionContext();
    const role: unknown = s.role;
    return {
      userId: s.user?.id ?? null,
      role: typeof role === "string" ? role : null,
      atelierId: typeof s.atelierId === "string" ? s.atelierId : null,
    };
  } catch (err) {
    console.error({ scope: "orders.session", err });
    return { userId: null, role: null, atelierId: null };
  }
});
