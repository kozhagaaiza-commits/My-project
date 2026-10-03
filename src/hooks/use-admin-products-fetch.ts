"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest, errorText } from "@/lib/admin-products-ui/api";
import type { AdminListMeta } from "@/lib/admin-products-ui/types";

export type AdminFetchStatus = "loading" | "error" | "ready";

interface Settled<T> {
  key: string;
  data: T | null; // null — ошибка
  meta: AdminListMeta | null;
  error: { status: number | null; code: string | null; message: string } | null;
}

export interface AdminFetch<T> {
  status: AdminFetchStatus;
  data: T | null;
  meta: AdminListMeta | null;
  /** HTTP-статус и код ошибки (404 NOT_FOUND → «Товар не найден»); null для сетевой ошибки. */
  error: { status: number | null; code: string | null; message: string } | null;
  reload: () => void;
  /** Локальное изменение данных (optimistic update); следующая загрузка перезапишет. */
  mutate: (fn: (prev: T) => T) => void;
}

/**
 * GET `url` → { data, meta }. Статус выводится из ключа запроса: смена url или повтор мгновенно дают "loading"
 * без setState внутри эффекта. url = null — запрос не выполняется (статус loading).
 */
export function useAdminFetch<T>(url: string | null): AdminFetch<T> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const key = url === null ? null : `${attempt}:${url}`;

  useEffect(() => {
    if (url === null || key === null) return;
    const controller = new AbortController();
    adminRequest<T>("GET", url, undefined, controller.signal)
      .then((r) => {
        if (r.ok) setSettled({ key, data: r.data, meta: r.meta, error: null });
        else setSettled({ key, data: null, meta: null, error: { status: r.kind === "http" ? r.status : null, code: r.kind === "http" ? r.code : null, message: errorText(r) } });
      })
      .catch(() => undefined); // AbortError — запрос заменён новым
    return () => controller.abort();
  }, [url, key]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const mutate = useCallback((fn: (prev: T) => T) => {
    setSettled((s) => (s && s.data !== null ? { ...s, data: fn(s.data) } : s));
  }, []);

  if (key === null || settled?.key !== key) return { status: "loading", data: null, meta: null, error: null, reload, mutate };
  if (settled.data === null) return { status: "error", data: null, meta: null, error: settled.error, reload, mutate };
  return { status: "ready", data: settled.data, meta: settled.meta, error: null, reload, mutate };
}
