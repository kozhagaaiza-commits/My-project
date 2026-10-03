"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { VehicleSelector } from "@/components/shop/VehicleSelector";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface ChangeVehicleSheetProps {
  targetPath: string;
  submitLabel: string;
}

export function ChangeVehicleSheet({ targetPath, submitLabel }: ChangeVehicleSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm">
          <RefreshCw aria-hidden />
          Сменить авто
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Сменить авто</SheetTitle>
          <SheetDescription>Марка, модель и год</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          <VehicleSelector
            mode="compact"
            idPrefix="cv"
            targetPath={targetPath}
            submitLabel={submitLabel}
            onSubmitted={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
