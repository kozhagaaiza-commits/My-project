"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ateliersHref, parseAteliersFilters } from "@/lib/admin-ui/ateliers-query";
import type { AtelierStatusValue } from "@/types/ateliers";

/** Вкладка и страница живут в URL (router.replace без скролла); смена вкладки сбрасывает страницу. */
export function useAdminAteliersFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = parseAteliersFilters(searchParams);
  const setStatus = useCallback(
    (status: AtelierStatusValue) => router.replace(ateliersHref({ status, page: 1 }), { scroll: false }),
    [router],
  );
  return { filters, setStatus };
}
