import "server-only";
import type { OrderAccessRow } from "./db";
import { tokenMatchesHash } from "./token";

// Доступ к заказу (Блок 3: GET /api/orders/[number], POST /api/orders/[number]/pay; Блок 5.10, Edge Case 22).
// Доступ есть, если: токен из ссылки совпадает с orders.public_token_hash (SHA-256, timingSafeEqual),
// ИЛИ сессия владельца (orders.user_id = user.id), ИЛИ admin (если разрешено эндпоинтом).
// Нет заказа, неверный номер, неверный/битый токен — ОДИН И ТОТ ЖЕ результат { found: false } → 404 «Заказ не найден».

export const ORDER_NUMBER_RE = /^FC-\d{2}-\d{6}$/;
export const ORDER_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

/** Сессия для заказов: userId — auth.getUser(), role — profiles.role, atelierId — только approved (BR-10). */
export interface OrderSessionContext {
  userId: string | null;
  role: string | null;
  atelierId: string | null;
}

export type OrderAccessVia = "token" | "owner" | "admin";
export type OrderAccessResult = { found: true; order: OrderAccessRow; via: OrderAccessVia } | { found: false };

export interface VerifyOrderAccessInput {
  number: string;
  token?: string | null;
  ctx: Pick<OrderSessionContext, "userId" | "role">;
  /** POST /pay — только токен или владелец (Блок 3), GET заказа — ещё и admin. По умолчанию true. */
  allowAdmin?: boolean;
}

export interface VerifyOrderAccessDeps {
  selectOrder(number: string): Promise<OrderAccessRow | null>;
}

const NOT_FOUND: OrderAccessResult = { found: false };
// Хэш-заглушка: при отсутствии заказа сравнение всё равно выполняется (ответ не отличается и по работе).
const DUMMY_HASH = "0".repeat(64);

export async function verifyOrderAccess(input: VerifyOrderAccessInput, deps: VerifyOrderAccessDeps): Promise<OrderAccessResult> {
  if (!ORDER_NUMBER_RE.test(input.number)) return NOT_FOUND;
  const token = typeof input.token === "string" && ORDER_TOKEN_RE.test(input.token) ? input.token : null;

  const order = await deps.selectOrder(input.number);
  const tokenOk = token !== null && tokenMatchesHash(token, order?.public_token_hash ?? DUMMY_HASH);
  if (!order) return NOT_FOUND;

  if (tokenOk) return { found: true, order, via: "token" };
  if (input.ctx.userId !== null && order.user_id !== null && order.user_id === input.ctx.userId) {
    return { found: true, order, via: "owner" };
  }
  if ((input.allowAdmin ?? true) && input.ctx.role === "admin") return { found: true, order, via: "admin" };
  return NOT_FOUND;
}
