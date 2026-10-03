"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PRODUCT_STATUS_LABELS } from "@/lib/admin-products-ui/labels";
import type { ProductsFilters } from "@/lib/admin-products-ui/list-query";
import type { AdminProductStatus, AdminProductType } from "@/lib/admin-products-ui/types";

interface ProductsToolbarProps {
  filters: ProductsFilters;
  searchValue: string;
  onSearchChange: (v: string) => void;
  onType: (t: AdminProductType) => void;
  onStatus: (s: AdminProductStatus | null) => void;
}

const ALL = "all";

/** Tabs «Диски / Карбон», Select статуса, поиск по названию и SKU. */
export function ProductsToolbar({ filters, searchValue, onSearchChange, onType, onStatus }: ProductsToolbarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
      <Tabs value={filters.type} onValueChange={(v) => onType(v as AdminProductType)}>
        <TabsList>
          <TabsTrigger value="wheel_set">Диски</TabsTrigger>
          <TabsTrigger value="carbon_part">Карбон</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-1 flex-col gap-3 sm:flex-row md:justify-end">
        <Select value={filters.status ?? ALL} onValueChange={(v) => onStatus(v === ALL ? null : (v as AdminProductStatus))}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Статус">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все статусы</SelectItem>
            {(Object.keys(PRODUCT_STATUS_LABELS) as AdminProductStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{PRODUCT_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Название или SKU"
            aria-label="Поиск по названию или SKU"
            className="pl-8"
          />
        </div>
      </div>
    </div>
  );
}
