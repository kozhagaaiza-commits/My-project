// Тонкий клиент к /api/admin/* (формат ответов — Чертёж, 3.0: { data, meta } / { error: { code, message, details } }).
// Никогда не бросает: сетевые и разобранные ошибки возвращаются как { ok: false }.

export interface ApiFailure {
  ok: false;
  status: number; // 0 — нет сети
  code: string;
  message: string;
  details: Record<string, unknown> | null;
}

export interface ApiSuccess<T, M = unknown> {
  ok: true;
  data: T;
  meta: M | null;
}

export type ApiResult<T, M = unknown> = ApiSuccess<T, M> | ApiFailure;

const FALLBACK_MESSAGE = "Что-то пошло не так. Повторите попытку";
const TIMEOUT_MESSAGE = "Ответ не получен. Обновите страницу и проверьте возвраты заказа";
const NETWORK_MESSAGE = "Нет соединения. Проверьте интернет и повторите";

interface RawBody {
  data?: unknown;
  meta?: unknown;
  error?: { code?: unknown; message?: unknown; details?: unknown };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

async function readBody(res: Response): Promise<RawBody | null> {
  try {
    const body: unknown = await res.json();
    return isRecord(body) ? (body as RawBody) : null;
  } catch {
    return null;
  }
}

export async function adminRequest<T, M = unknown>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<ApiResult<T, M>> {
  try {
    const res = await fetch(url, {
      method,
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await readBody(res);
    if (res.ok && raw && raw.data !== undefined) {
      return { ok: true, data: raw.data as T, meta: (raw.meta ?? null) as M | null };
    }
    if (res.status === 401 && typeof window !== "undefined") {
      const login = new URL("/auth/login", window.location.origin);
      login.searchParams.set("next", window.location.pathname);
      window.location.assign(login); // полная перезагрузка: сессия истекла
    }
    const err = raw?.error;
    return {
      ok: false,
      status: res.status,
      code: typeof err?.code === "string" ? err.code : "INTERNAL_ERROR",
      message: typeof err?.message === "string" && err.message ? err.message : FALLBACK_MESSAGE,
      details: isRecord(err?.details) ? err.details : null,
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    if (e instanceof DOMException && e.name === "TimeoutError") {
      return { ok: false, status: 0, code: "TIMEOUT", message: TIMEOUT_MESSAGE, details: null };
    }
    return { ok: false, status: 0, code: "NETWORK_ERROR", message: NETWORK_MESSAGE, details: null };
  }
}

/** details.fields из 400 VALIDATION_ERROR → { поле: первое сообщение }. */
export function fieldErrors(failure: ApiFailure): Record<string, string> {
  const fields = failure.details?.fields;
  if (!isRecord(fields)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value) && typeof value[0] === "string") out[key] = value[0];
  }
  return out;
}
