"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { CartSheet } from "@/components/shop/cart/CartSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setCartSheetOpen } from "@/hooks/use-cart-sheet";
import { useCartCount } from "@/hooks/use-cart-count";

/** Кнопка корзины в шапке: открывает CartSheet; на самой /cart — обычная ссылка (Sheet дублировал бы страницу). */
export function CartButton() {
  const count = useCartCount();
  const pathname = usePathname();
  // Sheet живёт в шапке и переживает навигацию: при смене страницы (в т.ч. Back/Forward) закрываем его.
  useEffect(() => {
    setCartSheetOpen(false);
  }, [pathname]);
  const label = count > 0 ? `Корзина, товаров: ${count}` : "Корзина";
  const badge = count > 0 && (
    <Badge className="absolute -top-1 -right-1 h-4 min-w-4 justify-center px-1 text-[10px] tabular-nums">{count}</Badge>
  );

  if (pathname === "/cart" || pathname === "/checkout") {
    return (
      <Button asChild variant="ghost" size="icon" className="relative">
        <Link href="/cart" aria-label={label}>
          <ShoppingBag aria-hidden />
          {badge}
        </Link>
      </Button>
    );
  }
  return (
    <>
      <Button variant="ghost" size="icon" className="relative" aria-label={label} onClick={() => setCartSheetOpen(true)}>
        <ShoppingBag aria-hidden />
        {badge}
      </Button>
      <CartSheet />
    </>
  );
}
