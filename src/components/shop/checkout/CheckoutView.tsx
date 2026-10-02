"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckoutContent } from "@/components/shop/checkout/CheckoutContent";
import { CheckoutSkeleton } from "@/components/shop/checkout/CheckoutSkeleton";
import { PaymentErrorDialog, type PaymentErrorInfo } from "@/components/shop/checkout/PaymentErrorDialog";
import { useCart } from "@/hooks/use-cart";

/**
 * Страница /checkout: корзина читается из localStorage после гидратации; пустая корзина → redirect('/cart')
 * (Блок 4, Empty). После создания заказа корзина очищается — redirect при этом подавляется (leaving).
 */
export function CheckoutView() {
  const router = useRouter();
  const { cart, ready } = useCart();
  const leaving = useRef(false);
  const [paymentError, setPaymentError] = useState<PaymentErrorInfo | null>(null);
  const empty = ready && cart.items.length === 0;

  useEffect(() => {
    if (empty && !leaving.current) router.replace("/cart");
  }, [empty, router]);

  // Возврат кнопкой «Назад» со страницы оплаты (bfcache): страница в состоянии «заказ создан» — перечитываем.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return (
    <>
      {ready && !empty ? (
        <CheckoutContent
          cart={cart}
          onLeave={() => {
            leaving.current = true;
          }}
          onPaymentError={setPaymentError}
        />
      ) : (
        <CheckoutSkeleton />
      )}
      <PaymentErrorDialog info={paymentError} />
    </>
  );
}
