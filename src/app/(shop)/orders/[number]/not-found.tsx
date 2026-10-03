import Link from "next/link";
import { Button } from "@/components/ui/button";

// Нет заказа и неверный токен — один и тот же экран: без подсказки, существует ли номер (US-004).
export default function OrderNotFound() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-24 text-center md:px-6">
      <h1 className="max-w-xl text-3xl font-semibold tracking-tight">Заказ не найден. Проверьте ссылку из письма</h1>
      <Button asChild variant="outline">
        <Link href="/wheels">В каталог</Link>
      </Button>
    </div>
  );
}
