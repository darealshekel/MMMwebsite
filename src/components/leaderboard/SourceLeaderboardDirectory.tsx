import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Network, Search, Trophy } from "lucide-react";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import type { PublicSourceSummary } from "@/lib/types";

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 50, 100] as const;

export function SourceLeaderboardDirectory({
  sources,
  eyebrow,
  title = "Private Server Digs",
  description,
}: {
  sources: PublicSourceSummary[];
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);

  const filteredSources = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const visibleSources = !normalized
      ? sources
      : sources.filter((source) => source.displayName.toLowerCase().includes(normalized));

    return [...visibleSources].sort((left, right) => {
      const blocksDelta = (right.totalBlocks ?? 0) - (left.totalBlocks ?? 0);
      if (blocksDelta !== 0) {
        return blocksDelta;
      }
      return left.displayName.localeCompare(right.displayName);
    });
  }, [query, sources]);

  const totalPages = Math.max(1, Math.ceil(filteredSources.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedSources = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredSources.slice(start, start + pageSize);
  }, [filteredSources, pageSize, safeCurrentPage]);
  const pageStartIndex = (safeCurrentPage - 1) * pageSize;

  const paginationItems = useMemo(() => {
    if (totalPages <= 1) {
      return [1];
    }

    const pages = new Set<number>([1, totalPages, safeCurrentPage]);
    if (safeCurrentPage - 1 > 1) pages.add(safeCurrentPage - 1);
    if (safeCurrentPage + 1 < totalPages) pages.add(safeCurrentPage + 1);
    if (safeCurrentPage === 1 && totalPages >= 2) pages.add(2);
    if (safeCurrentPage === totalPages && totalPages >= 2) pages.add(totalPages - 1);

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
  }, [safeCurrentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
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

  if (!sources.length) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        {eyebrow ? <div className="font-pixel text-[8px] text-muted-foreground">{eyebrow}</div> : null}
        <h2 className="font-pixel text-2xl md:text-3xl text-foreground">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-[9px] leading-[1.7] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="SEARCH SOURCE"
              className="w-full pl-11 pr-4 py-3 bg-card border border-border font-pixel text-[10px] placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:bg-background transition-colors"
            />
          </div>

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
                      setPageSize(option);
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
              {filteredSources.length.toLocaleString()} {filteredSources.length === 1 ? "Source" : "Sources"}
            </span>
          </div>

          {filteredSources.length > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-1.5 font-pixel text-[10px]">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safeCurrentPage <= 1}
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
                    onClick={() => setCurrentPage(item)}
                    className={`grid h-10 min-w-10 place-items-center rounded-full border px-3 transition-colors ${
                      item === safeCurrentPage
                        ? "border-primary/50 bg-primary/20 text-primary"
                        : "border-border bg-card text-foreground hover:border-primary/20"
                    }`}
                    aria-current={item === safeCurrentPage ? "page" : undefined}
                  >
                    {item}
                  </button>
                ),
              )}

              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="grid h-10 w-10 place-items-center border border-border bg-card text-muted-foreground transition-colors hover:border-primary/20 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {paginatedSources.map((source, index) => (
          <Link
            key={source.id}
            to={`/leaderboard/${source.slug}`}
            className="interactive-card group flex items-center gap-4 border border-border bg-card px-4 py-3.5 text-left transition-all duration-200 hover:border-primary/40 hover:bg-card/80"
          >
            <div className="w-10 shrink-0 font-pixel text-sm text-muted-foreground">
              #{pageStartIndex + index + 1}
            </div>

            <div className="grid h-10 w-10 shrink-0 place-items-center border border-border bg-secondary overflow-hidden">
              {source.logoUrl ? (
                <img src={source.logoUrl} alt={`${source.displayName} logo`} className="h-7 w-7 object-contain" />
              ) : source.sourceType === "server" ? (
                <Network className="h-4 w-4 text-primary" />
              ) : (
                <Trophy className="h-4 w-4 text-primary" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-1.5">
                <div className="min-w-0 font-pixel text-[10px] leading-[1.45] text-foreground break-words [overflow-wrap:anywhere]">
                  {source.displayName}
                </div>
                {source.isDead ? (
                  <span
                    className="mt-[0.02rem] shrink-0 text-[0.88rem] leading-none"
                    role="img"
                    aria-label={`${source.displayName} is dead`}
                    title="Dead server"
                  >
                    💀
                  </span>
                ) : null}
              </div>
              <div className="mt-1 font-pixel text-[8px] leading-[1.55] text-muted-foreground">
                {(source.playerCount ?? 0).toLocaleString()} {(source.playerCount ?? 0) === 1 ? "player" : "players"}
              </div>
            </div>

            <div className="min-w-[8.5rem] shrink-0 text-right">
              <BlocksMinedValue as="div" value={source.totalBlocks ?? 0} className="font-pixel text-[10px] leading-[1.35]">
                {(source.totalBlocks ?? 0).toLocaleString()}
              </BlocksMinedValue>
              <div className="mt-1 font-pixel text-[8px] uppercase tracking-[0.12em] leading-[1.2] text-muted-foreground">
                Total Blocks
              </div>
            </div>

            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all duration-300 group-hover:translate-x-1 group-hover:text-primary" />
          </Link>
        ))}
      </div>

      {filteredSources.length === 0 && (
        <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">
          NO SOURCES MATCH THAT SEARCH.
        </div>
      )}
    </section>
  );
}
