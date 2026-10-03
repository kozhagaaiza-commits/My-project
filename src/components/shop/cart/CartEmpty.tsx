import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CartEmptyProps {
  /** Клик по ссылкам (CartSheet закрывается при переходе). */
  onNavigate?: () => void;
}

export function CartEmpty({ onNavigate }: CartEmptyProps) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
      <ShoppingBag className="size-12 text-muted-foreground" aria-hidden />
      <p className="text-lg font-semibold">Корзина пуста</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href="/" onClick={onNavigate}>Подобрать диски</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/carbon" onClick={onNavigate}>Карбон</Link>
        </Button>
      </div>
    </div>
  );
}
