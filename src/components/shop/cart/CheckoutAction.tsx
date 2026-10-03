"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CartView } from "@/hooks/use-cart-view";

interface CheckoutActionProps {
  view: CartView;
  onNavigate?: () => void;
  className?: string;
}

/** Жёлтая «Оформить заказ» → /checkout; заблокирована, пока нет подтверждённого ответа validate или есть проблемы. */
export function CheckoutAction({ view, onNavigate, className }: CheckoutActionProps) {
  if (!view.canCheckout) {
    return (
      <Button type="button" disabled className={className}>
        Оформить заказ
        <ArrowRight aria-hidden />
      </Button>
    );
  }
  return (
    <Button asChild className={className}>
      <Link
        href="/checkout"
        onClick={() => {
          view.startCheckout();
          onNavigate?.();
        }}
      >
        Оформить заказ
        <ArrowRight aria-hidden />
      </Link>
    </Button>
  );
}

/** Подсказка под кнопкой, когда оформление заблокировано позициями. */
export function checkoutHint(view: CartView): string | null {
  if (view.hasUnavailable) return "Удалите недоступные позиции";
  if (view.hasMixed) return "Удалите позиции другого типа: детали под заказ и диски из наличия оформляются разными заказами";
  return null;
}
