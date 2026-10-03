"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest, type ApiFailure } from "@/lib/admin-ui/api";
import type { ListMeta } from "@/lib/admin-ui/types";

export type AdminResourceStatus = "idle" | "loading" | "ready" | "error";

interface Settled<T, M> {
  key: string;
  data: T | null;
  meta: M | null;
  error: ApiFailure | null;
}

export interface AdminResource<T, M> {
  status: AdminResourceStatus;
  /** Последние успешно загруженные данные; во время повторной загрузки остаются (null — после ошибки). */
  data: T | null;
  meta: M | null;
  error: ApiFailure | null;
  reload: () => void;
}

/**
 * GET `url` → { data, meta }. url = null → idle. Статус выводится из ключа запроса: смена url и reload()
 * мгновенно дают "loading" без setState внутри эффекта.
 */
export function useAdminResource<T, M = ListMeta>(url: string | null): AdminResource<T, M> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T, M> | null>(null);
  const key = url === null ? null : `${attempt}:${url}`;

  useEffect(() => {
    if (url === null || key === null) return;
    const controller = new AbortController();
    adminRequest<T, M>("GET", url, undefined, controller.signal)
      .then((res) => {
        setSettled(
          res.ok
            ? { key, data: res.data, meta: res.meta, error: null }
            : { key, data: null, meta: null, error: res },
        );
      })
      .catch(() => {
        /* AbortError: запрос заменён новым или компонент размонтирован */
      });
    return () => controller.abort();
  }, [url, key]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const data = settled?.data ?? null;
  const meta = settled?.meta ?? null;
  if (key === null) return { status: "idle", data, meta, error: null, reload };
  if (settled?.key !== key) return { status: "loading", data, meta, error: null, reload };
  return { status: settled.error ? "error" : "ready", data, meta, error: settled.error, reload };
}
