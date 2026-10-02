"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clearStoredVehicle, readStoredVehicle } from "@/hooks/use-stored-vehicle";

interface ProductVehicleSyncProps {
  /**
   * apply — в URL нет vehicle: подставить сохранённый fc_vehicle (сервер вернёт блок совместимости);
   * clear — vehicle из URL не найден/неактивен: убрать из URL и очистить fc_vehicle, если он тот же.
   */
  mode: "apply" | "clear";
}

export function ProductVehicleSync({ mode }: ProductVehicleSyncProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const stored = readStoredVehicle();
    if (mode === "clear") {
      if (stored && stored.id === params.get("vehicle")) clearStoredVehicle();
      params.delete("vehicle");
    } else {
      if (!stored) return;
      params.set("vehicle", stored.id);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [mode, pathname, router, searchParams]);

  return null;
}
