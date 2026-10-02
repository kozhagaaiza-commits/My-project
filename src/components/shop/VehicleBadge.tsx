"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Car, X } from "lucide-react";
import { VehicleSelector } from "@/components/shop/VehicleSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { clearStoredVehicle, useStoredVehicle } from "@/hooks/use-stored-vehicle";

/** Сброс авто: чистит localStorage и убирает ?vehicle= из текущего URL, чтобы каталог не остался отфильтрованным. */
export function useResetVehicle(): () => void {
  const router = useRouter();
  return () => {
    clearStoredVehicle();
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("vehicle")) {
        url.searchParams.delete("vehicle");
        url.searchParams.delete("page");
        router.replace(`${url.pathname}${url.search}`, { scroll: false });
      }
    } catch {
      // адрес не разобрать — оставляем как есть
    }
  };
}

export function VehicleBadge() {
  const vehicle = useStoredVehicle();
  const reset = useResetVehicle();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      {vehicle ? (
        <Badge variant="outline" className="hidden max-w-[18rem] gap-1 py-1 pr-1 md:inline-flex">
          <Link href={`/wheels?vehicle=${encodeURIComponent(vehicle.id)}`} className="truncate" title={vehicle.label}>
            {vehicle.label}
          </Link>
          <button
            type="button"
            onClick={reset}
            aria-label="Сбросить автомобиль"
            className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </Badge>
      ) : (
        <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => setOpen(true)}>
          <Car aria-hidden />
          Выбрать авто
        </Button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={vehicle ? `Автомобиль: ${vehicle.label}. Изменить` : "Выбрать авто"}
          >
            <Car aria-hidden />
          </Button>
        </SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Выбрать авто</SheetTitle>
            <SheetDescription>
              {vehicle ? `Сейчас выбрано: ${vehicle.label}` : "Марка, модель и год — покажем подходящие диски"}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <VehicleSelector mode="compact" idPrefix="vb" onSubmitted={() => setOpen(false)} />
          </div>
          {vehicle && (
            <div className="px-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
              >
                <X aria-hidden />
                Сбросить авто
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
