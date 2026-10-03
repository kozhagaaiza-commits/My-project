// Клиентские вызовы /api/admin/*: единый разбор ответа Блока 3 — { data, meta } или { error: { code, message, details } }.
import type { AdminListMeta } from "@/lib/admin-products-ui/types";

export type AdminApiResult<T> =
  | { ok: true; data: T; meta: AdminListMeta | null }
  | { ok: false; kind: "network" }
  | { ok: false; kind: "http"; status: number; code: string; message: string; details: unknown };

export const NETWORK_MESSAGE = "Нет соединения. Проверьте интернет и повторите";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function isMeta(v: unknown): v is AdminListMeta {
  return isRecord(v) && typeof v.total === "number" && typeof v.page === "number" && typeof v.per_page === "number";
}

/** Разбор ответа сервера; тело, не похожее на контракт, — ошибка INTERNAL_ERROR с исходным статусом. */
export async function parseAdminResponse<T>(res: Response): Promise<AdminApiResult<T>> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok && isRecord(body) && "data" in body) {
    return { ok: true, data: body.data as T, meta: isMeta(body.meta) ? body.meta : null };
  }
  const err = isRecord(body) && isRecord(body.error) ? body.error : null;
  return {
    ok: false,
    kind: "http",
    status: res.status,
    code: typeof err?.code === "string" ? err.code : "INTERNAL_ERROR",
    message: typeof err?.message === "string" ? err.message : "Что-то пошло не так. Повторите попытку",
    details: err?.details,
  };
}

export async function adminRequest<T>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, body?: unknown, signal?: AbortSignal): Promise<AdminApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return await parseAdminResponse<T>(res);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false, kind: "network" };
  }
}

/** Текст ошибки для тоста. */
export const errorText = (r: Extract<AdminApiResult<unknown>, { ok: false }>): string =>
  r.kind === "network" ? NETWORK_MESSAGE : r.message;

/** multipart-загрузка с прогрессом (fetch прогресс отправки не отдаёт). */
export function uploadAdminImage<T>(
  url: string,
  file: Blob,
  fileName: string,
  alt: string,
  onProgress: (percent: number) => void,
): Promise<AdminApiResult<T>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "text";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => resolve({ ok: false, kind: "network" });
    xhr.onload = () => {
      void parseAdminResponse<T>(new Response(xhr.responseText, { status: xhr.status })).then(resolve);
    };
    const form = new FormData();
    form.append("file", file, fileName);
    form.append("alt", alt);
    xhr.send(form);
  });
}
