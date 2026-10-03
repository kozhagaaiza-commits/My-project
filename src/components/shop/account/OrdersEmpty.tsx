import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Empty: «Заказов пока нет» + default «Подобрать диски» (единственная жёлтая кнопка страницы). */
export function OrdersEmpty() {
  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-border px-6 py-10">
      <p className="text-muted-foreground">Заказов пока нет</p>
      <Button asChild>
        <Link href="/wheels">Подобрать диски</Link>
      </Button>
    </div>
  );
}
