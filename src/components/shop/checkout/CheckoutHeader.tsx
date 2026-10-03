import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/config";

/** Упрощённая шапка оформления: только логотип и ссылка в корзину (Блок 4 «Оформление заказа»). */
export function CheckoutHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4 md:px-6">
        <Link
          href="/"
          className="font-mono text-sm font-semibold tracking-widest text-foreground uppercase max-md:inline-flex max-md:min-h-11 max-md:items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {SITE_NAME}
        </Link>
        <Button asChild variant="ghost" size="sm">
          <Link href="/cart">
            <ChevronLeft aria-hidden />
            Вернуться в корзину
          </Link>
        </Button>
      </div>
    </header>
  );
}
