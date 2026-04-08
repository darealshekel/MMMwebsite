import { motion } from "framer-motion";
import { Crown, Pickaxe, Timer, Trophy } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { useAeternumLeaderboard } from "@/hooks/use-aeternum-leaderboard";

function formatTimeAgo(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Leaderboard() {
  const { data = [], isLoading } = useAeternumLeaderboard();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DashboardLayout>
        <div className="mx-auto max-w-6xl">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6 space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Aeternum !!dugged Leaderboard</h1>
                <p className="text-sm text-muted-foreground">Live AeTweaks rankings for Aeternum-mined blocks and total synced mining volume.</p>
              </div>
            </div>
          </motion.div>

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <GlassCard className="p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Crown className="h-4 w-4 text-primary/70" />
                Top Aeternum score
              </div>
              <div className="text-2xl font-bold text-foreground">{data[0]?.aeternumBlocks.toLocaleString() ?? "0"}</div>
              <div className="text-xs text-muted-foreground">{data[0]?.username ?? "Waiting for sync"}</div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Pickaxe className="h-4 w-4 text-primary/70" />
                Players tracked
              </div>
              <div className="text-2xl font-bold text-foreground">{data.length.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Leaderboard rows with Aeternum activity</div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Timer className="h-4 w-4 text-primary/70" />
                Total Aeternum mined
              </div>
              <div className="text-2xl font-bold text-foreground">{data.reduce((sum, row) => sum + row.aeternumBlocks, 0).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Summed across all synced players</div>
            </GlassCard>
          </div>

          <GlassCard className="overflow-hidden p-0">
            <div className="border-b border-border/40 px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">Live rankings</h2>
              <p className="text-xs text-muted-foreground">Polling every few seconds so mined blocks rise live while players are active.</p>
            </div>

            {isLoading && <div className="px-5 py-6 text-sm text-muted-foreground">Loading leaderboard...</div>}

            {!isLoading && data.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No Aeternum mining rows have synced yet.
              </div>
            )}

            {!isLoading && data.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-card/50 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 text-left">Rank</th>
                      <th className="px-5 py-3 text-left">Player</th>
                      <th className="px-5 py-3 text-right">Aeternum</th>
                      <th className="px-5 py-3 text-right">Total</th>
                      <th className="px-5 py-3 text-right">Sessions</th>
                      <th className="px-5 py-3 text-right">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.playerId} className="border-t border-border/25 text-foreground/90">
                        <td className="px-5 py-4 font-semibold text-primary">#{row.rank}</td>
                        <td className="px-5 py-4 font-medium">{row.username}</td>
                        <td className="px-5 py-4 text-right font-semibold">{row.aeternumBlocks.toLocaleString()}</td>
                        <td className="px-5 py-4 text-right">{row.totalBlocks.toLocaleString()}</td>
                        <td className="px-5 py-4 text-right">{row.totalSessions.toLocaleString()}</td>
                        <td className="px-5 py-4 text-right text-muted-foreground">{formatTimeAgo(row.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>
      </DashboardLayout>
    </div>
  );
}
