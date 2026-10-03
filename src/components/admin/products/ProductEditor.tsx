"use client";

import { useState } from "react";
import { useWatch } from "react-hook-form";
import { AvailabilitySection } from "@/components/admin/products/AvailabilitySection";
import { CarbonSection } from "@/components/admin/products/CarbonSection";
import { CertificationSection } from "@/components/admin/products/CertificationSection";
import { ConflictDialog } from "@/components/admin/products/ConflictDialog";
import { PhotosSection } from "@/components/admin/products/PhotosSection";
import { PriceSection } from "@/components/admin/products/PriceSection";
import { ProductActionBar } from "@/components/admin/products/ProductActionBar";
import { ProductFormHeader } from "@/components/admin/products/ProductFormHeader";
import { ProductMainSection } from "@/components/admin/products/ProductMainSection";
import { ProductPreviewPanel } from "@/components/admin/products/ProductPreviewPanel";
import { ProductTypeSection } from "@/components/admin/products/ProductTypeSection";
import { WheelSection } from "@/components/admin/products/WheelSection";
import { Form } from "@/components/ui/form";
import { useAdminProductForm } from "@/hooks/use-admin-product-form";
import { useAdminProductImages } from "@/hooks/use-admin-products-images";
import { useProductPrice } from "@/hooks/use-admin-products-price";
import type { AdminProductDetail, AdminProductStatus, AdminSettings, AdminVehicleRow } from "@/lib/admin-products-ui/types";

interface ProductEditorProps {
  /** null — новый товар. */
  detail: AdminProductDetail | null;
  settings: AdminSettings | null;
  refreshingRates: boolean;
  onRefreshRates: () => void;
  vehicles: readonly AdminVehicleRow[];
  vehiclesStatus: "loading" | "error" | "ready";
  onRetryVehicles: () => void;
  /** «Загрузить актуальную версию» после CONFLICT. */
  onReloadProduct: () => void;
}

export function ProductEditor({
  detail, settings, refreshingRates, onRefreshRates, vehicles, vehiclesStatus, onRetryVehicles, onReloadProduct,
}: ProductEditorProps) {
  const photos = useAdminProductImages(detail?.id ?? null, detail?.images ?? []);
  const f = useAdminProductForm({ detail, settings, images: photos.images });
  const { form } = f;
  const [type, title] = useWatch({ control: form.control, name: ["type", "title"] });
  const { autoBlocked } = useProductPrice(form.control, settings);
  const [submitting, setSubmitting] = useState<AdminProductStatus | null>(null);

  const onSave = async (status: AdminProductStatus) => {
    setSubmitting(status);
    try {
      await f.save(status);
    } finally {
      setSubmitting(null);
    }
  };
  const reserved = detail?.reserved_qty ?? 0;

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(f.saved?.status ?? "draft");
        }}
        className="space-y-6"
      >
        <ProductFormHeader title={detail ? title || detail.title : "Новый товар"} status={f.saved?.status ?? null} />
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="min-w-0 space-y-6 lg:col-span-8">
            <ProductTypeSection locked={detail !== null} />
            <ProductMainSection
              onTitleChange={f.onTitleChange}
              onSlugEdit={f.onSlugEdit}
              onRegenerateSlug={f.regenerateSlug}
              slugSuggestion={f.slugSuggestion}
              onApplySuggestion={f.applySuggestion}
            />
            {type === "wheel_set" ? (
              <WheelSection vehicles={vehicles} vehiclesStatus={vehiclesStatus} onRetryVehicles={onRetryVehicles} />
            ) : (
              <CarbonSection vehicles={vehicles} vehiclesStatus={vehiclesStatus} onRetryVehicles={onRetryVehicles} />
            )}
            <AvailabilitySection reservedQty={detail ? reserved : null} />
            <PriceSection
              settings={settings}
              rateError={f.rateError}
              refreshing={refreshingRates}
              onRefreshRates={onRefreshRates}
              onRateErrorClear={() => f.setRateError(null)}
            />
            <CertificationSection />
            <PhotosSection productId={detail?.id ?? null} type={type} photos={photos} error={f.imagesError} />
          </div>
          <ProductPreviewPanel settings={settings} images={photos.images} reservedQty={reserved} />
        </div>
        <ProductActionBar
          savedStatus={f.saved?.status ?? null}
          submitting={submitting}
          publishBlocked={autoBlocked}
          onSave={(s) => void onSave(s)}
          settings={settings}
          images={photos.images}
          reservedQty={reserved}
        />
      </form>
      <ConflictDialog open={f.conflict} onOpenChange={f.setConflict} onReload={onReloadProduct} />
    </Form>
  );
}
