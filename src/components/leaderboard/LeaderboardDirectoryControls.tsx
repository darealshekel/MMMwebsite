import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 50, 100] as const;

export function LeaderboardDirectoryControls({
  query,
  onQueryChange,
  placeholder,
  pageSize,
  onPageSizeChange,
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemLabel,
  actions,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  pageSize: number;
  onPageSizeChange: (value: number) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (value: number) => void;
  totalItems: number;
  itemLabel: string;
  actions?: ReactNode;
}) {
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);

  const paginationItems = useMemo(() => {
    if (totalPages <= 1) {
      return [1];
    }

    const pages = new Set<number>([1, totalPages, currentPage]);
    if (currentPage - 1 > 1) pages.add(currentPage - 1);
    if (currentPage + 1 < totalPages) pages.add(currentPage + 1);
    if (currentPage === 1 && totalPages >= 2) pages.add(2);
    if (currentPage === totalPages && totalPages >= 2) pages.add(totalPages - 1);

    const sortedPages = [...pages].sort((left, right) => left - right);
    const items: Array<number | "ellipsis"> = [];

    for (let index = 0; index < sortedPages.length; index += 1) {
      const page = sortedPages[index];
      const previousPage = sortedPages[index - 1];
      if (index > 0 && page - previousPage > 1) {
        items.push("ellipsis");
      }
      items.push(page);
    }

    return items;
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!isViewMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!viewMenuRef.current?.contains(event.target as Node)) {
        setIsViewMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isViewMenuOpen]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={placeholder}
            className="w-full pl-11 pr-4 py-3 bg-card border border-border font-pixel text-[10px] placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:bg-background transition-colors"
          />
        </div>

        {actions}

        <div className="relative shrink-0" ref={viewMenuRef}>
          <button
            type="button"
            onClick={() => setIsViewMenuOpen((open) => !open)}
            className="flex min-w-[9.75rem] items-center justify-between gap-3 px-4 py-3 bg-card border border-border font-pixel text-[10px] hover:border-primary/40 transition-colors"
            aria-haspopup="menu"
            aria-expanded={isViewMenuOpen}
          >
            <span>VIEW: {pageSize}</span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isViewMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {isViewMenuOpen ? (
            <div className="absolute right-0 z-20 mt-2 min-w-[9.75rem] overflow-hidden border border-border bg-card shadow-[0_12px_32px_rgba(0,0,0,0.28)]">
              {PAGE_SIZE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    onPageSizeChange(option);
                    setIsViewMenuOpen(false);
                  }}
                  className={`block w-full px-4 py-2.5 text-left font-pixel text-[10px] transition-colors ${
                    pageSize === option
                      ? "bg-primary/15 text-primary"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 font-pixel text-[8px] uppercase tracking-[0.12em] text-muted-foreground">
          <span className="border border-border bg-card px-2 py-1 text-foreground">VIEW: CARD</span>
          <span>
            {totalItems.toLocaleString()} {itemLabel}
          </span>
        </div>

        {totalItems > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5 font-pixel text-[10px]">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="grid h-10 w-10 place-items-center border border-border bg-card text-muted-foreground transition-colors hover:border-primary/20 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {paginationItems.map((item, index) =>
              item === "ellipsis" ? (
                <span
                  key={`ellipsis-${index}`}
                  className="grid h-10 min-w-10 place-items-center px-2 text-muted-foreground"
                  aria-hidden="true"
                >
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => onPageChange(item)}
                  className={`grid h-10 min-w-10 place-items-center rounded-full border px-3 transition-colors ${
                    item === currentPage
                      ? "border-primary/50 bg-primary/20 text-primary"
                      : "border-border bg-card text-foreground hover:border-primary/20"
                  }`}
                  aria-current={item === currentPage ? "page" : undefined}
                >
                  {item}
                </button>
              ),
            )}

            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
              className="grid h-10 w-10 place-items-center border border-border bg-card text-muted-foreground transition-colors hover:border-primary/20 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
