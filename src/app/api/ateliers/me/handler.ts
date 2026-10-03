import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { featureDisabled, toMyAtelier } from "@/lib/ateliers/http";
import type { AtelierSession } from "@/lib/ateliers/types";
import { PRIVATE_NO_STORE, internalError } from "@/lib/catalog/http";

// GET /api/ateliers/me (Блок 3, «Аккаунт и ателье»): статус заявки текущего пользователя.
// Порядок: FEATURE_ATELIER (404 FEATURE_DISABLED, BR-20) → сессия (401) → своя заявка (RLS) → { data } | { data: null }.
// Лимита в 5.10 нет. Ответ приватный (ИНН, причина отказа).

export interface MyAtelierDeps {
  featureAtelier: boolean;
  getSession(): Promise<AtelierSession | null>;
}

export function createMyAtelierHandler(deps: MyAtelierDeps) {
  return async function GET(): Promise<Response> {
    let res: Response;
    try {
      if (!deps.featureAtelier) {
        res = featureDisabled();
      } else {
        const session = await deps.getSession();
        if (!session) {
          res = apiError("UNAUTHORIZED", "Войдите в аккаунт", 401);
        } else {
          const own = await session.repo.find();
          res = NextResponse.json({ data: own ? toMyAtelier(own) : null });
        }
      }
    } catch (err) {
      res = internalError("ateliers.me", err);
    }
    res.headers.set("Cache-Control", PRIVATE_NO_STORE);
    return res;
  };
}
