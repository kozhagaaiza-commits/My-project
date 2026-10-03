"use client";

import { useCallback, useEffect, useState } from "react";

export type RemoteStatus = "idle" | "loading" | "error" | "ready";

interface Settled<T> {
  key: string;
  data: T | null; // null — ошибка
  /** Текст из ответа API при HTTP 404 (`{ error: { message } }`) — повтор не поможет. */
  message: string | null;
}

class NotFoundError extends Error {}

async function notFoundMessage(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    return typeof body.error?.message === "string" && body.error.message ? body.error.message : null;
  } catch {
    return null;
  }
}

/**
 * GET `url` → `{ data: T }`. url = null → idle. Статус выводится из ключа запроса,
 * поэтому смена url/повтор мгновенно дают "loading" без setState внутри эффекта.
 */
export function useRemoteList<T>(url: string | null): {
  status: RemoteStatus;
  data: T | null;
  /** Не null только для HTTP 404 с текстом из ответа: «Повторить» не показываем. */
  message: string | null;
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
        if (res.status === 404) {
          const message = await notFoundMessage(res);
          if (message) throw new NotFoundError(message);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { data?: T };
        if (body.data === undefined) throw new Error("Empty response");
        setSettled({ key, data: body.data, message: null });
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setSettled({ key, data: null, message: e instanceof NotFoundError ? e.message : null });
      });
    return () => controller.abort();
  }, [url, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (key === null) return { status: "idle", data: null, message: null, retry };
  if (settled?.key !== key) return { status: "loading", data: null, message: null, retry };
  return settled.data === null
    ? { status: "error", data: null, message: settled.message, retry }
    : { status: "ready", data: settled.data, message: null, retry };
}
