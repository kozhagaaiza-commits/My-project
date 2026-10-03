import {
  Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";

interface AdminPaginationProps {
  page: number;
  total: number;
  perPage: number;
  hrefFor: (page: number) => string;
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

export function AdminPagination({ page, total, perPage, hrefFor }: AdminPaginationProps) {
  const last = Math.max(1, Math.ceil(total / perPage));
  if (last <= 1) return null;
  return (
    <Pagination>
      <PaginationContent>
        {page > 1 && (
          <PaginationItem>
            <PaginationPrevious href={hrefFor(page - 1)} scroll={false} replace />
          </PaginationItem>
        )}
        {pageWindow(page, last).map((p) =>
          typeof p === "number" ? (
            <PaginationItem key={p}>
              <PaginationLink href={hrefFor(p)} isActive={p === page} scroll={false} replace>
                {p}
              </PaginationLink>
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationEllipsis />
            </PaginationItem>
          ),
        )}
        {page < last && (
          <PaginationItem>
            <PaginationNext href={hrefFor(page + 1)} scroll={false} replace />
          </PaginationItem>
        )}
      </PaginationContent>
    </Pagination>
  );
}
