"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCartCount } from "@/hooks/use-cart-count";

// Ссылка на /cart; CartSheet подключается в День 3.
export function CartButton() {
  const count = useCartCount();
  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link href="/cart" aria-label={count > 0 ? `Корзина, товаров: ${count}` : "Корзина"}>
        <ShoppingBag aria-hidden />
        {count > 0 && (
          <Badge className="absolute -top-1 -right-1 h-4 min-w-4 justify-center px-1 text-[10px] tabular-nums">
            {count}
          </Badge>
        )}
      </Link>
    </Button>
  );
}
