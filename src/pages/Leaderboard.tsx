import { useState } from "react";
import { motion } from "framer-motion";
import { Crown, Sparkles, Trophy, Users } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { LeaderboardControls } from "@/components/leaderboard/LeaderboardControls";
import { LeaderboardEmptyState } from "@/components/leaderboard/LeaderboardEmptyState";
import { LeaderboardGrid } from "@/components/leaderboard/LeaderboardGrid";
import { LeaderboardLoadingState } from "@/components/leaderboard/LeaderboardLoadingState";
import { TopMinersPodium } from "@/components/leaderboard/TopMinersPodium";
import { useAeternumLeaderboard } from "@/hooks/use-aeternum-leaderboard";

export default function Leaderboard() {
  const { data, isLoading } = useAeternumLeaderboard();
  const [query, setQuery] = useState("");
  const [minBlocks, setMinBlocks] = useState("0");

  const rows = data?.rows ?? [];
  const podiumRows = rows.slice(0, 3);
  const minimumBlocks = Number(minBlocks) || 0;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    const matchesQuery = normalizedQuery === "" || row.username.toLowerCase().includes(normalizedQuery);
    const matchesBlocks = row.blocksMined >= minimumBlocks;
    return matchesQuery && matchesBlocks;
  });
  const hasFilters = normalizedQuery !== "" || minimumBlocks > 0;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DashboardLayout>
        <div className="mx-auto max-w-7xl space-y-8">
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.18),transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.88))] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.35)] md:p-8"
          >
            <div className="absolute inset-0 grid-pattern opacity-20" />
            <div className="absolute -right-16 top-8 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />

            <div className="relative flex flex-col gap-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Live Aeternum Sync
                  </div>
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Aeternum Leaderboard</h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                      Real leaderboard rows captured from the client-readable Aeternum digs scoreboard and synced into the AeTweaks website in real time.
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
                    <div className="mt-1 text-sm text-muted-foreground">{podiumRows[0]?.blocksMined.toLocaleString() ?? "0"} digs</div>
                  </GlassCard>

                  <GlassCard className="min-w-[170px] rounded-[24px] border-white/10 bg-black/20 p-4">
                    <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/45">
                      <Users className="h-4 w-4 text-primary" />
                      Synced Players
                    </div>
                    <div className="text-xl font-semibold text-foreground">{(data?.playerCount ?? rows.length).toLocaleString()}</div>
                    <div className="mt-1 text-sm text-muted-foreground">All detected leaderboard entries</div>
                  </GlassCard>

                  <GlassCard className="min-w-[170px] rounded-[24px] border-white/10 bg-black/20 p-4">
                    <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/45">
                      <Trophy className="h-4 w-4 text-primary" />
                      Total Digs
                    </div>
                    <div className="text-xl font-semibold text-foreground">{(data?.totalDigs ?? 0).toLocaleString()}</div>
                    <div className="mt-1 text-sm text-muted-foreground">Combined synced Aeternum digs</div>
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
                  Search, filter, and browse every synced Aeternum miner captured from the live leaderboard feed.
                </p>
              </div>
            </div>

            <LeaderboardControls
              query={query}
              minBlocks={minBlocks}
              playerCount={filteredRows.length}
              onQueryChange={setQuery}
              onMinBlocksChange={setMinBlocks}
              onClear={() => {
                setQuery("");
                setMinBlocks("0");
              }}
            />

            {isLoading ? (
              <LeaderboardLoadingState />
            ) : filteredRows.length === 0 ? (
              <LeaderboardEmptyState hasFilters={hasFilters} />
            ) : (
              <LeaderboardGrid rows={filteredRows} highlightedPlayer={data?.highlightedPlayer} />
            )}
          </section>
        </div>
      </DashboardLayout>
    </div>
  );
}
