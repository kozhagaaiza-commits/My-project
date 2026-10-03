"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

interface AdminErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ reset }: AdminErrorProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Что-то пошло не так</h1>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" variant="outline" onClick={() => reset()}>
          Повторить
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin">К сводке</Link>
        </Button>
      </div>
    </div>
  );
}
