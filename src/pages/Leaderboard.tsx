import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Crown, Network, Sparkles, Trophy, Users } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { LeaderboardControls } from "@/components/leaderboard/LeaderboardControls";
import { LeaderboardEmptyState } from "@/components/leaderboard/LeaderboardEmptyState";
import { LeaderboardGrid } from "@/components/leaderboard/LeaderboardGrid";
import { LeaderboardLoadingState } from "@/components/leaderboard/LeaderboardLoadingState";
import { TopMinersPodium } from "@/components/leaderboard/TopMinersPodium";
import { Button } from "@/components/ui/button";
import { useLeaderboard } from "@/hooks/use-leaderboard";

function PodiumIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 20V12h5v8" />
      <path d="M10 20V8h5v12" />
      <path d="M16 20V14h4v6" />
      <path d="M3 20h18" />
    </svg>
  );
}

export default function Leaderboard() {
  const [selectedView, setSelectedView] = useState("global");
  const [query, setQuery] = useState("");
  const [minBlocks, setMinBlocks] = useState("0");
  const [page, setPage] = useState(1);
  const minimumBlocks = Number(minBlocks) || 0;
  const { data, isLoading, error } = useLeaderboard({
    view: selectedView,
    page,
    pageSize: 30,
    query,
    minBlocks: minimumBlocks,
  });

  const rows = data?.rows ?? [];
  const podiumRows = data?.featuredRows ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const hasFilters = normalizedQuery !== "" || minimumBlocks > 0;
  const currentView = data?.views.find((view) => view.key === data.selectedView) ?? data?.views[0] ?? null;

  useEffect(() => {
    setPage(1);
  }, [selectedView, normalizedQuery, minimumBlocks]);

  useEffect(() => {
    if (!data) return;
    setSelectedView(data.selectedView);
    if (page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data, page]);

  const isGlobal = data?.selectedViewKind === "global";
  if (error) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DashboardLayout>
        <div className="mx-auto max-w-4xl p-8 text-red-400">
          <h1 className="text-2xl font-semibold">Leaderboard failed to load</h1>
          <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm">
            {error instanceof Error ? error.message : String(error)}
          </pre>
        </div>
      </DashboardLayout>
    </div>
  );
  }
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DashboardLayout>
        <div className="mx-auto max-w-7xl space-y-8">
          <section className="rounded-[28px] border border-white/8 bg-black/10 p-3 backdrop-blur-xl">
            <div className="flex flex-wrap gap-2">
              {(data?.views ?? [{ key: "global", label: "Main Leaderboard", description: "Totals across every approved server and world.", kind: "global", playerCount: 0, totalBlocks: 0 }]).map((view) => {
                const active = (data?.selectedView ?? selectedView) === view.key;
                return (
                  <Button
                    key={view.key}
                    variant={active ? "secondary" : "ghost"}
                    onClick={() => setSelectedView(view.key)}
                    className={`h-auto rounded-2xl border px-4 py-3 text-left ${active ? "border-primary/30 bg-primary/10 text-foreground" : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"}`}
                  >
                    <div className="flex items-center gap-2">
                      {view.kind === "global" ? <PodiumIcon className="h-4 w-4" /> : <Network className="h-4 w-4" />}
                      <span className="text-sm font-semibold">{view.label}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{view.playerCount.toLocaleString()} players</div>
                  </Button>
                );
              })}
            </div>
            <div className="mt-3 px-1 text-sm text-muted-foreground">
              {currentView?.description ?? "Totals across every approved server and world."}
            </div>
          </section>

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
                    Unified Mining Rankings
                  </div>
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                      {data?.selectedViewLabel ?? "Main Leaderboard"}
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                      {data?.selectedViewDescription ?? "Totals across every approved server and world."}
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
                    <div className="mt-1 text-sm text-muted-foreground">{podiumRows[0]?.blocksMined.toLocaleString() ?? "0"} blocks mined</div>
                  </GlassCard>

                  <GlassCard className="min-w-[170px] rounded-[24px] border-white/10 bg-black/20 p-4">
                    <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/45">
                      <Users className="h-4 w-4 text-primary" />
                      Ranked Players
                    </div>
                    <div className="text-xl font-semibold text-foreground">{(data?.playerCount ?? rows.length).toLocaleString()}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {isGlobal ? "Across every approved place" : "Focused on this leaderboard"}
                    </div>
                  </GlassCard>

                  <GlassCard className="min-w-[170px] rounded-[24px] border-white/10 bg-black/20 p-4">
                    <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/45">
                      <Trophy className="h-4 w-4 text-primary" />
                      Total Blocks
                    </div>
                    <div className="text-xl font-semibold text-foreground">
                      {data?.totalBlocks != null ? data.totalBlocks.toLocaleString() : "—"}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {isGlobal ? "Across approved servers and worlds" : "Total blocks for this leaderboard"}
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
                  Main Leaderboard tracks totals across every approved server and world. Each server or world tab stays focused on its own totals.
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
                setMinBlocks("0");
              }}
            />

            {isLoading ? (
              <LeaderboardLoadingState />
            ) : rows.length === 0 ? (
              <LeaderboardEmptyState hasFilters={hasFilters} viewLabel={data?.selectedViewLabel ?? "this leaderboard"} />
            ) : (
              <>
                <LeaderboardGrid rows={rows} highlightedPlayer={data?.highlightedPlayer} />
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
