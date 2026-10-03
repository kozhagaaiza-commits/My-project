"use client";

import Link from "next/link";
import { AdminErrorAlert } from "@/components/admin/layout/AdminErrorAlert";
import { Button } from "@/components/ui/button";

interface AdminVehiclesErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminVehiclesError({ reset }: AdminVehiclesErrorProps) {
  return (
    <div className="flex flex-col gap-4">
      <AdminErrorAlert title="Что-то пошло не так" description="Не удалось открыть раздел «Автомобили»" onRetry={reset} />
      <Button asChild variant="ghost" className="self-start">
        <Link href="/admin">К сводке</Link>
      </Button>
    </div>
  );
}
