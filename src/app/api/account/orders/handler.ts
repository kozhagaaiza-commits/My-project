import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { PRIVATE_NO_STORE, internalError, queryObject, validationError } from "@/lib/catalog/http";
import { z } from "zod";
import { page } from "@/lib/schemas/common";
import type { AccountOrdersPage } from "@/types/account";

// GET /api/account/orders?page=1 (Блок 3, «Аккаунт и ателье»): заказы текущего пользователя (customer, atelier).
// Порядок: сессия (401 «Войдите в аккаунт») → Zod → список. Лимитов Чертёж не задаёт (5.10). Ответ приватный.

const accountOrdersQuery = z.object({ page });

export interface AccountOrdersDeps {
  /** user.id из auth.getUser(); null — гость. */
  getUserId(): Promise<string | null>;
  listOrders(userId: string, page: number): Promise<AccountOrdersPage>;
}

export function createAccountOrdersHandler(deps: AccountOrdersDeps) {
  return async function GET(request: Request): Promise<Response> {
    let res: Response;
    try {
      const userId = await deps.getUserId();
      if (!userId) {
        res = apiError("UNAUTHORIZED", "Войдите в аккаунт", 401);
      } else {
        const query = accountOrdersQuery.safeParse(queryObject(request.url));
        if (!query.success) {
          res = validationError("Проверьте параметры запроса", query.error);
        } else {
          const result = await deps.listOrders(userId, query.data.page);
          res = NextResponse.json({ data: result.orders, meta: { total: result.total, page: result.page, per_page: result.per_page } });
        }
      }
    } catch (err) {
      res = internalError("account.orders", err);
    }
    res.headers.set("Cache-Control", PRIVATE_NO_STORE);
    return res;
  };
}
