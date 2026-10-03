import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// Токен доступа к заказу без аккаунта (Чертёж 5.10, ОТСТУПЛЕНИЕ A28).
// В Чертеже токен случайный (randomBytes(24)); но сервер не сможет восстановить ссылку для письма об оплате
// (в БД только SHA-256), а повтор POST /api/orders с тем же client_request_id вернул бы заказ с новым токеном,
// не подходящим к сохранённому хэшу. Поэтому токен ДЕТЕРМИНИРОВАН: HMAC-SHA256(ORDER_TOKEN_SECRET, client_request_id),
// первые 32 символа base64url (192 бита). Без секрета сервера токен не вычислить даже зная client_request_id и БД;
// в БД по-прежнему хранится только SHA-256 токена (orders.public_token_hash).

const secretOf = (secret?: string) => secret ?? env.ORDER_TOKEN_SECRET;

export function orderToken(clientRequestId: string, secret?: string): string {
  return createHmac("sha256", secretOf(secret)).update(clientRequestId.toLowerCase()).digest("base64url").slice(0, 32);
}

/** SHA-256 токена в hex — значение orders.public_token_hash. */
export function hashOrderToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Сравнение токена с сохранённым хэшем без утечки по времени (Блок 5.10). */
export function tokenMatchesHash(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashOrderToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Абсолютная ссылка на страницу заказа: `${SITE}/orders/FC-26-000123?t=<token>`. */
export function orderPageUrl(orderNumber: string, token: string, siteUrl: string = env.NEXT_PUBLIC_SITE_URL): string {
  return `${siteUrl.replace(/\/$/, "")}/orders/${orderNumber}?t=${token}`;
}
