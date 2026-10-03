"use client";

import { useEffect, useState } from "react";
import { fetchOrderView } from "@/lib/order-page-api";
import {
  POLL_INTERVAL_MS, nextPollStep, shouldPoll, type PollPhase, type PollProgress,
} from "@/lib/order-page-poll";
import type { OrderView } from "@/types/order-view";

interface Options {
  initial: OrderView;
  token: string | null;
  /** Покупатель вернулся с ЮKassa (?from=payment). */
  fromPayment: boolean;
}

export interface OrderStatusState {
  view: OrderView;
  setView: (view: OrderView) => void;
  phase: PollPhase;
}

/**
 * Состояние страницы заказа. После возврата с ЮKassa и пока заказ pending_payment опрашивает
 * GET /api/orders/[number] каждые 3 с до 60 с (BR-12: сама страница статус не меняет).
 * Ошибка опроса — тихий повтор; 3 подряд — phase = "failed".
 */
export function useOrderStatus({ initial, token, fromPayment }: Options): OrderStatusState {
  const [view, setView] = useState<OrderView>(initial);
  const [phase, setPhase] = useState<PollPhase>(() => (shouldPoll(fromPayment, initial.status) ? "checking" : "unpaid"));
  const { number, status } = initial;

  useEffect(() => {
    if (!shouldPoll(fromPayment, status)) return;
    const controller = new AbortController();
    const startedAt = Date.now();
    let progress: PollProgress = { failures: 0 };
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const res = await fetchOrderView(number, token, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const step = nextPollStep(
        progress, res.ok ? { ok: true, status: res.view.status } : { ok: false }, Date.now() - startedAt, status,
      );
      if (res.ok) setView(res.view);
      if (step.kind === "continue") {
        progress = step.progress;
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      } else if (step.kind === "timeout") {
        setPhase("unpaid");
      } else if (step.kind === "failed") {
        setPhase("failed");
      }
      // "changed": новый статус уже в view, баннер оплаты исчезает сам
    };

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [number, token, fromPayment, status]);

  return { view, setView, phase };
}
