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
  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));

  // Generates page numbers; always shows at least page 1 in format: Previous 1 Next
  const getPageNumbers = () => {
    if (pages <= 5) {
      return Array.from({ length: pages }, (_, i) => i);
    }
    const current = page;
    const items: (number | "ellipsis")[] = [];
    items.push(0);
    if (current > 2) items.push("ellipsis");
    const start = Math.max(1, current - 1);
    const end = Math.min(pages - 2, current + 1);
    for (let i = start; i <= end; i++) items.push(i);
    if (current < pages - 3) items.push("ellipsis");
    items.push(pages - 1);
    return items;
  };

  const pageNumbers = getPageNumbers();

  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
        className="h-8 rounded-xl px-3 text-xs font-medium cursor-pointer border-border hover:bg-muted text-foreground disabled:opacity-40"
      >
        Previous
      </Button>

      {pageNumbers.map((p, idx) => {
        if (p === "ellipsis") {
          return (
            <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground select-none">
              …
            </span>
          );
        }
        const isActive = page === p;
        return (
          <Button
            key={p}
            variant={isActive ? "default" : "outline"}
            size="sm"
            onClick={() => setPage(p)}
            className={`h-8 min-w-[32px] px-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
              isActive
                ? "bg-brand text-brand-foreground hover:bg-brand/90 shadow-xs"
                : "border-border hover:bg-muted text-foreground"
            }`}
          >
            {p + 1}
          </Button>
        );
      })}

      <Button
        variant="outline"
        size="sm"
        disabled={page + 1 >= pages}
        onClick={() => setPage(page + 1)}
        className="h-8 rounded-xl px-3 text-xs font-medium cursor-pointer border-border hover:bg-muted text-foreground disabled:opacity-40"
      >
        Next
      </Button>
    </nav>
  );
}
