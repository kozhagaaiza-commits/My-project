import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { internalError, validationError } from "@/lib/catalog/http";
import { formatRub } from "@/lib/money";
import type { AdminRefundInput, AdminRefundOutcome } from "@/lib/payments/admin-refund";
import { refundBody, type RefundExceedsDetails, type RefundProviderErrorDetails } from "@/lib/schemas/admin-refund";
import { uuid } from "@/lib/schemas/common";

// Тело POST /api/admin/orders/[id]/refund (Блок 3, US-008) с внедряемыми зависимостями (route.ts — реальные).
// Порядок: admin (401 / 403 / Origin 403 / 429 — до любой работы) → id (не uuid → 404) → Zod тела (400) →
// сервис возврата (src/lib/payments/admin-refund.ts) → ответ. Ответ никогда не кэшируется.

export interface RefundRouteContext {
  params: Promise<{ id: string }>;
}

export interface AdminRefundDeps {
  /** Совместимо с authorizeAdminApi из @/lib/admin/guard. */
  authorize(request: Request): Promise<{ ok: true; admin: { userId: string } } | { ok: false; response: Response }>;
  createRefund(input: AdminRefundInput): Promise<AdminRefundOutcome>;
}

export const REFUND_IN_PROGRESS_MESSAGE = "Предыдущий возврат по заказу ещё обрабатывается. Обновите страницу через несколько минут";
export const REFUND_CONFLICT_MESSAGE = "Возврат по этому платежу уже оформляется. Обновите страницу";
export const REFUND_UNAVAILABLE_MESSAGE = "ЮKassa не ответила. Повторите возврат через несколько минут";
export const REFUND_PAYMENT_UNCONFIRMED_MESSAGE = "Оплата заказа ещё не подтверждена. Обновите страницу через минуту";

const NO_STORE = "private, no-store";

function respond(out: AdminRefundOutcome): Response {
  switch (out.kind) {
    case "ok":
      return NextResponse.json({ data: out.data });
    case "not_found":
      return apiError("NOT_FOUND", "Заказ не найден", 404);
    case "exceeds": {
      const details: RefundExceedsDetails = { refundable_amount: out.refundable };
      return apiError("REFUND_EXCEEDS_PAID", `Максимум к возврату: ${formatRub(out.refundable)}`, 422, details);
    }
    case "in_progress":
      return apiError("CONFLICT", REFUND_IN_PROGRESS_MESSAGE, 409);
    case "conflict":
      return apiError("CONFLICT", REFUND_CONFLICT_MESSAGE, 409);
    case "rejected": {
      const details: RefundProviderErrorDetails = { yookassa_code: out.code };
      return apiError("PAYMENT_PROVIDER_ERROR", `ЮKassa отклонила возврат: ${out.description}`, 502, details);
    }
    case "unavailable": {
      const details: RefundProviderErrorDetails = { yookassa_code: null };
      return apiError("PAYMENT_PROVIDER_ERROR", REFUND_UNAVAILABLE_MESSAGE, 502, details);
    }
    case "payment_unconfirmed":
      return apiError("CONFLICT", REFUND_PAYMENT_UNCONFIRMED_MESSAGE, 409);
    case "restock_not_allowed": {
      // Формат 400 VALIDATION_ERROR (details.fields): Dialog показывает ошибку поля amount inline.
      const fields: Record<string, string[]> = { restock: [out.message] };
      if (out.partial) fields.amount = [out.message];
      return apiError("VALIDATION_ERROR", out.message, 400, { fields });
    }
  }
}

async function handle(request: Request, routeCtx: RefundRouteContext, deps: AdminRefundDeps): Promise<Response> {
  const auth = await deps.authorize(request);
  if (!auth.ok) return auth.response;

  const { id } = await routeCtx.params;
  if (!uuid.safeParse(id).success) return apiError("NOT_FOUND", "Заказ не найден", 404);

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    raw = null; // пустое или битое тело → 400 с fields = {}
  }
  const parsed = refundBody.safeParse(raw);
  if (!parsed.success) return validationError("Проверьте поля формы", parsed.error);

  const out = await deps.createRefund({ orderId: id, ...parsed.data, adminId: auth.admin.userId });
  return respond(out);
}

export function createAdminRefundHandler(deps: AdminRefundDeps) {
  return async function POST(request: Request, routeCtx: RefundRouteContext): Promise<Response> {
    let res: Response;
    try {
      res = await handle(request, routeCtx, deps);
    } catch (err) {
      res = internalError("admin.orders.refund", err);
    }
    res.headers.set("Cache-Control", NO_STORE);
    return res;
  };
}
