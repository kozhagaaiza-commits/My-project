import { apiError } from "@/lib/api-error";
import type { AdminApiAuth } from "@/lib/admin/api-guard";
import {
  adminInternalError, adminOk, adminOrderNotFound, adminValidationError, fieldValidationError, noStore, orderConflict, readJsonBody,
} from "@/lib/admin/http";
import { changeOrderStatus, type StatusChangeDeps } from "@/lib/admin/status-change";
import { invalidTransitionMessage } from "@/lib/order-status";
import { adminOrderParams, orderStatusChangeBody } from "@/lib/schemas/admin-orders";

// Тело PATCH /api/admin/orders/[id]/status (Блок 3; 5.3; US-007; BR-12, BR-19; Edge Case 14).
// Порядок: admin + Origin (401 / 403 / 429) → id (не uuid → 404) → JSON + Zod (paid / refunded / pending_payment —
// не принимаются схемой → 400) → changeOrderStatus → 200 | 400 (трек / заметка курьера) | 404 | 409.

export interface StatusRouteContext {
  params: Promise<{ id: string }>;
}

export interface ChangeStatusHandlerDeps extends StatusChangeDeps {
  authorize(request: Request): Promise<AdminApiAuth>;
}

async function handle(request: Request, routeCtx: StatusRouteContext, deps: ChangeStatusHandlerDeps): Promise<Response> {
  const auth = await deps.authorize(request);
  if (!auth.ok) return auth.response;
  const params = adminOrderParams.safeParse(await routeCtx.params);
  if (!params.success) return adminOrderNotFound();

  const body = orderStatusChangeBody.safeParse(await readJsonBody(request));
  if (!body.success) return adminValidationError(body.error);

  const result = await changeOrderStatus(deps, { orderId: params.data.id, adminUserId: auth.admin.userId, body: body.data });
  switch (result.kind) {
    case "not_found":
      return adminOrderNotFound();
    case "conflict":
      return orderConflict();
    case "invalid_transition":
      return apiError("INVALID_STATUS_TRANSITION", invalidTransitionMessage(result.from, result.to), 409, {
        from: result.from, to: result.to, allowed: result.allowed,
      });
    case "field_required":
      return fieldValidationError(result.field, result.message);
    case "ok":
      return adminOk(result.data);
  }
}

export function createChangeStatusHandler(deps: ChangeStatusHandlerDeps) {
  return async function PATCH(request: Request, routeCtx: StatusRouteContext): Promise<Response> {
    try {
      return noStore(await handle(request, routeCtx, deps));
    } catch (err) {
      return noStore(adminInternalError("admin.orders.status", err));
    }
  };
}
