"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { METRIKA_SCRIPT_URL, initMetrika, isMetrikaPath, metrikaCounterId, trackHit } from "@/lib/analytics";

// Счётчик Яндекс Метрики (5.8; 5.11 п.5): tag.js через next/script afterInteractive, init с defer: true, вебвизор выключен.
// Хит — вручную на каждую смену pathname (без query: в /orders/* лежит секретный ?t=). Нет NEXT_PUBLIC_YM_COUNTER_ID — ничего
// не рендерится; в /admin не грузится. Порядок эффектов важен: init стоит в очереди ym раньше первого hit.

export function MetrikaScript() {
  const counterId = metrikaCounterId();
  const pathname = usePathname();
  const enabled = counterId !== null && isMetrikaPath(pathname);

  useEffect(() => {
    if (enabled) initMetrika(counterId);
  }, [enabled, counterId]);

  useEffect(() => {
    if (enabled) trackHit(pathname, counterId);
  }, [enabled, pathname, counterId]);

  if (!enabled) return null;
  return <Script id="ym-tag" src={METRIKA_SCRIPT_URL} strategy="afterInteractive" />;
}
