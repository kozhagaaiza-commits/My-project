"use client";

import { useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { AddToCart } from "@/components/shop/product/AddToCart";
import { AvailabilityBadge } from "@/components/shop/AvailabilityBadge";
import { FitmentNote } from "@/components/shop/FitmentNote";
import { QuantityStepper } from "@/components/shop/QuantityStepper";
import { Button } from "@/components/ui/button";
import { maxQuantityFor } from "@/lib/cart-store";
import type { Availability, DetailFitment, ProductType } from "@/types/catalog";

export interface BuyBoxProduct {
  id: string;
  slug: string;
  title: string;
  type: ProductType;
  /** Актуальная цена (price_atelier ?? price), копейки. */
  price: number;
  price_formatted: string;
  availability: Availability;
  fitment: DetailFitment | null;
  specs_short: string | null;
}

interface ProductBuyBoxProps {
  product: BuyBoxProduct;
  engineerUrl: string;
}

/** Сервер сообщил, что остаток разобрали: бейдж на странице меняется на «Нет в наличии». */
const soldOutAvailability = (): Availability => ({
  mode: "stock", status: "out_of_stock", label: "Нет в наличии", available_qty: 0, delivery_text: null, lead_time: null,
});

/**
 * Блок покупки: наличие, совместимость, количество, «В корзину», вопрос инженеру.
 * Mobile: количество + «В корзину» — панель, прибитая к низу экрана (одна и та же кнопка, меняется раскладка).
 */
export function ProductBuyBox({ product, engineerUrl }: ProductBuyBoxProps) {
  const [soldOutNow, setSoldOutNow] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const { fitment } = product;

  const soldOut = soldOutNow || product.availability.status === "out_of_stock";
  const availability = soldOutNow ? soldOutAvailability() : product.availability;
  const stockCap = product.availability.available_qty;
  const max = soldOut ? 1 : Math.max(1, Math.min(maxQuantityFor(product.type), stockCap ?? Infinity));
  const vehicleName = fitment ? fitment.vehicle_label.split(" · ")[0] : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <AvailabilityBadge availability={availability} />
        {!soldOut && availability.delivery_text && (
          <p className="text-sm text-muted-foreground">{availability.delivery_text}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <FitmentNote fitment={fitment} vehicleName={vehicleName ?? undefined} variant="full" />
        {fitment?.fastener_note && <p className="pl-[1.375rem] text-sm text-muted-foreground">{fitment.fastener_note}</p>}
      </div>

      <div
        data-sticky-panel
        className="flex flex-col gap-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:border-t max-md:border-border max-md:bg-background/95 max-md:p-3 max-md:backdrop-blur"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-lg font-semibold tabular-nums md:hidden">{product.price_formatted}</p>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground max-md:hidden">Количество</span>
            <QuantityStepper
              value={Math.min(quantity, max)}
              max={max}
              disabled={soldOut}
              label={product.type === "wheel_set" ? "Количество комплектов" : "Количество, шт."}
              onChange={setQuantity}
            />
          </div>
        </div>
        <AddToCart
          className="w-full"
          quantity={Math.min(quantity, max)}
          soldOut={soldOut}
          onSoldOut={() => setSoldOutNow(true)}
          vehicleName={vehicleName}
          product={{
            id: product.id, slug: product.slug, title: product.title, type: product.type,
            kind: product.availability.mode, price: product.price, specs_short: product.specs_short,
            fits: fitment ? fitment.fits : null,
          }}
        />
      </div>

      <Button asChild variant="outline" size="lg">
        <Link href={engineerUrl} target="_blank" rel="noopener noreferrer">
          <Send aria-hidden />
          Задать вопрос инженеру
        </Link>
      </Button>
    </div>
  );
}
