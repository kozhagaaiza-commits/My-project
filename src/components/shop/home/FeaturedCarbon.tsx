import { ProductShelf } from "@/components/shop/home/ProductShelf";
import { listProducts } from "@/lib/catalog-queries";
import { getCatalogContext } from "@/lib/catalog/session";
import type { ProductListItem } from "@/types/catalog";

async function load(): Promise<ProductListItem[]> {
  try {
    const ctx = await getCatalogContext();
    const result = await listProducts(
      { type: "carbon_part", availability: "all", sort: "newest", page: 1 },
      ctx,
    );
    return result.kind === "ok" ? result.data.slice(0, 4) : [];
  } catch (e) {
    console.error("FeaturedCarbon: не удалось загрузить витрину", e);
    return [];
  }
}

export async function FeaturedCarbon() {
  const items = await load();
  // Пустой карбон или ошибка — блок скрыт, toast не показывается.
  if (items.length === 0) return null;
  return <ProductShelf title="Карбон под заказ" href="/carbon" linkLabel="Весь карбон" products={items} />;
}
