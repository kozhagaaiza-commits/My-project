import { ProductBuyBox, type BuyBoxProduct } from "@/components/shop/product/ProductBuyBox";
import { PriceTag } from "@/components/shop/PriceTag";
import type { ProductDetail } from "@/types/catalog";

interface ProductInfoProps {
  product: ProductDetail;
  specsShort: string | null;
  engineerUrl: string;
}

/** Правая колонка: производитель, название, цена, затем блок покупки (клиентский). */
export function ProductInfo({ product, specsShort, engineerUrl }: ProductInfoProps) {
  const wheels = product.type === "wheel_set";
  const unit = wheels ? "за комплект из 4 дисков" : "за 1 шт.";
  const buy: BuyBoxProduct = {
    id: product.id,
    slug: product.slug,
    title: product.title,
    type: product.type,
    price: product.price_atelier ?? product.price,
    price_formatted: product.price_atelier_formatted ?? product.price_formatted,
    availability: product.availability,
    fitment: product.fitment,
    specs_short: specsShort,
  };
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-xs tracking-wider text-muted-foreground uppercase">{product.manufacturer}</p>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight md:text-3xl">{product.title}</h1>
      </div>
      <PriceTag
        size="large"
        price_formatted={product.price_formatted}
        price_atelier_formatted={product.price_atelier_formatted}
        unit={unit}
      />
      <ProductBuyBox product={buy} engineerUrl={engineerUrl} />
    </div>
  );
}
