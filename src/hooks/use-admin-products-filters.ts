"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDebouncedSearch } from "@/hooks/use-admin-products-search";
import { productsPageHref, type ProductsFilters } from "@/lib/admin-products-ui/list-query";
import type { AdminProductStatus, AdminProductType } from "@/lib/admin-products-ui/types";

/** Фильтры списка товаров живут в URL: router.replace без скролла; смена вкладки/статуса/поиска сбрасывает страницу. */
export function useAdminProductsFilters(filters: ProductsFilters) {
  const router = useRouter();
  const go = useCallback(
    (next: ProductsFilters) => router.replace(productsPageHref(next), { scroll: false }),
    [router],
  );
  const search = useDebouncedSearch(filters.q, (q) => go({ ...filters, q, page: 1 }));

  return {
    search,
    setType: (type: AdminProductType) => go({ ...filters, type, page: 1 }),
    setStatus: (status: AdminProductStatus | null) => go({ ...filters, status, page: 1 }),
    reset: () => {
      search.clear();
      go({ ...filters, status: null, q: "", page: 1 });
    },
    hrefFor: (page: number) => productsPageHref({ ...filters, page }),
  };
}
