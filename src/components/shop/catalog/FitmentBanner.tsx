import { ChangeVehicleSheet } from "@/components/shop/catalog/ChangeVehicleSheet";
import { CATALOG_PATH, SEAT_NOTE } from "@/components/shop/catalog/catalog-params";
import type { ProductType, VehicleDetail } from "@/types/catalog";

interface FitmentBannerProps {
  type: ProductType;
  vehicle: VehicleDetail;
}

export function FitmentBanner({ type, vehicle: v }: FitmentBannerProps) {
  const wheels = type === "wheel_set";
  const specs = [
    v.pcd.replace("x", "×"),
    `ЦО ${v.center_bore_mm.toFixed(1)}`,
    `ET ${v.et_min_mm}–${v.et_max_mm}`,
    `R${v.diameter_min_in}–R${v.diameter_max_in}`,
    `${v.fastener_spec} (${SEAT_NOTE[v.seat_type] ?? v.seat_type})`,
  ].join(" · ");

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">Ваш автомобиль</p>
        <p className="font-medium">{v.label}</p>
        {wheels && <p className="mt-1 font-mono text-sm break-words text-silver">{specs}</p>}
      </div>
      <ChangeVehicleSheet
        targetPath={CATALOG_PATH[type]}
        submitLabel={wheels ? "Показать диски" : "Показать карбон"}
      />
    </div>
  );
}
