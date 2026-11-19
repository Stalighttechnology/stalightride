import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const PAGE_SIZE = 25;

/** Page state for a list loaded with `.select(cols, { count: "exact" }).range(from, to)`. */
export function usePage(pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  // Approving or removing the last rows of a page would leave it empty: step back instead.
  useEffect(() => {
    if (page > 0 && page * pageSize >= total) setPage(Math.max(0, Math.ceil(total / pageSize) - 1));
  }, [page, total, pageSize]);
  const from = page * pageSize;
  return { page, setPage, total, setTotal, pageSize, from, to: from + pageSize - 1 };
}

export function ListPager({
  page,
  total,
  pageSize,
  setPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  setPage: (page: number) => void;
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-3">
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page + 1} of {pages} · {total} total
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page + 1 >= pages}
        onClick={() => setPage(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
