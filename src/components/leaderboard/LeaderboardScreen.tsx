import { Search, SlidersHorizontal, X, ChevronRight } from "lucide-react";
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
import { useSiteContent } from "@/hooks/use-site-content";
import { DEFAULT_LEADERBOARD_PAGE_SIZE, normalizeLeaderboardPageSize } from "@/lib/leaderboard-page-size";
import { fetchLeaderboardSummary, fetchPublicSources } from "@/lib/leaderboard-repository";
import type { LeaderboardRowSummary, PublicSourceSummary } from "@/lib/types";

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
  return String(value ?? "").trim().toLowerCase();
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

function normalizeSourceLookupKey(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
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
  const linkedPlayerQuery = useQuery({
    queryKey: ["leaderboard-linked-player", sourceSlug ?? "main", linkedPlayerName],
    queryFn: () => fetchLeaderboardSummary({
      source: sourceSlug ?? undefined,
      page: 1,
      pageSize: 1,
      query: linkedPlayerName,
    }),
    enabled: linkedPlayerName !== "",
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
  const filtered = data?.rows ?? [];
  const reportedTotalPages = data?.totalPages ?? summaryData?.totalPages;
  const reportedTotalRows = data?.totalRows ?? summaryData?.totalRows;
  const totalPages = Math.max(1, reportedTotalPages ?? knownTotals.totalPages ?? page);
  const totalRows = reportedTotalRows ?? knownTotals.totalRows ?? filtered.length;
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
  const linkedPlayerRow = linkedPlayerQuery.data?.rows.find((row) => normalizePlayerName(row.username) === linkedPlayerName) ?? null;
  const linkedPlayerVisible = linkedPlayerName !== "" && filtered.some((player) => normalizePlayerName(player.username) === linkedPlayerName);
  const showLinkedPlayerRow = Boolean(linkedPlayerRow && !linkedPlayerVisible);
  const sourceStatsByLookupKey = useMemo(() => {
    const map = new Map<string, PublicSourceSummary>();
    const addSource = (source: PublicSourceSummary | null | undefined) => {
      if (!source) return;
      const candidates = [
        source.slug ? `slug:${source.slug}` : "",
        source.id ? `id:${source.id}` : "",
        source.displayName ? `name:${source.displayName}` : "",
      ];
      for (const candidate of candidates) {
        const key = normalizeSourceLookupKey(candidate);
        if (key && !map.has(key)) {
          map.set(key, source);
        }
      }
    };

    for (const source of publicSources) {
      addSource(source);
    }
    addSource(summaryData?.source ?? null);
    return map;
  }, [publicSources, summaryData?.source]);
  const getSourceStatsForRow = useCallback((row: LeaderboardRowSummary) => {
    return sourceStatsByLookupKey.get(normalizeSourceLookupKey(row.sourceSlug ? `slug:${row.sourceSlug}` : ""))
      ?? sourceStatsByLookupKey.get(normalizeSourceLookupKey(row.sourceId ? `id:${row.sourceId}` : ""))
      ?? sourceStatsByLookupKey.get(normalizeSourceLookupKey(row.sourceServer ? `name:${row.sourceServer}` : ""))
      ?? null;
  }, [sourceStatsByLookupKey]);

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
        

        <section className="pixel-card border border-border p-6 md:p-8 grid-bg">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10 animate-fade-in">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary">
                {summaryData?.source?.logoUrl ? (
                  <img src={summaryData.source.logoUrl} alt={`${summaryData.source.displayName} logo`} className="h-4 w-4 object-contain" />
                ) : (
                  <Search className="w-3.5 h-3.5" strokeWidth={2.5} />
                )}
                <span className="font-pixel text-[9px]">{(sourceSlug ? "SOURCE" : "SINGLE PLAYERS").toUpperCase()}</span>
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
              <p className="font-display text-2xl text-muted-foreground max-w-md leading-tight">
                {description}
              </p>
            </div>

            <TopStatsRow
              topMiner={topMiner}
              players={summaryData?.totalRows ?? summaryData?.playerCount ?? 0}
              totalBlocks={summaryData?.totalBlocks ?? 0}
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
          ) : leaderboardQuery.isLoading || !currentData ? (
            <SkeletonLeaderboardRows count={pageSize} />
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center font-pixel text-[10px] text-muted-foreground border border-dashed border-border">
              NO PLAYERS FOUND
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {showLinkedPlayerRow && linkedPlayerRow ? (
                <PlayerRankingCard
                  key={`linked-${linkedPlayerRow.rowKey ?? linkedPlayerRow.username}`}
                  player={linkedPlayerRow}
                  sourceStats={getSourceStatsForRow(linkedPlayerRow)}
                  highlighted
                  className="lg:col-span-2"
                />
              ) : null}
              {filtered.map((player) => {
                const isLinkedPlayer = linkedPlayerName !== "" && normalizePlayerName(player.username) === linkedPlayerName;

                return (
                  <PlayerRankingCard
                    key={player.rowKey ?? player.username}
                    player={player}
                    sourceStats={getSourceStatsForRow(player)}
                    highlighted={isLinkedPlayer}
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
  sourceStats = null,
  highlighted = false,
  className = "",
}: {
  player: LeaderboardRowSummary;
  sourceStats?: PublicSourceSummary | null;
  highlighted?: boolean;
  className?: string;
}) {
  const top3 = player.rank <= 3;
  const sourceTotalBlocks = Number(sourceStats?.totalBlocks ?? player.sourceTotalBlocks ?? 0);
  const sourcePlayerCount = Number(sourceStats?.playerCount ?? player.sourcePlayerCount ?? 0);
  const sourceDisplayName = sourceStats?.displayName ?? player.sourceServer;
  const hasSourceTotals = Boolean(sourceStats) || player.sourceTotalBlocks !== undefined || player.sourcePlayerCount !== undefined;
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
          <PlayerAvatar username={player.username} skinFaceUrl={player.skinFaceUrl} className="w-full h-full border-0 bg-transparent" fallbackClassName="text-[10px]" />
        </div>
      </div>

      <div className="flex-1 min-w-0 self-stretch flex flex-col justify-center">
        <div className="font-pixel text-xs leading-[1.35] text-foreground break-words [overflow-wrap:anywhere]">{player.username}</div>
        <div className="font-pixel text-[8px] leading-[1.45] text-muted-foreground mt-1">
          {formatTimeAgo(player.lastUpdated)} • {player.sourceCount} {player.sourceCount === 1 ? "place" : "places"} tracked
        </div>
        {hasSourceTotals ? (
          <div className="mt-1 truncate font-pixel text-[8px] leading-[1.45] text-muted-foreground/85">
            {sourceDisplayName}: {sourcePlayerCount.toLocaleString()} {sourcePlayerCount === 1 ? "player" : "players"} • {sourceTotalBlocks.toLocaleString()} Blocks Mined
          </div>
        ) : null}
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
}
