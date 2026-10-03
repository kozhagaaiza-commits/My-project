"use client";

import { useEffect } from "react";
import { reachGoal } from "@/lib/analytics";

/** Цель Метрики product_view — один раз на открытие карточки (повторный рендер/смена ?vehicle не считается). */
export function ProductViewGoal({ productId }: { productId: string }) {
  useEffect(() => {
    reachGoal("product_view");
  }, [productId]);
  return null;
}
