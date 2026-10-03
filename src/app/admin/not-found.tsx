import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AdminNotFound() {
  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Страница не найдена</h1>
      <Button asChild variant="outline">
        <Link href="/admin">К сводке</Link>
      </Button>
    </div>
  );
}
