"use client";

import { startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ProductErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProductError({ reset }: ProductErrorProps) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <Alert variant="destructive">
        <CircleAlert aria-hidden />
        <AlertTitle>Не удалось загрузить товар</AlertTitle>
        <AlertDescription>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                startTransition(() => {
                  router.refresh(); // заново запросить серверные данные
                  reset();
                })
              }
            >
              Повторить
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/wheels">В каталог</Link>
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
