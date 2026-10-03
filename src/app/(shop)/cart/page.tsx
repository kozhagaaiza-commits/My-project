import type { Metadata } from "next";
import { CartPageContent } from "@/components/shop/cart/CartPageContent";

export const metadata: Metadata = { title: "Корзина — ForgeCarbon" };

// Корзина хранится в localStorage — страница-оболочка статична, всё остальное делает клиентский контент.
export default function CartPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 md:gap-6 md:px-6 md:py-8">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Корзина</h1>
      <CartPageContent />
    </div>
  );
}
