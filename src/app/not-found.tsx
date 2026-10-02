import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center gap-6 px-4 text-center md:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        Страница не найдена
      </h1>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href="/">На главную</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/wheels">Каталог дисков</Link>
        </Button>
      </div>
    </main>
  );
}
