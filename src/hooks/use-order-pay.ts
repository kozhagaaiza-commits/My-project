"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { fetchOrderView, requestPay } from "@/lib/order-page-api";
import { markOrderExpired } from "@/lib/order-page-view";
import type { OrderView } from "@/types/order-view";

interface Options {
  view: OrderView;
  token: string | null;
  setView: (view: OrderView) => void;
}

/**
 * «Оплатить»: POST /api/orders/[number]/pay → переход на confirmation_url (только http/https, в production — https).
 * 409 ORDER_NOT_PAYABLE → заказ показывается отменённым; 502/сеть → toast, кнопка снова доступна.
 */
export function useOrderPay({ view, token, setView }: Options) {
  const [paying, setPaying] = useState(false);
  const inFlight = useRef(false);

  const pay = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPaying(true);
    const outcome = await requestPay(view.number, token);
    if (outcome.type === "redirect") {
      window.location.assign(outcome.url); // кнопка остаётся заблокированной до ухода со страницы
      return;
    }
    toast.error(outcome.message);
    if (outcome.type === "expired") {
      setView(markOrderExpired(view));
      void fetchOrderView(view.number, token).then((res) => {
        if (res.ok) setView(res.view);
      });
    }
    inFlight.current = false;
    setPaying(false);
  };

  return { paying, pay };
}
