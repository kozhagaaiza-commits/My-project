import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FEATURE_ATELIER } from "@/lib/config";

export function AtelierTeaser() {
  if (!FEATURE_ATELIER) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pb-12 md:px-6 md:pb-16">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 md:flex-row md:items-center md:justify-between">
        <p className="text-lg font-medium">Для тюнинг-ателье — отдельные цены</p>
        <Button asChild variant="outline">
          <Link href="/atelier">Подробнее</Link>
        </Button>
      </div>
    </section>
  );
}
