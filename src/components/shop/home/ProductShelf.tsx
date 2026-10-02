import Link from "next/link";
import { ProductCard } from "@/components/shop/ProductCard";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { ProductListItem } from "@/types/catalog";

const SIZES = "(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 75vw";

interface ProductShelfProps {
  title: string;
  href: string;
  linkLabel: string;
  products: ProductListItem[];
}

/** Витрина: desktop 4 колонки, tablet 2, mobile — горизонтальный скролл с карточками ~75% ширины. */
export function ProductShelf({ title, href, linkLabel, products }: ProductShelfProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold md:text-2xl">{title}</h2>
        <Button asChild variant="ghost" size="sm">
          <Link href={href}>{linkLabel}</Link>
        </Button>
      </div>
      <ScrollArea className="w-full md:hidden">
        <ul className="flex gap-3 pb-4">
          {products.map((p) => (
            <li key={p.id} className="w-[75vw] max-w-72 shrink-0">
              <ProductCard product={p} sizes={SIZES} />
            </li>
          ))}
        </ul>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <ul className="hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-4">
        {products.map((p) => (
          <li key={p.id}>
            <ProductCard product={p} sizes={SIZES} />
          </li>
        ))}
      </ul>
    </section>
  );
}
