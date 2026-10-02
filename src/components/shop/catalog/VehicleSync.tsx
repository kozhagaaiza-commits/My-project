"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { clearStoredVehicle, readStoredVehicle } from "@/hooks/use-stored-vehicle";

interface VehicleSyncProps {
  /**
   * apply — в URL нет vehicle: подставить сохранённый fc_vehicle (US-001);
   * not_found — vehicle из URL не найден/неактивен: toast, очистка fc_vehicle, убрать vehicle из URL (Edge Case 18).
   */
  mode: "apply" | "not_found";
}

export function VehicleSync({ mode }: VehicleSyncProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const stored = readStoredVehicle();

    if (mode === "not_found") {
      if (stored && stored.id === params.get("vehicle")) clearStoredVehicle();
      toast("Автомобиль не найден, показаны все диски", { id: "vehicle-not-found" });
      params.delete("vehicle");
    } else {
      if (!stored) return;
      params.set("vehicle", stored.id);
    }
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [mode, pathname, router, searchParams]);

  return null;
}
