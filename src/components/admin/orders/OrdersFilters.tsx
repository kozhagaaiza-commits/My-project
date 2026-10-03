"use client";

import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MIN_SEARCH_LENGTH, ORDER_TABS } from "@/lib/admin-ui/order-ui";
import type { OrdersFilters as Filters } from "@/lib/admin-ui/orders-query";

interface OrdersFiltersProps {
  filters: Filters;
  searchInput: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onTabChange: (tab: string) => void;
  onAttentionChange: (value: boolean) => void;
}

/** Tabs по статусам, поиск (debounce 400 мс) и Switch «Требуют внимания» — всё в URL. */
export function OrdersFilters({
  filters, searchInput, onSearchChange, onClearSearch, onTabChange, onAttentionChange,
}: OrdersFiltersProps) {
  const tooShort = searchInput.trim().length > 0 && searchInput.trim().length < MIN_SEARCH_LENGTH;
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto pb-1">
        <Tabs value={filters.tab} onValueChange={onTabChange}>
          <TabsList aria-label="Статус заказа">
            {ORDER_TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className="px-3">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-1 sm:max-w-sm">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="text" inputMode="search"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Номер, email или телефон"
              aria-label="Поиск заказа"
              maxLength={60}
              className="pr-9 pl-9"
            />
            {searchInput && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onClearSearch}
                aria-label="Очистить поиск"
                className="absolute top-1/2 right-2 -translate-y-1/2"
              >
                <X aria-hidden />
              </Button>
            )}
          </div>
          {tooShort && <p className="text-xs text-muted-foreground">Введите минимум {MIN_SEARCH_LENGTH} символа</p>}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="orders-attention" checked={filters.attention} onCheckedChange={onAttentionChange} />
          <Label htmlFor="orders-attention">Требуют внимания</Label>
        </div>
      </div>
    </div>
  );
}
