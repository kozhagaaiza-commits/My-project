"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { clearStoredVehicle, readStoredVehicle } from "@/hooks/use-stored-vehicle";
import type { ProductType } from "@/types/catalog";

interface VehicleSyncProps {
  /**
   * apply — в URL нет vehicle: подставить сохранённый fc_vehicle (US-001);
   * not_found — vehicle из URL не найден/неактивен: toast, очистка fc_vehicle, убрать vehicle из URL (Edge Case 18).
   */
  mode: "apply" | "not_found";
  /** Тип каталога: на /wheels «…показаны все диски», на /carbon «…показаны все товары» (Блок 3). */
  type: ProductType;
}

export function VehicleSync({ mode, type }: VehicleSyncProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const stored = readStoredVehicle();

    if (mode === "not_found") {
      if (stored && stored.id === params.get("vehicle")) clearStoredVehicle();
      toast(
        type === "wheel_set"
          ? "Автомобиль не найден, показаны все диски"
          : "Автомобиль не найден, показаны все товары",
        { id: "vehicle-not-found" },
      );
      params.delete("vehicle");
    } else {
      if (!stored) return;
      params.set("vehicle", stored.id);
    }
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [mode, type, pathname, router, searchParams]);

  return null;
}
