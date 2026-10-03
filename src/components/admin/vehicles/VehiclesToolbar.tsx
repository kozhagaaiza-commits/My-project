"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MAKES } from "@/lib/admin-products-ui/labels";
import type { VehicleMake, VehiclesFilters } from "@/lib/admin-products-ui/list-query";

interface VehiclesToolbarProps {
  filters: VehiclesFilters;
  searchValue: string;
  onSearchChange: (v: string) => void;
  onMake: (m: VehicleMake | null) => void;
}

const ALL = "all";

export function VehiclesToolbar({ filters, searchValue, onSearchChange, onMake }: VehiclesToolbarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row">
      <Select value={filters.make ?? ALL} onValueChange={(v) => onMake(v === ALL ? null : (v as VehicleMake))}>
        <SelectTrigger className="w-full sm:w-52" aria-label="Марка">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Все марки</SelectItem>
          {MAKES.map((m) => (
            <SelectItem key={m} value={m}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Поиск по модели"
          aria-label="Поиск по модели"
          className="pl-8"
        />
      </div>
    </div>
  );
}
