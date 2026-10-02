"use client";

import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface CartCheckErrorProps {
  onRetry: () => void;
}

/** validate не ответил (Чертёж, Блок 4 «Корзина» → Error). */
export function CartCheckError({ onRetry }: CartCheckErrorProps) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertTitle>Не удалось проверить наличие</AlertTitle>
      <AlertDescription>
        <Button type="button" variant="outline" size="sm" className="mt-1" onClick={onRetry}>
          Повторить
        </Button>
      </AlertDescription>
    </Alert>
  );
}
