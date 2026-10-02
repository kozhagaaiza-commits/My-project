"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { FilterControls, type FilterChange } from "@/components/shop/catalog/FilterControls";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ProductsQuery } from "@/types/catalog";

interface CatalogFiltersProps {
  query: ProductsQuery;
}

/** Фильтры пишутся в URL (router.replace без скролла); данные приходят из серверного компонента страницы. */
export function CatalogFilters({ query }: CatalogFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const wheels = query.type === "wheel_set";

  const onChange = (change: FilterChange) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(change)) {
      if (value === null || value === undefined) params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  if (!wheels) {
    return (
      <div className={cn("flex justify-end", pending && "opacity-70")} aria-busy={pending}>
        <FilterControls type={query.type} query={query} onChange={onChange} idPrefix="cf" />
      </div>
    );
  }

  return (
    <div aria-busy={pending} className={cn(pending && "opacity-70")}>
      <div className="hidden flex-wrap items-center gap-3 md:flex">
        <FilterControls type={query.type} query={query} onChange={onChange} idPrefix="cf" />
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" className="w-full md:hidden">
            <SlidersHorizontal aria-hidden />
            Фильтры
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Фильтры</SheetTitle>
            <SheetDescription className="sr-only">Диаметр, конструкция, наличие и сортировка</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-6">
            <FilterControls type={query.type} query={query} onChange={onChange} idPrefix="cfm" stacked />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
