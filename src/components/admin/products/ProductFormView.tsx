"use client";

import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { ProductEditor } from "@/components/admin/products/ProductEditor";
import { ProductFormSkeleton } from "@/components/admin/products/ProductFormSkeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAdminFetch } from "@/hooks/use-admin-products-fetch";
import { useAdminPriceSettings, useAdminVehicleReference } from "@/hooks/use-admin-products-reference";
import type { AdminProductDetail } from "@/lib/admin-products-ui/types";

interface ProductFormViewProps {
  /** null — /admin/products/new. */
  productId: string | null;
}

/** Загрузка данных формы (товар, курсы, справочник авто) и состояния Loading / Error; дальше — ProductEditor. */
export function ProductFormView({ productId }: ProductFormViewProps) {
  const product = useAdminFetch<AdminProductDetail>(productId ? `/api/admin/products/${productId}` : null);
  const rates = useAdminPriceSettings();
  const refs = useAdminVehicleReference();

  const isNew = productId === null;
  if ((!isNew && product.status === "loading") || rates.status === "loading") return <ProductFormSkeleton />;

  if (!isNew && product.status === "error") {
    const notFound = product.error?.status === 404;
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>{notFound ? "Товар не найден" : "Не удалось загрузить товар"}</AlertTitle>
          <AlertDescription>
            {product.error?.message}
            <span className="mt-2 flex gap-2">
              {!notFound && <Button variant="outline" size="sm" onClick={product.reload}>Повторить</Button>}
              <Button variant="outline" size="sm" asChild><Link href="/admin/products">К списку товаров</Link></Button>
            </span>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <ProductEditor
      detail={isNew ? null : product.data}
      settings={rates.settings}
      refreshingRates={rates.refreshing}
      onRefreshRates={() => void rates.refreshRates()}
      vehicles={refs.vehicles}
      vehiclesStatus={refs.status}
      onRetryVehicles={refs.reload}
      onReloadProduct={product.reload}
    />
  );
}
