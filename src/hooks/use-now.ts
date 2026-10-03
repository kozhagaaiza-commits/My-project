"use client";

import { useSyncExternalStore } from "react";

// Общие часы страницы (для таймера брони): один интервал на все подписчики.
// На сервере и при гидратации — null (время клиента не должно попадать в HTML), затем текущее время.
const TICK_MS = 10_000;
let current = 0;

function subscribe(onChange: () => void): () => void {
  current = Date.now();
  const id = setInterval(() => {
    current = Date.now();
    onChange();
  }, TICK_MS);
  return () => clearInterval(id);
}

const getSnapshot = (): number => current || (current = Date.now());
const getServerSnapshot = (): number => 0;

/** Миллисекунды «сейчас», обновляются раз в 10 с; null до гидратации. */
export function useNowMs(): number | null {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return value === 0 ? null : value;
}
