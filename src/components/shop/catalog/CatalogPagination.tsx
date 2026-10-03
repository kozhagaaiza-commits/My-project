import { catalogHref } from "@/components/shop/catalog/catalog-params";
import {
  Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import type { ProductsQuery } from "@/types/catalog";

interface CatalogPaginationProps {
  query: ProductsQuery;
  total: number;
  perPage: number;
}

/** 1 … 4 5 6 … 12 */
function pageWindow(current: number, last: number): Array<number | "gap-left" | "gap-right"> {
  const pages = new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last));
  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | "gap-left" | "gap-right"> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push(i === 1 ? "gap-left" : "gap-right");
    result.push(p);
  });
  return result;
}

export function CatalogPagination({ query, total, perPage }: CatalogPaginationProps) {
  const last = Math.max(1, Math.ceil(total / perPage));
  if (last <= 1) return null;
  const href = (page: number) => catalogHref(query.type, { ...query, page });

  return (
    <Pagination>
      <PaginationContent>
        {query.page > 1 && (
          <PaginationItem>
            <PaginationPrevious href={href(query.page - 1)}/>
          </PaginationItem>
        )}
        {pageWindow(query.page, last).map((p) =>
          typeof p === "number" ? (
            <PaginationItem key={p}>
              <PaginationLink href={href(p)} isActive={p === query.page}>
                {p}
              </PaginationLink>
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationEllipsis />
            </PaginationItem>
          ),
        )}
        {query.page < last && (
          <PaginationItem>
            <PaginationNext href={href(query.page + 1)} />
          </PaginationItem>
        )}
      </PaginationContent>
    </Pagination>
  );
}
