import { SlidersHorizontal, X, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { Footer } from "@/components/Footer";
import { LeaderboardDirectoryControls } from "@/components/leaderboard/LeaderboardDirectoryControls";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { PlayerAvatar } from "@/components/leaderboard/PlayerAvatar";
import { RankBadge } from "@/components/leaderboard/RankBadge";
import { SkeletonLeaderboardRows } from "@/components/Skeleton";
import { SourceTabs } from "@/components/leaderboard/SourceTabs";
import { TopMinersPodium, TopStatsRow } from "@/components/leaderboard/TopMinersPodium";
import { DEFAULT_LEADERBOARD_PAGE_SIZE, normalizeLeaderboardPageSize } from "@/lib/leaderboard-page-size";
import { fetchSpecialLeaderboardSummary } from "@/lib/leaderboard-repository";
import { getPlayerBadges } from "@/lib/player-badges";
import { specialLeaderboardIconKey, specialLeaderboardLabel } from "../../shared/source-classification.js";

type SpecialKind = "ssp" | "hsp";

function formatTimeAgo(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function readPositiveInt(value: string | null, fallback: number, max = 10_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function readNonNegativeInt(value: string | null, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

export default function SSPHSPLeaderboard({ kind = "ssp" }: { kind?: SpecialKind }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("query") ?? "";
  const minBlocks = readNonNegativeInt(searchParams.get("minBlocks"));
  const page = readPositiveInt(searchParams.get("page"), 1);
  const pageSize = normalizeLeaderboardPageSize(searchParams.get("pageSize"));
  const [knownTotals, setKnownTotals] = useState({ totalPages: 1, totalRows: 0 });
  const previousKindRef = useRef(kind);
  const hasActiveFilters = Boolean(query.trim()) || minBlocks > 0;
  const needsSeparateSummary = hasActiveFilters || page !== 1 || pageSize !== 20;
  const label = specialLeaderboardLabel(kind);
  const iconKey = specialLeaderboardIconKey(kind);

  const summaryQuery = useQuery({
    queryKey: ["special-leaderboard", kind, "summary"],
    queryFn: () => fetchSpecialLeaderboardSummary(kind, { page: 1, pageSize: 20 }),
    enabled: needsSeparateSummary,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["special-leaderboard", kind, page, pageSize, query, minBlocks],
    queryFn: () => fetchSpecialLeaderboardSummary(kind, { page, pageSize, query, minBlocks }),
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const updateDirectoryParams = useCallback((
    updates: Partial<{ query: string; minBlocks: number; page: number; pageSize: number }>,
    options: { replace?: boolean } = { replace: true },
  ) => {
    const next = new URLSearchParams(searchParams);
    const nextQuery = updates.query ?? query;
    const nextMinBlocks = updates.minBlocks ?? minBlocks;
    const nextPage = updates.page ?? page;
    const nextPageSize = updates.pageSize ?? pageSize;

    if (nextQuery.trim()) next.set("query", nextQuery);
    else next.delete("query");

    if (nextMinBlocks > 0) next.set("minBlocks", String(nextMinBlocks));
    else next.delete("minBlocks");

    if (nextPage > 1) next.set("page", String(nextPage));
    else next.delete("page");

    if (nextPageSize !== DEFAULT_LEADERBOARD_PAGE_SIZE) next.set("pageSize", String(nextPageSize));
    else next.delete("pageSize");

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: options.replace ?? true });
    }
  }, [minBlocks, page, pageSize, query, searchParams, setSearchParams]);

  const setQuery = useCallback((value: string) => {
    updateDirectoryParams({ query: value, page: 1 }, { replace: true });
  }, [updateDirectoryParams]);

  const setMinBlocks = useCallback((value: number) => {
    updateDirectoryParams({ minBlocks: Math.max(0, Math.floor(value) || 0), page: 1 }, { replace: true });
  }, [updateDirectoryParams]);

  const setPageSize = useCallback((value: number) => {
    updateDirectoryParams({ pageSize: normalizeLeaderboardPageSize(value), page: 1 }, { replace: true });
  }, [updateDirectoryParams]);

  useEffect(() => {
    if (searchParams.has("pageSize") && pageSize === DEFAULT_LEADERBOARD_PAGE_SIZE && searchParams.get("pageSize") !== String(DEFAULT_LEADERBOARD_PAGE_SIZE)) {
      updateDirectoryParams({ pageSize }, { replace: true });
    }
  }, [pageSize, searchParams, updateDirectoryParams]);

  const setPage = useCallback((value: number, replace = false) => {
    updateDirectoryParams({ page: Math.max(1, Math.floor(value) || 1) }, { replace });
  }, [updateDirectoryParams]);

  const clearFilters = useCallback(() => {
    updateDirectoryParams({ query: "", minBlocks: 0, page: 1 }, { replace: true });
  }, [updateDirectoryParams]);

  useEffect(() => {
    if (previousKindRef.current !== kind) {
      previousKindRef.current = kind;
      setPage(1, true);
    }
  }, [kind, setPage]);

  const currentData = data?.kind === kind && data.page === page && data.pageSize === pageSize ? data : undefined;
  const currentSummaryData = summaryQuery.data?.kind === kind ? summaryQuery.data : undefined;
  const summaryData = currentSummaryData ?? currentData;
  const rows = currentData?.rows ?? [];
  const topMiner = summaryData?.featuredRows?.[0]?.username ?? "-";
  const reportedTotalPages = currentData?.totalPages ?? summaryData?.totalPages;
  const reportedTotalRows = currentData?.totalRows ?? summaryData?.totalRows;
  const totalPages = Math.max(1, reportedTotalPages ?? knownTotals.totalPages ?? page);
  const totalItems = reportedTotalRows ?? knownTotals.totalRows ?? rows.length;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const goToPage = (nextPage: number) => setPage(nextPage);

  useEffect(() => {
    if (reportedTotalPages === undefined && reportedTotalRows === undefined) {
      return;
    }

    const nextTotalPages = Math.max(1, reportedTotalPages ?? knownTotals.totalPages);
    const nextTotalRows = reportedTotalRows ?? knownTotals.totalRows;
    setKnownTotals((previous) =>
      previous.totalPages === nextTotalPages && previous.totalRows === nextTotalRows
        ? previous
        : { totalPages: nextTotalPages, totalRows: nextTotalRows },
    );
  }, [reportedTotalPages, reportedTotalRows, knownTotals.totalPages, knownTotals.totalRows]);

  useEffect(() => {
    if (reportedTotalPages !== undefined && page > totalPages) {
      setPage(totalPages, true);
    }
  }, [page, reportedTotalPages, setPage, totalPages]);

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      <main className="container py-6 md:py-8 space-y-6">
        <SourceTabs
          publicSources={[]}
          activeSourceSlug={null}
          activeDirectory={kind}
          ssphspIcons={summaryData?.icons ?? null}
        />

        <section className="pixel-card border border-border p-6 md:p-8 grid-bg">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10 animate-fade-in">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary">
                {summaryData?.icons?.[iconKey] ? <img src={summaryData.icons[iconKey]} alt={`${label} icon`} className="h-4 w-4 object-contain" /> : null}
                <span className="font-pixel text-[9px]">{label}</span>
              </div>
              <h1 className="font-pixel text-3xl md:text-5xl text-foreground leading-tight">
                {label}
                <span className="text-primary animate-blink">_</span>
              </h1>
              <p className="font-display text-2xl text-muted-foreground max-w-2xl leading-tight">
                {summaryData?.description ?? (kind === "hsp" ? "Ranking for Hardcore Single Player digs." : "Ranking for Single Player Survival digs.")}
              </p>
            </div>

            <TopStatsRow
              topMiner={topMiner}
              players={summaryData?.playerCount ?? 0}
              totalBlocks={summaryData?.totalBlocks ?? 0}
            />
          </div>

          <TopMinersPodium rows={summaryData?.featuredRows ?? []} countLabel="WORLDS" />
        </section>

        <section className="space-y-5">
          <h2 className="font-pixel text-2xl md:text-3xl">
            Player Rankings
            <span className="text-primary animate-blink">_</span>
          </h2>

          <LeaderboardDirectoryControls
            query={query}
            onQueryChange={setQuery}
            placeholder="SEARCH PLAYER"
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={goToPage}
            totalItems={totalItems}
            itemLabel={totalItems === 1 ? "Player" : "Players"}
            actions={
              <>
                <div className="flex items-center gap-3 px-4 py-3 bg-card border border-border">
                  <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
                  <span className="font-pixel text-[10px] text-muted-foreground whitespace-nowrap">MIN BLOCKS</span>
                  <input
                    type="number"
                    value={minBlocks || ""}
                    onChange={(e) => setMinBlocks(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-24 bg-transparent font-pixel text-[10px] focus:outline-none"
                  />
                </div>
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-2 px-4 py-3 bg-card border border-border font-pixel text-[10px] hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  CLEAR
                </button>
              </>
            }
          />

          {error ? (
            <div className="py-16 text-center font-pixel text-[10px] text-muted-foreground border border-dashed border-border">
              {label} LEADERBOARD UNAVAILABLE
            </div>
          ) : isLoading || !currentData ? (
            <SkeletonLeaderboardRows count={pageSize} />
          ) : rows.length === 0 ? (
            <div className="py-16 text-center font-pixel text-[10px] text-muted-foreground border border-dashed border-border">
              NO PLAYERS FOUND
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {rows.map((player) => {
                const top3 = player.rank <= 3;
                return (
                  <Link
                    key={player.rowKey ?? player.username}
                    to={`/player/${encodeURIComponent(player.username.toLowerCase())}`}
                    className="group flex items-center gap-4 px-4 py-3.5 bg-card border border-border hover:border-primary/40 hover:bg-card/80 transition-all text-left"
                  >
                    <RankBadge rank={player.rank} highlighted={top3} />

                    <div className="shrink-0">
                      <div className="w-10 h-10 grid place-items-center bg-secondary border border-border overflow-hidden">
                        <PlayerAvatar username={player.username} skinFaceUrl={player.skinFaceUrl} className="w-full h-full border-0 bg-transparent" fallbackClassName="text-[10px]" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 self-stretch flex flex-col justify-center">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="font-pixel text-xs leading-[1.35] text-foreground break-words [overflow-wrap:anywhere]">{player.username}</div>
                        {getPlayerBadges(player.username).map((b) => (
                          <img key={b.src} src={b.src} alt={b.label} title={b.label} className="h-5 w-5 object-contain shrink-0" style={{ imageRendering: "pixelated" }} />
                        ))}
                      </div>
                      <div className="font-pixel text-[8px] leading-[1.45] text-muted-foreground mt-1">
                        {formatTimeAgo(player.lastUpdated)} • {player.sourceCount} {player.sourceCount === 1 ? "world" : "worlds"} tracked
                      </div>
                    </div>

                    <div className="min-w-[8.5rem] text-right shrink-0">
                      <BlocksMinedValue as="div" value={player.blocksMined} className="font-pixel text-xs leading-[1.3]">
                        {player.blocksMined.toLocaleString()}
                      </BlocksMinedValue>
                      <div className="font-pixel text-[8px] text-muted-foreground mt-1 tracking-widest">BLOCKS MINED</div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </Link>
                );
              })}
            </div>
          )}

        </section>
      </main>
      <Footer />
    </div>
  );
}
