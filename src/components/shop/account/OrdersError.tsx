"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Error: inline Alert «Не удалось загрузить заказы» + «Повторить» (перезапрос серверных данных). */
export function OrdersError() {
  const router = useRouter();
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertTitle>Не удалось загрузить заказы</AlertTitle>
      <AlertDescription>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => startTransition(() => router.refresh())}>
          Повторить
        </Button>
      </AlertDescription>
    </Alert>
  );
}
