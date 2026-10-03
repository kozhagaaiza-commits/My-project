import type { Metadata } from "next";
import { CheckoutView } from "@/components/shop/checkout/CheckoutView";

export const metadata: Metadata = {
  title: "Оформление заказа — ForgeCarbon",
  robots: { index: false, follow: false },
};

// Корзина хранится в localStorage — страница-оболочка статична, форму и состав заказа рисует клиентский CheckoutView.
export default function CheckoutPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 md:gap-6 md:px-6 md:py-8">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Оформление заказа</h1>
      <CheckoutView />
    </div>
  );
}
