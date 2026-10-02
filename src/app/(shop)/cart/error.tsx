"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

interface CartErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function CartError({ reset }: CartErrorProps) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-16 text-center md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Что-то пошло не так</h1>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => reset()}>Повторить</Button>
        <Button asChild variant="outline">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}
