"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center gap-6 px-4 text-center md:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        Что-то пошло не так
      </h1>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => reset()}>Повторить</Button>
        <Button asChild variant="outline">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </main>
  );
}
