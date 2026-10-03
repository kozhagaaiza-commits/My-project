"use client";

import Link from "next/link";
import { AdminErrorAlert } from "@/components/admin/layout/AdminErrorAlert";
import { Button } from "@/components/ui/button";

export default function AdminAteliersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <AdminErrorAlert title="Что-то пошло не так" description="Не удалось открыть раздел «Ателье»" onRetry={reset} />
      <Button asChild variant="ghost" className="self-start">
        <Link href="/admin">К сводке</Link>
      </Button>
    </div>
  );
}
