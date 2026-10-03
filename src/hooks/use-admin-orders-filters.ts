"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ordersHref, parseOrdersFilters, type OrdersFilters } from "@/lib/admin-ui/orders-query";

export const SEARCH_DEBOUNCE_MS = 400;

/**
 * Фильтры списка заказов живут в URL (router.replace без скролла). Поиск: локальное значение поля,
 * в URL попадает через 400 мс после последнего ввода; смена вкладки/поиска/«внимания» сбрасывает страницу.
 */
export function useAdminOrdersFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = parseOrdersFilters(searchParams);
  const [searchInput, setSearchInput] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Последний переход, ещё не отразившийся в URL: быстрые подряд действия не должны затирать друг друга.
  const pending = useRef<OrdersFilters | null>(null);
  const urlKey = searchParams.toString();

  useEffect(() => {
    pending.current = null;
  }, [urlKey]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Читаем актуальный URL в момент вызова — таймер поиска не должен затирать вкладку, выбранную позже.
  const navigate = useCallback(
    (patch: Partial<OrdersFilters>, resetPage: boolean) => {
      const current = pending.current ?? parseOrdersFilters(window.location.search);
      const next = { ...current, ...patch, page: resetPage ? 1 : (patch.page ?? current.page) };
      pending.current = next;
      router.replace(ordersHref(next), { scroll: false });
    },
    [router],
  );

  const setTab = useCallback((tab: string) => navigate({ tab }, true), [navigate]);
  const setAttention = useCallback((attention: boolean) => navigate({ attention }, true), [navigate]);

  const onSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => navigate({ q: value.trim().slice(0, 60) }, true), SEARCH_DEBOUNCE_MS);
    },
    [navigate],
  );

  const clearSearch = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setSearchInput("");
    navigate({ q: "" }, true);
  }, [navigate]);

  return { filters, searchInput, onSearchChange, clearSearch, setTab, setAttention };
}
