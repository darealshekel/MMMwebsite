import { Search, SlidersHorizontal, X, ChevronRight } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { Footer } from "@/components/Footer";
import { LeaderboardDirectoryControls } from "@/components/leaderboard/LeaderboardDirectoryControls";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { PlayerAvatar } from "@/components/leaderboard/PlayerAvatar";
import { RankBadge } from "@/components/leaderboard/RankBadge";
import { SkeletonLeaderboardRows } from "@/components/Skeleton";
import { SourceTabs } from "@/components/leaderboard/SourceTabs";
import { TopMinersPodium, TopStatsRow } from "@/components/leaderboard/TopMinersPodium";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import {
  canonicalRowsForPageFromWindow,
  canonicalWindowPageForIndex,
  canonicalizeRowsFromWindows,
  dedupeLeaderboardRows,
  expectedRowsForPage,
  fetchCanonicalMainRankWindow,
  normalizeLeaderboardPlayerName,
} from "@/lib/canonical-leaderboard-ranks";
import { useSiteContent } from "@/hooks/use-site-content";
import { DEFAULT_LEADERBOARD_PAGE_SIZE, normalizeLeaderboardPageSize } from "@/lib/leaderboard-page-size";
import { fetchPublicSources } from "@/lib/leaderboard-repository";
import type { LeaderboardRowSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getPlayerBadges } from "@/lib/player-badges";
import { shouldShowInPrivateServerDigs } from "../../../shared/source-classification.js";
import { useSubscriberRoles, subscriberRoleClass } from "@/hooks/useSubscriberRoles";

const PLAYER_DIGS_ICON_URL = "/diamond-pickaxe.png";

type LinkedViewer = {
  username?: string | null;
  minecraftUsername?: string | null;
  minecraftUuidHash?: string | null;
  provider?: string | null;
};

function formatTimeAgo(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function normalizePlayerName(value: string | null | undefined) {
  return normalizeLeaderboardPlayerName(value);
}

function leaderboardRowKey(player: LeaderboardRowSummary, page: number, index: number) {
  const identity = normalizePlayerName(player.username);
  const stableId = player.playerId ?? player.rowKey ?? player.sourceKey ?? identity;
  const rank = Number.isFinite(player.rank) && player.rank > 0 ? player.rank : `${page}:${index}`;
  return `${rank}:${stableId}:${identity}`;
}

function displayLeaderboardCopy(value: string) {
  return value
    .replace(/\bPrivate Server Digs\b/g, "Server Digs")
    .replace(/\bDigs\b/g, "Player Digs");
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

export function LeaderboardScreen({ sourceSlug = null }: { sourceSlug?: string | null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("query") ?? "";
  const minBlocks = readNonNegativeInt(searchParams.get("minBlocks"));
  const page = readPositiveInt(searchParams.get("page"), 1);
  const pageSize = normalizeLeaderboardPageSize(searchParams.get("pageSize"));
  const [knownTotals, setKnownTotals] = useState({ totalPages: 1, totalRows: 0 });
  const previousSourceSlugRef = useRef(sourceSlug);
  const siteContent = useSiteContent();
  const currentUserQuery = useCurrentUser();
  const { data: subscriberRoles } = useSubscriberRoles();
  const sourcesQuery = useQuery({
    queryKey: ["leaderboard-sources"],
    queryFn: fetchPublicSources,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const summaryQuery = useLeaderboard({
    sourceSlug,
    page: 1,
    pageSize: 20,
  });

  const leaderboardQuery = useLeaderboard({
    sourceSlug,
    page,
    pageSize,
    query,
    minBlocks,
  });

  const currentViewer = currentUserQuery.data as LinkedViewer | null | undefined;
  const hasLinkedPlayer = Boolean(currentViewer?.minecraftUuidHash) || currentViewer?.provider === "local-dev";
  const linkedPlayerName = hasLinkedPlayer
    ? normalizePlayerName(currentViewer.minecraftUsername ?? currentViewer.username)
    : "";

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
    if (previousSourceSlugRef.current !== sourceSlug) {
      previousSourceSlugRef.current = sourceSlug;
      setPage(1, true);
    }
  }, [sourceSlug, setPage]);

  const hasActiveFilters = Boolean(query.trim()) || minBlocks > 0;
  const currentData = !leaderboardQuery.isPlaceholderData && leaderboardQuery.data?.page === page && leaderboardQuery.data?.pageSize === pageSize
    ? leaderboardQuery.data
    : undefined;
  const summaryData = summaryQuery.data ?? (!hasActiveFilters ? currentData ?? leaderboardQuery.data : undefined);
  const data = currentData;
  const shouldUsePagePositionRanks = !sourceSlug && !hasActiveFilters;
  const baseUniqueRows = useMemo(() => dedupeLeaderboardRows(data?.rows ?? []), [data?.rows]);
  const expectedCurrentRows = data
    ? expectedRowsForPage(page, pageSize, data.totalRows, data.totalPages)
    : pageSize;
  const requestedStartIndex = (page - 1) * pageSize;
  const canonicalWindowPage = canonicalWindowPageForIndex(requestedStartIndex);
  const canonicalWindowQuery = useQuery({
    queryKey: ["leaderboard-canonical-window", canonicalWindowPage],
    queryFn: () => fetchCanonicalMainRankWindow(canonicalWindowPage),
    enabled: shouldUsePagePositionRanks && page > 1,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const filteredRankWindowPages = useMemo(() => {
    if (sourceSlug || !hasActiveFilters || baseUniqueRows.length === 0) return [];
    return Array.from(new Set(
      baseUniqueRows
        .map((row) => Number(row.rank))
        .filter((rank) => Number.isFinite(rank) && rank > 0)
        .map((rank) => canonicalWindowPageForIndex(rank - 1)),
    )).sort((a, b) => a - b);
  }, [baseUniqueRows, hasActiveFilters, sourceSlug]);
  const filteredCanonicalRanksQuery = useQuery({
    queryKey: ["leaderboard-filtered-canonical-ranks", filteredRankWindowPages.join(":")],
    queryFn: () => Promise.all(filteredRankWindowPages.map((windowPage) => fetchCanonicalMainRankWindow(windowPage))),
    enabled: filteredRankWindowPages.length > 0,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const isResolvingCanonicalPage = shouldUsePagePositionRanks && page > 1 && canonicalWindowQuery.isLoading;
  const isResolvingFilteredRanks = !sourceSlug && hasActiveFilters && filteredRankWindowPages.length > 0 && filteredCanonicalRanksQuery.isLoading;
  const rankingRows = useMemo(() => {
    if (shouldUsePagePositionRanks && canonicalWindowQuery.data?.rows.length) {
      const windowRows = canonicalRowsForPageFromWindow(canonicalWindowQuery.data, requestedStartIndex, expectedCurrentRows);
      if (windowRows.length >= Math.min(expectedCurrentRows, pageSize)) {
        return windowRows;
      }
    }

    const uniqueRows = [...baseUniqueRows];
    if (sourceSlug || hasActiveFilters) {
      return !sourceSlug && hasActiveFilters && filteredCanonicalRanksQuery.data
        ? canonicalizeRowsFromWindows(uniqueRows, filteredCanonicalRanksQuery.data)
        : uniqueRows;
    }
    const firstRankOnPage = requestedStartIndex + 1;
    return uniqueRows.slice(0, expectedCurrentRows).map((player, index) => ({
      ...player,
      rank: firstRankOnPage + index,
    }));
  }, [baseUniqueRows, canonicalWindowQuery.data, expectedCurrentRows, filteredCanonicalRanksQuery.data, hasActiveFilters, pageSize, requestedStartIndex, shouldUsePagePositionRanks, sourceSlug]);
  const reportedTotalPages = data?.totalPages ?? summaryData?.totalPages;
  const reportedTotalRows = data?.totalRows ?? summaryData?.totalRows;
  const totalPages = Math.max(1, reportedTotalPages ?? knownTotals.totalPages ?? page);
  const totalRows = reportedTotalRows ?? knownTotals.totalRows ?? rankingRows.length;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const summaryPublicSources = summaryData?.publicSources;
  const fetchedPublicSources = sourcesQuery.data;
  const publicSources = useMemo(
    () => sourceSlug ? summaryPublicSources ?? [] : fetchedPublicSources ?? summaryPublicSources ?? [],
    [fetchedPublicSources, sourceSlug, summaryPublicSources],
  );
  const goToPage = (nextPage: number) => setPage(nextPage);
  const title = !sourceSlug
    ? displayLeaderboardCopy(siteContent.data?.content["leaderboard.mainTitle"] || summaryData?.title || "Single Players")
    : displayLeaderboardCopy(summaryData?.title ?? "Single Players");
  const description = !sourceSlug
    ? displayLeaderboardCopy(siteContent.data?.content["leaderboard.mainDescription"] || summaryData?.description || "Ranking of individuals who have dug more blocks across all instances!")
    : displayLeaderboardCopy(summaryData?.description ?? "Ranking of individuals who have dug more blocks across all instances!");
  const topMiner = summaryData?.featuredRows?.[0]?.username ?? "-";
  const isServerDigsSource = Boolean(sourceSlug && summaryData?.source && shouldShowInPrivateServerDigs(summaryData.source));
  const isPlayerDigs = !sourceSlug;
  const brightLeaderboardTextClass = "text-[#CCCCCC]";
  const useBrightRankingMeta = isPlayerDigs || isServerDigsSource;
  const shouldSplitRankingColumns = rankingRows.length > 1;
  const rankingColumnRows = Math.max(1, Math.ceil(rankingRows.length / 2));
  const rankingGridStyle = {
    "--ranking-column-rows": String(rankingColumnRows),
  } as CSSProperties;

  useEffect(() => {
    if (reportedTotalPages === undefined && reportedTotalRows === undefined) {
      return;
    }

    const nextTotals = {
      totalPages: Math.max(1, reportedTotalPages ?? knownTotals.totalPages),
      totalRows: reportedTotalRows ?? knownTotals.totalRows,
    };
    setKnownTotals((previous) =>
      previous.totalPages === nextTotals.totalPages && previous.totalRows === nextTotals.totalRows
        ? previous
        : nextTotals,
    );
  }, [knownTotals.totalPages, knownTotals.totalRows, reportedTotalPages, reportedTotalRows]);

  useEffect(() => {
    if (data?.totalPages !== undefined && page > data.totalPages) {
      setPage(data.totalPages, true);
    }
  }, [data?.totalPages, page, setPage]);

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      <main className="container py-6 md:py-8 space-y-6">
        <SourceTabs publicSources={publicSources} activeSourceSlug={sourceSlug} currentSource={summaryData?.source ?? null} />
        

        <section className="pixel-card mmm-grid-header border border-border p-6 md:p-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10 animate-fade-in">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary">
                {!sourceSlug ? (
                  <img src={PLAYER_DIGS_ICON_URL} alt="Player Digs icon" className="h-[20.5px] w-[20.5px] shrink-0 object-contain" />
                ) : summaryData?.source?.logoUrl ? (
                  <img src={summaryData.source.logoUrl} alt={`${summaryData.source.displayName} logo`} className="h-[20.25px] w-[20.25px] object-contain" />
                ) : (
                  <Search className="w-3.5 h-3.5" strokeWidth={2.5} />
                )}
                <span className="font-pixel text-[9px]">{(sourceSlug ? "SOURCE" : "PLAYER DIGS").toUpperCase()}</span>
              </div>
              <h1 className="font-pixel text-3xl md:text-5xl text-foreground leading-tight">
                <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 align-bottom">
                  <span className="min-w-0 truncate whitespace-nowrap">{title}</span>
                  {summaryData?.source?.isDead ? (
                    <span
                      className="shrink-0 text-[0.92em] leading-none"
                      role="img"
                      aria-label={`${title} is dead`}
                      title="Dead server"
                    >
                      💀
                    </span>
                  ) : null}
                </span>
                <span className="text-primary animate-blink">_</span>
              </h1>
              <p className="font-display max-w-2xl text-2xl leading-tight text-muted-foreground">
                {description}
              </p>
            </div>

            <TopStatsRow
              topMiner={topMiner}
              players={summaryData?.totalRows ?? summaryData?.playerCount ?? 0}
              totalBlocks={summaryData?.totalBlocks ?? 0}
              labelClassName={isPlayerDigs ? brightLeaderboardTextClass : undefined}
            />
          </div>

          <TopMinersPodium rows={summaryData?.featuredRows ?? []} />
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
            totalItems={totalRows}
            itemLabel={totalRows === 1 ? "Player" : "Players"}
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

          {leaderboardQuery.error ? (
            <div className="py-16 text-center font-pixel text-[10px] text-muted-foreground border border-dashed border-border">
              {sourceSlug ? "SOURCE NOT FOUND" : "LEADERBOARD UNAVAILABLE"}
            </div>
          ) : leaderboardQuery.isLoading || !currentData || isResolvingCanonicalPage || isResolvingFilteredRanks ? (
            <SkeletonLeaderboardRows count={pageSize} />
          ) : rankingRows.length === 0 ? (
            <div className="py-16 text-center font-pixel text-[10px] text-muted-foreground border border-dashed border-border">
              NO PLAYERS FOUND
            </div>
          ) : (
            <div
              className={cn(
                "grid grid-cols-1 gap-3 lg:grid-cols-2",
                shouldSplitRankingColumns && "lg:[grid-auto-flow:column] lg:[grid-template-rows:repeat(var(--ranking-column-rows),minmax(0,auto))]",
              )}
              style={rankingGridStyle}
            >
              {rankingRows.map((player, index) => {
                const isLinkedPlayer = linkedPlayerName !== "" && normalizePlayerName(player.username) === linkedPlayerName;

                return (
                  <PlayerRankingCard
                    key={leaderboardRowKey(player, page, index)}
                    player={player}
                    highlighted={isLinkedPlayer}
                    brightMetaText={useBrightRankingMeta}
                    subscriberRole={subscriberRoles?.[player.username.toLowerCase()]}
                  />
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

function PlayerRankingCard({
  player,
  highlighted = false,
  className = "",
  brightMetaText = false,
  subscriberRole,
}: {
  player: LeaderboardRowSummary;
  highlighted?: boolean;
  className?: string;
  brightMetaText?: boolean;
  subscriberRole?: string | null;
}) {
  const top3 = player.rank <= 3;
  const detailTextClass = brightMetaText ? "text-[#CCCCCC]" : "text-muted-foreground";
  const usernameClass = subscriberRoleClass(subscriberRole as "supporter" | "supporter_plus" | null | undefined);
  const rowClassName = `group flex items-center gap-4 px-4 py-3.5 border transition-all text-left ${
    highlighted
      ? "bg-primary/20 border-primary/70 shadow-[0_0_34px_-22px_hsl(var(--primary)/0.95)] hover:bg-primary/25 hover:border-primary"
      : "bg-card border-border hover:border-primary/40 hover:bg-card/80"
  } ${className}`;

  return (
    <Link
      to={`/player/${encodeURIComponent(player.username.toLowerCase())}`}
      className={rowClassName}
    >
      <RankBadge rank={player.rank} highlighted={top3} />

      <div className="shrink-0">
        <div className="w-10 h-10 grid place-items-center bg-secondary border border-border overflow-hidden">
          <PlayerAvatar username={player.username} uuid={player.playerId} skinFaceUrl={player.skinFaceUrl} render="bust" className="w-full h-full border-0 bg-transparent" fallbackClassName="text-[10px]" />
        </div>
      </div>

      <div className="flex-1 min-w-0 self-stretch flex flex-col justify-center">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className={`font-pixel text-xs leading-[1.35] break-words [overflow-wrap:anywhere] ${usernameClass || "text-foreground"}`}>{player.username}</div>
          {getPlayerBadges(player.username).map((b) => (
            <img key={b.src} src={b.src} alt={b.label} title={b.label} className="h-9 w-9 object-contain shrink-0" />
          ))}
        </div>
        <div className={cn("font-pixel text-[8px] leading-[1.45] mt-1", detailTextClass)}>
          {formatTimeAgo(player.lastUpdated)} • {player.sourceCount} {player.sourceCount === 1 ? "place" : "places"} tracked
        </div>
      </div>

      <div className="min-w-[8.5rem] text-right shrink-0">
        <BlocksMinedValue as="div" value={player.blocksMined} className="font-pixel text-xs leading-[1.3]">
          {player.blocksMined.toLocaleString()}
        </BlocksMinedValue>
        <div className={cn("font-pixel text-[8px] mt-1 tracking-widest", detailTextClass)}>BLOCKS MINED</div>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
    </Link>
  );
}
