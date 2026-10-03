import {
  Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";

interface OrdersPaginationProps {
  page: number;
  total: number;
  perPage: number;
}

function pageWindow(current: number, last: number): Array<number | "gap-left" | "gap-right"> {
  const sorted = [...new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last))].sort((a, b) => a - b);
  const result: Array<number | "gap-left" | "gap-right"> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push(i === 1 ? "gap-left" : "gap-right");
    result.push(p);
  });
  return result;
}

const href = (page: number) => (page <= 1 ? "/account" : `/account?page=${page}`);

export function OrdersPagination({ page, total, perPage }: OrdersPaginationProps) {
  const last = Math.max(1, Math.ceil(total / perPage));
  if (last <= 1) return null;
  return (
    <Pagination>
      <PaginationContent>
        {page > 1 && <PaginationItem><PaginationPrevious href={href(page - 1)} /></PaginationItem>}
        {pageWindow(page, last).map((p) =>
          typeof p === "number" ? (
            <PaginationItem key={p}><PaginationLink href={href(p)} isActive={p === page}>{p}</PaginationLink></PaginationItem>
          ) : (
            <PaginationItem key={p}><PaginationEllipsis /></PaginationItem>
          ),
        )}
        {page < last && <PaginationItem><PaginationNext href={href(page + 1)} /></PaginationItem>}
      </PaginationContent>
    </Pagination>
  );
}
