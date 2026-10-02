"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ProductsQuery } from "@/types/catalog";

export type FilterChange = Partial<Record<"diameter" | "construction" | "availability" | "sort", string | null>>;

interface FilterControlsProps {
  type: ProductsQuery["type"];
  query: ProductsQuery;
  onChange: (change: FilterChange) => void;
  idPrefix: string;
  stacked?: boolean;
}

const DIAMETERS = [17, 18, 19, 20, 21, 22, 23];
const SORTS: Array<{ value: ProductsQuery["sort"]; label: string }> = [
  { value: "newest", label: "Сначала новые" },
  { value: "price_asc", label: "Дешевле" },
  { value: "price_desc", label: "Дороже" },
];

export function FilterControls({ type, query, onChange, idPrefix, stacked }: FilterControlsProps) {
  const wheels = type === "wheel_set";
  const triggerWidth = stacked ? "w-full" : "w-44";

  const sort = (
    <Select value={query.sort} onValueChange={(v) => onChange({ sort: v === "newest" ? null : v })}>
      <SelectTrigger aria-label="Сортировка" className={cn("h-10", triggerWidth)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORTS.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (!wheels) return sort;

  return (
    <>
      <Select
        value={query.diameter ? String(query.diameter) : "all"}
        onValueChange={(v) => onChange({ diameter: v === "all" ? null : v })}
      >
        <SelectTrigger aria-label="Диаметр" className={cn("h-10", stacked ? "w-full" : "w-36")}>
          <SelectValue placeholder="Диаметр" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Диаметр: любой</SelectItem>
          {DIAMETERS.map((d) => (
            <SelectItem key={d} value={String(d)}>
              R{d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Tabs
        value={query.construction ?? "all"}
        onValueChange={(v) => onChange({ construction: v === "all" ? null : v })}
      >
        <TabsList className={stacked ? "w-full" : undefined}>
          <TabsTrigger value="all">Все</TabsTrigger>
          <TabsTrigger value="cast">Литые</TabsTrigger>
          <TabsTrigger value="forged">Кованые</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex h-10 items-center gap-2">
        <Switch
          id={`${idPrefix}-stock`}
          checked={query.availability === "in_stock"}
          onCheckedChange={(on) => onChange({ availability: on ? "in_stock" : null })}
        />
        <Label htmlFor={`${idPrefix}-stock`} className="text-sm">
          Только в наличии
        </Label>
      </div>
      <div className={stacked ? undefined : "md:ml-auto"}>{sort}</div>
    </>
  );
}
