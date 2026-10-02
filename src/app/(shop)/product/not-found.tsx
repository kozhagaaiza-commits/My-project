import Link from "next/link";
import { Button } from "@/components/ui/button";

// Лежит в product/ (не в [slug]/): notFound() из layout [slug] ловит граница родительского сегмента.
export default function ProductNotFound() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-24 text-center md:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Товар больше не продаётся</h1>
      <Button asChild>
        <Link href="/wheels">В каталог</Link>
      </Button>
    </div>
  );
}
