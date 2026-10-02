import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 md:px-6 md:py-24">
      <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
        Диски и карбон для Audi, BMW, Mercedes-Benz
      </h1>
      <p className="mt-4 text-lg text-silver">
        Склад в Москве. Доставка до 5 дней
      </p>
      <Button asChild size="lg" className="mt-8">
        <Link href="/wheels">Подобрать диски</Link>
      </Button>
    </div>
  );
}
