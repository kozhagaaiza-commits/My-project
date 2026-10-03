"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminErrorAlert } from "@/components/admin/layout/AdminErrorAlert";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminPagination } from "@/components/admin/layout/AdminPagination";
import { DeleteProductDialog } from "@/components/admin/products/DeleteProductDialog";
import { ProductsCardList } from "@/components/admin/products/ProductsCardList";
import { ProductsEmpty } from "@/components/admin/products/ProductsEmpty";
import { ProductsSkeleton } from "@/components/admin/products/ProductsSkeleton";
import { ProductsTable } from "@/components/admin/products/ProductsTable";
import { ProductsToolbar } from "@/components/admin/products/ProductsToolbar";
import { Button } from "@/components/ui/button";
import { useAdminProducts } from "@/hooks/use-admin-products";
import { useAdminProductsFilters } from "@/hooks/use-admin-products-filters";
import type { ProductsFilters } from "@/lib/admin-products-ui/list-query";
import type { AdminProductRow } from "@/lib/admin-products-ui/types";

interface ProductsViewProps {
  filters: ProductsFilters;
}

/** /admin/products: фильтры в URL, список с состояниями Loading / Empty / Error, действия строки. */
export function ProductsView({ filters }: ProductsViewProps) {
  const nav = useAdminProductsFilters(filters);
  const { list, busyId, archive, remove } = useAdminProducts(filters);
  const [toDelete, setToDelete] = useState<AdminProductRow | null>(null);

  const rows = list.data ?? [];
  const filtered = filters.status !== null || filters.q.length > 0;
  const emptyCatalog = list.status === "ready" && rows.length === 0 && !filtered && filters.page === 1;

  return (
    <>
      <AdminPageHeader
        title="Товары"
        actions={
          // В пустом каталоге «Добавить первый товар» — единственная жёлтая кнопка экрана.
          emptyCatalog ? undefined : (
            <Button asChild>
              <Link href="/admin/products/new">
                <Plus aria-hidden />
                Добавить товар
              </Link>
            </Button>
          )
        }
      />
      <ProductsToolbar
        filters={filters}
        searchValue={nav.search.value}
        onSearchChange={nav.search.onChange}
        onType={nav.setType}
        onStatus={nav.setStatus}
      />
      {list.status === "loading" && <ProductsSkeleton />}
      {list.status === "error" && (
        <AdminErrorAlert title="Не удалось загрузить товары" description={list.error?.message} onRetry={list.reload} />
      )}
      {list.status === "ready" && rows.length === 0 && <ProductsEmpty filtered={filtered || filters.page > 1} onReset={nav.reset} />}
      {list.status === "ready" && rows.length > 0 && (
        <div className="space-y-4">
          <ProductsTable rows={rows} busyId={busyId} onArchive={(p) => void archive(p)} onDelete={setToDelete} />
          <ProductsCardList rows={rows} busyId={busyId} onArchive={(p) => void archive(p)} onDelete={setToDelete} />
          {list.meta && (
            <AdminPagination page={list.meta.page} total={list.meta.total} perPage={list.meta.per_page} hrefFor={nav.hrefFor} />
          )}
        </div>
      )}
      <DeleteProductDialog
        product={toDelete}
        busy={toDelete !== null && busyId === toDelete.id}
        onCancel={() => setToDelete(null)}
        onConfirm={(p) => void remove(p).then(() => setToDelete(null))}
      />
    </>
  );
}
