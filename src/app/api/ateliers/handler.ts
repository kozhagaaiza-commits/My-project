import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { alreadyApplied, featureDisabled } from "@/lib/ateliers/http";
import { atelierStatusLabel } from "@/lib/ateliers/labels";
import type { AtelierSession } from "@/lib/ateliers/types";
import { PRIVATE_NO_STORE, internalError } from "@/lib/catalog/http";
import { DbError } from "@/lib/orders/errors";
import { atelierApplyBody, type AtelierApplyBody } from "@/lib/schemas/ateliers";
import type { AtelierApplied } from "@/types/ateliers";
import { z } from "zod";

// POST /api/ateliers (Блок 3; US-009; BR-20; 5.10): подать заявку или повторно — после отказа.
// Порядок: FEATURE_ATELIER (404) → Origin (403, CSRF) → сессия (401) → JSON → Zod (400) → лимит 3 / 3600 с на
// пользователя (429, fail-closed; считается только валидная заявка — опечатка в ИНН не съедает попытки) →
// своя заявка: нет → insert; rejected → повторная подача (→ pending); pending/approved → 409 ALREADY_APPLIED →
// admin_atelier_applied в очередь (сбой — только в лог) → 201.
// Метрика: цель atelier_applied ставит фронтенд после 201 (5.8), сервер её не вызывает.

export interface AtelierApplyDeps {
  featureAtelier: boolean;
  assertSameOrigin(request: Request): Response | null;
  getSession(): Promise<AtelierSession | null>;
  /** null — можно; иначе готовый 429. Сбой хранилища лимитов — исключение (→ 500). */
  limitApply(userId: string): Promise<Response | null>;
  /** Постановка admin_atelier_applied; не бросает. */
  notifyApplied(a: AtelierApplyBody): Promise<void>;
}

const created = (id: string): Response => {
  const data: AtelierApplied = { id, status: "pending", status_label: atelierStatusLabel("pending") };
  return NextResponse.json({ data }, { status: 201 });
};

async function readBody(request: Request): Promise<unknown> {
  try {
    return JSON.parse(await request.text());
  } catch {
    return null;
  }
}

async function handle(request: Request, deps: AtelierApplyDeps): Promise<Response> {
  if (!deps.featureAtelier) return featureDisabled();
  const forbidden = deps.assertSameOrigin(request);
  if (forbidden) return forbidden;
  const session = await deps.getSession();
  if (!session) return apiError("UNAUTHORIZED", "Войдите в аккаунт", 401);

  const parsed = atelierApplyBody.safeParse(await readBody(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Проверьте поля формы", 400, { fields: z.flattenError(parsed.error).fieldErrors });
  }
  const body = parsed.data;

  const limited = await deps.limitApply(session.userId);
  if (limited) return limited;

  const own = await session.repo.find();
  let id: string;
  if (own === null) {
    try {
      id = await session.repo.insert(body);
    } catch (err) {
      // Две подачи одновременно (двойной клик): уникальный user_id — вторая получает 409 по факту существующей заявки.
      if (!(err instanceof DbError && err.pgCode === "23505")) throw err;
      const now = await session.repo.find();
      return now && now.status === "approved" ? alreadyApplied("approved") : alreadyApplied("pending");
    }
  } else if (own.status === "rejected") {
    const resubmitted = await session.repo.resubmit(own.id, body);
    // Админ успел изменить статус между чтением и обновлением: заявка снова не rejected.
    if (resubmitted === null) return alreadyApplied((await session.repo.find())?.status === "approved" ? "approved" : "pending");
    id = resubmitted;
  } else {
    return alreadyApplied(own.status);
  }

  await deps.notifyApplied(body);
  return created(id);
}

export function createAtelierApplyHandler(deps: AtelierApplyDeps) {
  return async function POST(request: Request): Promise<Response> {
    let res: Response;
    try {
      res = await handle(request, deps);
    } catch (err) {
      res = internalError("ateliers.apply", err);
    }
    res.headers.set("Cache-Control", PRIVATE_NO_STORE);
    return res;
  };
}
