"use client";

import { Eye } from "lucide-react";
import { ProductPreviewCard } from "@/components/admin/products/ProductPreviewCard";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { AdminImage, AdminSettings } from "@/lib/admin-products-ui/types";

interface ProductPreviewSheetProps {
  settings: AdminSettings | null;
  images: readonly AdminImage[];
  reservedQty: number;
}

/** Tablet/mobile (< lg): кнопка «Предпросмотр» открывает Sheet с карточкой товара. */
export function ProductPreviewSheet(props: ProductPreviewSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" className="lg:hidden">
          <Eye aria-hidden />
          Предпросмотр
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Предпросмотр</SheetTitle>
          <SheetDescription>Так карточка выглядит в каталоге для покупателя</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <ProductPreviewCard {...props} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
