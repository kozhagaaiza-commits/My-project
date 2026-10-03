"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

interface OrderErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function OrderError({ reset }: OrderErrorProps) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-16 text-center md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Не удалось загрузить заказ</h1>
      <p className="text-muted-foreground">Повторите попытку или откройте ссылку из письма ещё раз.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => reset()}>Повторить</Button>
        <Button asChild variant="outline">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}
