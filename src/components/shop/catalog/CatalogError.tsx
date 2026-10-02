"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function CatalogError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <Alert variant="destructive">
        <CircleAlert aria-hidden />
        <AlertTitle>Не удалось загрузить каталог</AlertTitle>
        <AlertDescription>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() =>
              startTransition(() => {
                router.refresh(); // заново запросить серверные данные
                reset();
              })
            }
          >
            Повторить
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
