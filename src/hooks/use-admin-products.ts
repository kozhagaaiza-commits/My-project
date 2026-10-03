"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAdminFetch } from "@/hooks/use-admin-products-fetch";
import { adminRequest, errorText } from "@/lib/admin-products-ui/api";
import { productsApiUrl, type ProductsFilters } from "@/lib/admin-products-ui/list-query";
import type { AdminProductRow } from "@/lib/admin-products-ui/types";

/** Текст из Блока 4 («Админка — Товары»), используется и при ответе 409 без message. */
export const PRODUCT_IN_ORDERS_TEXT = "Товар есть в заказах. Переведите его в архив";

/** Список товаров + действия строки: «В архив» (PATCH status=archived) и «Удалить» (DELETE). */
export function useAdminProducts(filters: ProductsFilters) {
  const list = useAdminFetch<AdminProductRow[]>(productsApiUrl(filters));
  const [busyId, setBusyId] = useState<string | null>(null);
  const { reload } = list;

  const archive = useCallback(
    async (row: AdminProductRow) => {
      setBusyId(row.id);
      const r = await adminRequest("PATCH", `/api/admin/products/${row.id}`, { status: "archived", updated_at: row.updated_at });
      setBusyId(null);
      if (r.ok) {
        toast.success("Товар переведён в архив");
        reload();
      } else {
        toast.error(errorText(r));
        if (r.kind === "http" && r.code === "CONFLICT") reload();
      }
    },
    [reload],
  );

  /** true — товар удалён. 409 → toast «Товар есть в заказах…». */
  const remove = useCallback(
    async (row: AdminProductRow): Promise<boolean> => {
      setBusyId(row.id);
      const r = await adminRequest("DELETE", `/api/admin/products/${row.id}`);
      setBusyId(null);
      if (r.ok) {
        toast.success("Товар удалён");
        reload();
        return true;
      }
      toast.error(r.kind === "http" && r.status === 409 ? PRODUCT_IN_ORDERS_TEXT : errorText(r));
      return false;
    },
    [reload],
  );

  return { list, busyId, archive, remove };
}
