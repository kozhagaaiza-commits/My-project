import { z } from "zod";

// Ошибки клиента ЮKassa. Секретный ключ и заголовок Authorization в сообщения не попадают:
// только HTTP-статус, code и description ЮKassa.

export const yookassaErrorBody = z.looseObject({
  type: z.string().optional(),
  id: z.string().optional(),
  code: z.string().optional(),
  description: z.string().optional(),
  parameter: z.string().optional(),
  retry_after: z.number().optional(),
});
export type YookassaErrorBody = z.infer<typeof yookassaErrorBody>;

/** 4xx от ЮKassa: запрос отклонён (неверный чек, ключи, параметры, объект не найден). Не повторяется. */
export class YookassaApiError extends Error {
  readonly status: number;
  readonly yookassa: YookassaErrorBody;
  constructor(status: number, body: YookassaErrorBody) {
    super(body.description ?? "YooKassa error");
    this.name = "YookassaApiError";
    this.status = status;
    this.yookassa = body;
  }
  get code(): string | undefined {
    return this.yookassa.code;
  }
}

/**
 * Сеть, таймаут, 5xx, 202, 429, 409 (POST) — после всех попыток или по истечении дедлайна.
 * Ключ идемпотентности позволяет безопасно повторить запрос позже.
 */
export class YookassaUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "YookassaUnavailableError";
  }
}

/** 2xx, но тело не JSON нужной формы. */
export class YookassaResponseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "YookassaResponseError";
  }
}
