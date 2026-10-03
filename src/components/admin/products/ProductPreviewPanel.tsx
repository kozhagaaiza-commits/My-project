import { ProductPreviewCard } from "@/components/admin/products/ProductPreviewCard";
import type { AdminImage, AdminSettings } from "@/lib/admin-products-ui/types";

interface ProductPreviewPanelProps {
  settings: AdminSettings | null;
  images: readonly AdminImage[];
  reservedQty: number;
}

/** Desktop (≥ lg): правая колонка 4/12 с карточкой товара; на меньших экранах скрыта (там — Sheet «Предпросмотр»). */
export function ProductPreviewPanel(props: ProductPreviewPanelProps) {
  return (
    <aside aria-label="Предпросмотр карточки" className="hidden lg:col-span-4 lg:block">
      <div className="sticky top-6 space-y-3">
        <h2 className="text-base font-semibold">Предпросмотр</h2>
        <ProductPreviewCard {...props} />
        <p className="text-sm text-muted-foreground">Так карточка выглядит в каталоге для покупателя</p>
      </div>
    </aside>
  );
}
