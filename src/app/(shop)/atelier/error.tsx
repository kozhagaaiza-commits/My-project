"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AtelierError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-16 text-center md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Не удалось открыть страницу</h1>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="outline" onClick={() => reset()}>Повторить</Button>
        <Button asChild variant="ghost">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}
