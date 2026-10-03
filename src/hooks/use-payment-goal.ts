"use client";

import { useEffect, useRef } from "react";
import { reachGoal } from "@/lib/analytics";
import { paymentGoalFlagKey, shouldReachPaymentGoal } from "@/lib/order-page-poll";
import type { OrderStatus } from "@/types/order-view";

const reachedInMemory = new Set<string>(); // запасной флаг, если sessionStorage недоступен

/** payment_succeeded не чаще одного раза на заказ за сессию вкладки (флаг в sessionStorage). */
function reachOnce(number: string): void {
  const key = paymentGoalFlagKey(number);
  if (reachedInMemory.has(key)) return;
  reachedInMemory.add(key);
  try {
    if (window.sessionStorage.getItem(key) === "1") return;
    window.sessionStorage.setItem(key, "1");
  } catch {
    // sessionStorage недоступен — работает флаг в памяти
  }
  reachGoal("payment_succeeded");
}

/** Цель Метрики при смене статуса на «оплачен» во время опроса и при открытии уже оплаченного заказа с ?from=payment. */
export function usePaymentGoal(number: string, fromPayment: boolean, status: OrderStatus): void {
  const previous = useRef<OrderStatus | null>(null);
  useEffect(() => {
    if (shouldReachPaymentGoal(fromPayment, previous.current, status)) reachOnce(number);
    previous.current = status;
  }, [number, fromPayment, status]);
}
