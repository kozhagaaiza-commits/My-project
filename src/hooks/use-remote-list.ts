"use client";

import { useCallback, useEffect, useState } from "react";

export type RemoteStatus = "idle" | "loading" | "error" | "ready";

interface Settled<T> {
  key: string;
  data: T | null; // null — ошибка
}

/**
 * GET `url` → `{ data: T }`. url = null → idle. Статус выводится из ключа запроса,
 * поэтому смена url/повтор мгновенно дают "loading" без setState внутри эффекта.
 */
export function useRemoteList<T>(url: string | null): {
  status: RemoteStatus;
  data: T | null;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const key = url === null ? null : `${attempt}:${url}`;

  useEffect(() => {
    if (url === null || key === null) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { data?: T };
        if (body.data === undefined) throw new Error("Empty response");
        setSettled({ key, data: body.data });
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setSettled({ key, data: null });
      });
    return () => controller.abort();
  }, [url, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (key === null) return { status: "idle", data: null, retry };
  if (settled?.key !== key) return { status: "loading", data: null, retry };
  return settled.data === null
    ? { status: "error", data: null, retry }
    : { status: "ready", data: settled.data, retry };
}
