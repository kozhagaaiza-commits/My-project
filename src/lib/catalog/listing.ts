import {
  availabilityForList, buildAvailability, buildSpecsShort, formatPrice, tierPrice, toProductImage,
} from "@/lib/catalog";
import { formatRub } from "@/lib/money";
import type { ImageRow, ListProductRow } from "@/lib/catalog/rows";
import type { Availability, ProductListItem, ProductsQuery } from "@/types/catalog";

// Чистая часть GET /api/products: фильтры, сортировка, пагинация, сборка элементов списка.
// ОГРАНИЧЕНИЕ: каталог маленький (десятки позиций), поэтому сервер выбирает все active-товары
// типа одним запросом, а фильтр по available_qty, сортировку «в наличии выше» и нарезку страницы
// делает в JS. При росте до тысяч позиций — перенести в SQL (view/RPC с available_qty).

export interface CatalogEntry {
  product: ListProductRow;
  availability: Availability;
  /** null — vehicle не передан; иначе результат подбора (в списке всегда подходящие). */
  fit: { vehicle_id: string; needs_hub_rings: boolean } | null;
}

export function toEntries(
  products: ListProductRow[],
  reserved: Map<string, number>,
  fits: Map<string, boolean> | null,
  vehicleId: string | null,
): CatalogEntry[] {
  return products
    .filter((p) => fits === null || fits.has(p.id))
    .map((p) => ({
      product: p,
      availability: buildAvailability(p, reserved.get(p.id) ?? 0),
      fit: vehicleId === null ? null : { vehicle_id: vehicleId, needs_hub_rings: fits?.get(p.id) ?? false },
    }));
}

/** diameter и construction — только для wheel_set (Блок 3, таблица параметров); availability=in_stock — available_qty > 0. */
export function applyFilters(entries: CatalogEntry[], q: Pick<ProductsQuery, "type" | "diameter" | "construction" | "availability">) {
  return entries.filter(({ product: p, availability: a }) => {
    if (q.type === "wheel_set" && q.diameter !== undefined && p.diameter_in !== q.diameter) return false;
    if (q.type === "wheel_set" && q.construction !== undefined) {
      const c = p.construction;
      const ok = q.construction === "forged" ? c !== null && c.startsWith("forged_") : c === q.construction;
      if (!ok) return false;
    }
    if (q.availability === "in_stock" && !(a.available_qty !== null && a.available_qty > 0)) return false;
    return true;
  });
}

/**
 * in_stock (и preorder — доступен к заказу) всегда выше out_of_stock; внутри групп — по sort; затем по id.
 * atelierPricing (одобренное ателье при FEATURE_ATELIER, см. isAtelierPricing): сортировка по цене идёт
 * по цене ателье (price_atelier ?? price) — решение владельца, День 3 (Приложение A, A26). Иначе — по price.
 */
export function sortEntries(entries: CatalogEntry[], sort: ProductsQuery["sort"], atelierPricing: boolean = false): CatalogEntry[] {
  const rank = (e: CatalogEntry) => (e.availability.status === "out_of_stock" ? 1 : 0);
  const price = (e: CatalogEntry) => tierPrice(e.product, atelierPricing);
  const bySort = (a: CatalogEntry, b: CatalogEntry) => {
    if (sort === "price_asc") return price(a) - price(b);
    if (sort === "price_desc") return price(b) - price(a);
    return Date.parse(b.product.created_at) - Date.parse(a.product.created_at);
  };
  return [...entries].sort((a, b) => rank(a) - rank(b) || bySort(a, b) || a.product.id.localeCompare(b.product.id));
}

export function paginate<T>(items: T[], page: number, perPage: number): T[] {
  const start = (page - 1) * perPage;
  return items.slice(start, start + perPage);
}

/** Первое фото по sort_order для каждого товара (вход — фото нескольких товаров одним списком). */
export function pickCovers(images: ImageRow[]): Map<string, ImageRow> {
  const covers = new Map<string, ImageRow>();
  for (const img of images) {
    const cur = covers.get(img.product_id);
    if (!cur || img.sort_order < cur.sort_order) covers.set(img.product_id, img);
  }
  return covers;
}

export function toListItem(e: CatalogEntry, cover: ImageRow | undefined, supabaseUrl: string): ProductListItem {
  const p = e.product;
  return {
    id: p.id, type: p.type, slug: p.slug, title: p.title, manufacturer: p.manufacturer,
    price: p.price, price_formatted: formatRub(p.price),
    price_atelier: p.price_atelier, price_atelier_formatted: formatPrice(p.price_atelier),
    availability: availabilityForList(e.availability),
    specs_short: buildSpecsShort(p),
    fitment: e.fit === null ? null : { vehicle_id: e.fit.vehicle_id, fits: true, needs_hub_rings: e.fit.needs_hub_rings },
    cover_image: cover ? toProductImage(supabaseUrl, cover, p.title) : null,
  };
}
