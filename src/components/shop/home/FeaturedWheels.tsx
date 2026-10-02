import Link from "next/link";
import { ProductShelf } from "@/components/shop/home/ProductShelf";
import { Button } from "@/components/ui/button";
import { listProducts } from "@/lib/catalog-queries";
import { getCatalogContext } from "@/lib/catalog-context";
import type { ProductListItem } from "@/types/catalog";

type Loaded = { ok: true; items: ProductListItem[] } | { ok: false };

async function load(): Promise<Loaded> {
  try {
    const ctx = await getCatalogContext();
    const result = await listProducts(
      { type: "wheel_set", availability: "in_stock", sort: "newest", page: 1 },
      ctx,
    );
    return result.kind === "ok" ? { ok: true, items: result.data.slice(0, 4) } : { ok: false };
  } catch (e) {
    console.error("FeaturedWheels: не удалось загрузить витрину", e);
    return { ok: false };
  }
}

export async function FeaturedWheels() {
  const loaded = await load();
  if (!loaded.ok) return null; // Error: блок скрыт, без toast
  if (loaded.items.length === 0) {
    return (
      <section className="mx-auto flex max-w-7xl flex-col items-start gap-4 px-4 py-10 md:px-6">
        <p className="text-lg font-medium">Новая партия готовится к поступлению</p>
        <Button asChild variant="outline">
          <Link href="/wheels">Смотреть под заказ</Link>
        </Button>
      </section>
    );
  }
  return <ProductShelf title="Диски в наличии" href="/wheels" linkLabel="Все диски" products={loaded.items} />;
}
