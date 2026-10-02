"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { clearStoredVehicle } from "@/hooks/use-stored-vehicle";

interface ShowAllButtonProps {
  href: string;
  children: React.ReactNode;
}

/** «Показать все диски»: сбрасывает сохранённый авто, иначе он снова применился бы к каталогу. */
export function ShowAllButton({ href, children }: ShowAllButtonProps) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        clearStoredVehicle();
        router.push(href);
      }}
    >
      {children}
    </Button>
  );
}
