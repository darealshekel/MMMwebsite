import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Crown, Sparkles, Trophy, Users } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { LeaderboardControls } from "@/components/leaderboard/LeaderboardControls";
import { LeaderboardEmptyState } from "@/components/leaderboard/LeaderboardEmptyState";
import { LeaderboardLoadingState } from "@/components/leaderboard/LeaderboardLoadingState";
import { MainLeaderboardTable } from "@/components/leaderboard/MainLeaderboardTable";
import { SourceLeaderboardTable } from "@/components/leaderboard/SourceLeaderboardTable";
import { SourceTabs } from "@/components/leaderboard/SourceTabs";
import { TopMinersPodium } from "@/components/leaderboard/TopMinersPodium";
import { Button } from "@/components/ui/button";
import { useLeaderboard } from "@/hooks/use-leaderboard";

export function LeaderboardScreen({ sourceSlug = null }: { sourceSlug?: string | null }) {
  const [query, setQuery] = useState("");
  const [minBlocks, setMinBlocks] = useState("1000000");
  const [page, setPage] = useState(1);
  const minimumBlocks = Number(minBlocks) || 0;

  const { data, isLoading, error } = useLeaderboard({
    sourceSlug,
    page,
    pageSize: 30,
    query,
    minBlocks: minimumBlocks,
  });

  useEffect(() => {
    setPage(1);
  }, [sourceSlug, query, minimumBlocks]);

  useEffect(() => {
    if (!data) return;
    if (page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data, page]);

  const rows = data?.rows ?? [];
  const podiumRows = data?.featuredRows ?? [];
  const hasFilters = query.trim() !== "" || minimumBlocks > 1_000_000;
  const isSourcePage = data?.scope === "source" || Boolean(sourceSlug);
  const description = data?.description ?? (isSourcePage ? "Source-specific leaderboard." : "Combined totals across all approved sources.");
  const rankedPlayersLabel = error ? "—" : (data?.playerCount ?? rows.length).toLocaleString();

  const totalBlocksLabel = useMemo(() => {
    if (data?.totalBlocks == null) return "—";
    return data.totalBlocks.toLocaleString();
  }, [data?.totalBlocks]);

  useEffect(() => {
    if (!data) return;
    console.info("[leaderboard] selected mode=" + data.scope);
    console.info("[leaderboard] selected source slug=" + (sourceSlug ?? "main"));
    console.info("[leaderboard] source rows returned=" + (data.rows?.length ?? 0));
    console.info("[leaderboard] source top miner=" + (data.featuredRows?.[0]?.username ?? ""));
    console.info("[leaderboard] source total blocks=" + (data.totalBlocks ?? 0));
    console.info("[leaderboard] source ranked players=" + (data.playerCount ?? 0));
    console.info("[leaderboard] source podium size=" + (data.featuredRows?.length ?? 0));
  }, [data, sourceSlug]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DashboardLayout>
        <div className="mx-auto max-w-7xl space-y-8">
          <SourceTabs publicSources={data?.publicSources ?? []} activeSourceSlug={sourceSlug} />

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(90,106,154,0.22),transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(7,12,24,0.9))] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.35)] md:p-8"
          >
            <div className="absolute inset-0 grid-pattern opacity-20" />
            <div className="absolute -right-16 top-8 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />

            <div className="relative flex flex-col gap-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    {isSourcePage ? "Source Leaderboard" : "Global Ranking"}
                  </div>
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                      {data?.title ?? (isSourcePage ? "Source Leaderboard" : "Main Leaderboard")}
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                      {description}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <GlassCard className="min-w-[170px] rounded-[24px] border-white/10 bg-black/20 p-4">
                    <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/45">
                      <Crown className="h-4 w-4 text-amber-300" />
                      Top Miner
                    </div>
                    <div className="text-xl font-semibold text-foreground">{podiumRows[0]?.username ?? "Waiting..."}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{podiumRows[0]?.blocksMined.toLocaleString() ?? "0"} Blocks Mined</div>
                  </GlassCard>

                  <GlassCard className="min-w-[170px] rounded-[24px] border-white/10 bg-black/20 p-4">
                    <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/45">
                      <Users className="h-4 w-4 text-primary" />
                      Ranked Players
                    </div>
                    <div className="text-xl font-semibold text-foreground">{rankedPlayersLabel}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {isSourcePage ? "Only this source is shown" : "Combined approved-source totals"}
                    </div>
                  </GlassCard>

                  <GlassCard className="min-w-[170px] rounded-[24px] border-white/10 bg-black/20 p-4">
                    <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/45">
                      <Trophy className="h-4 w-4 text-primary" />
                      Blocks Mined
                    </div>
                    <div className="text-xl font-semibold text-foreground">{totalBlocksLabel}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {isSourcePage ? "This source only" : "Main combined leaderboard total"}
                    </div>
                  </GlassCard>
                </div>
              </div>

              <TopMinersPodium rows={podiumRows} />
            </div>
          </motion.section>

          <section className="space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Player Rankings</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isSourcePage
                    ? "This leaderboard shows blocks mined on this source only."
                    : "Main Leaderboard combines each player across approved sources only."}
                </p>
              </div>
            </div>

            <LeaderboardControls
              query={query}
              minBlocks={minBlocks}
              resultCount={data?.totalRows ?? rows.length}
              totalCount={data?.playerCount ?? rows.length}
              onQueryChange={setQuery}
              onMinBlocksChange={setMinBlocks}
              onClear={() => {
                setQuery("");
                setMinBlocks("1000000");
              }}
            />

            {error ? (
              <div className="glass-panel rounded-[24px] border border-white/10 p-6 text-sm text-muted-foreground">
                {sourceSlug ? "This source is not public or does not exist." : "Unable to load the leaderboard right now."}
              </div>
            ) : isLoading ? (
              <LeaderboardLoadingState />
            ) : rows.length === 0 ? (
              <LeaderboardEmptyState hasFilters={hasFilters} viewLabel={data?.title ?? "this leaderboard"} />
            ) : (
              <>
                {isSourcePage ? (
                  <SourceLeaderboardTable rows={rows} highlightedPlayer={data?.highlightedPlayer} />
                ) : (
                  <MainLeaderboardTable rows={rows} highlightedPlayer={data?.highlightedPlayer} />
                )}
                {(data?.totalPages ?? 1) > 1 ? (
                  <div className="flex items-center justify-between rounded-[24px] border border-white/8 bg-black/10 px-4 py-3 text-sm text-muted-foreground">
                    <div>
                      Page <span className="font-semibold text-foreground">{data?.page ?? 1}</span> of{" "}
                      <span className="font-semibold text-foreground">{data?.totalPages ?? 1}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="rounded-2xl border-white/10 bg-card/60"
                        disabled={(data?.page ?? 1) <= 1}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-2xl border-white/10 bg-card/60"
                        disabled={(data?.page ?? 1) >= (data?.totalPages ?? 1)}
                        onClick={() => setPage((current) => Math.min(data?.totalPages ?? current, current + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      </DashboardLayout>
    </div>
  );
}
