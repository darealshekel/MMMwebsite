import { Search, SlidersHorizontal, X, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
import { fetchLeaderboardSummary, fetchPublicSources } from "@/lib/leaderboard-repository";
import type { LeaderboardRowSummary } from "@/lib/types";

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

export function LeaderboardScreen({ sourceSlug = null }: { sourceSlug?: string | null }) {
  const [query, setQuery] = useState("");
  const [minBlocks, setMinBlocks] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
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

  useEffect(() => {
    setPage(1);
  }, [sourceSlug, query, minBlocks, pageSize]);

  const hasActiveFilters = Boolean(query.trim()) || minBlocks > 0;
  const summaryData = summaryQuery.data ?? (!hasActiveFilters ? leaderboardQuery.data : undefined);
  const publicSources = sourceSlug ? summaryData?.publicSources ?? [] : sourcesQuery.data ?? summaryData?.publicSources ?? [];
  const data = leaderboardQuery.data;
  const filtered = data?.rows ?? [];
  const totalPages = Math.max(1, data?.totalPages ?? summaryData?.totalPages ?? 1);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const goToPage = (nextPage: number) => setPage(Math.min(Math.max(1, nextPage), totalPages));
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

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

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
            totalItems={data?.totalRows ?? filtered.length}
            itemLabel={(data?.totalRows ?? filtered.length) === 1 ? "Player" : "Players"}
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
                  onClick={() => {
                    setQuery("");
                    setMinBlocks(0);
                  }}
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
          ) : leaderboardQuery.isLoading ? (
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
  highlighted = false,
  className = "",
}: {
  player: LeaderboardRowSummary;
  highlighted?: boolean;
  className?: string;
}) {
  const top3 = player.rank <= 3;
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
