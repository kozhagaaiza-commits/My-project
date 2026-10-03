import { buildAvailability, buildSpecsShort } from "@/lib/catalog";
import { formatRub } from "@/lib/money";
import { parseNumberField } from "@/lib/admin-products-ui/money-input";
import type { ProductFormValues } from "@/lib/admin-products-ui/product-form-values";
import type { AdminImage } from "@/lib/admin-products-ui/types";
import type { ProductListItem } from "@/types/catalog";

interface PreviewInput {
  values: ProductFormValues;
  images: readonly AdminImage[];
  /** Розничная цена в копейках (авто — расчёт, вручную — ввод); null — ещё не известна. */
  priceKopecks: number | null;
  atelierKopecks: number | null;
  /** Бронь, чтобы «в наличии» совпало со склада (0 для нового товара). */
  reservedQty: number;
}

const num = (s: string): number | null => parseNumberField(s) ?? null;

/** Карточка товара «как увидит покупатель» из текущих значений формы (ProductCard каталога). */
export function buildPreviewItem({ values, images, priceKopecks, atelierKopecks, reservedQty }: PreviewInput): ProductListItem {
  const w = values.wheel;
  const wheel = values.type === "wheel_set";
  const availability = buildAvailability(
    {
      availability_mode: wheel ? values.availability_mode : "preorder",
      stock_qty: num(values.stock_qty) ?? 0,
      lead_time_min_days: num(values.lead_time_min_days),
      lead_time_max_days: num(values.lead_time_max_days),
    },
    reservedQty,
  );
  const specs = wheel && w.seat_type !== "" && w.pcd !== ""
    ? buildSpecsShort({
        type: "wheel_set",
        diameter_in: num(w.diameter_in), width_front_in: num(w.width_front_in), width_rear_in: num(w.width_rear_in),
        et_front_mm: num(w.et_front_mm), et_rear_mm: num(w.et_rear_mm), pcd: w.pcd, center_bore_mm: num(w.center_bore_mm),
      })
    : null;
  const cover = [...images].sort((a, b) => a.sort_order - b.sort_order)[0];
  return {
    id: "preview",
    type: values.type,
    slug: values.slug || "preview",
    title: values.title.trim() || "Название товара",
    manufacturer: values.manufacturer,
    price: priceKopecks ?? 0,
    price_formatted: priceKopecks === null ? "Цена не задана" : formatRub(priceKopecks),
    price_atelier: atelierKopecks,
    price_atelier_formatted: atelierKopecks === null ? null : formatRub(atelierKopecks),
    availability,
    specs_short: specs,
    fitment: null,
    cover_image: cover ? { url: cover.url, alt: cover.alt || values.title } : null,
  };
}
