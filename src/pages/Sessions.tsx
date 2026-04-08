import { motion } from "framer-motion";
import { Timer, Pickaxe, TrendingUp, Calendar } from "lucide-react";
import { AuthRequiredState } from "@/components/AuthRequiredState";
import { Navbar } from "@/components/Navbar";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { useAeTweaksSnapshot } from "@/hooks/use-aetweaks-snapshot";
import { useCurrentUser } from "@/hooks/use-current-user";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export default function Sessions() {
  const { data: viewer, isLoading: isAuthLoading } = useCurrentUser();
  const isAuthenticated = Boolean(viewer);
  const { data, isLoading } = useAeTweaksSnapshot(isAuthenticated);

  const totalBlocks = data?.sessions.reduce((sum, session) => sum + session.totalBlocks, 0) ?? 0;
  const totalSeconds = data?.sessions.reduce((sum, session) => sum + session.activeSeconds, 0) ?? 0;
  const averageRate = data?.sessions.length
    ? Math.round(data.sessions.reduce((sum, session) => sum + session.averageBph, 0) / data.sessions.length)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DashboardLayout>
        <div className="mx-auto max-w-5xl">
          {isAuthLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
              <GlassCard className="w-full max-w-xl p-8 text-center">
                <p className="text-sm text-muted-foreground">Checking your secure session...</p>
              </GlassCard>
            </motion.div>
          )}

          {!isAuthLoading && !isAuthenticated && (
            <AuthRequiredState
              title="You're not logged in"
              subtitle="Log in to view your sessions and mining history."
            />
          )}

          {!isAuthLoading && isAuthenticated && (
            <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Session History</h1>
              <p className="text-sm text-muted-foreground">Browse synced mining sessions and long-term performance data.</p>
            </div>
            {data && <SyncStatusBanner meta={data.meta} compact />}
          </motion.div>

          {isLoading && (
            <GlassCard className="mb-6 p-4">
              <p className="text-sm text-muted-foreground">Loading session history...</p>
            </GlassCard>
          )}

          {!!data && (
            <>
              <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                  { label: "Total Sessions", value: String(data.player?.totalSessions ?? data.sessions.length), icon: Timer },
                  { label: "Total Time", value: formatDuration(data.player?.totalPlaySeconds ?? totalSeconds), icon: Calendar },
                  { label: "Avg Blocks/Session", value: data.sessions.length ? Math.round(totalBlocks / data.sessions.length).toLocaleString() : "0", icon: Pickaxe },
                  { label: "Avg Rate", value: `${averageRate.toLocaleString()}/hr`, icon: TrendingUp },
                ].map((stat) => (
                  <GlassCard key={stat.label} className="p-4">
                    <stat.icon className="mb-2 h-4 w-4 text-primary/60" />
                    <div className="text-xl font-bold text-foreground">{stat.value}</div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                  </GlassCard>
                ))}
              </div>

              <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
                {data.sessions.length === 0 && (
                  <GlassCard className="p-5">
                    <p className="text-sm text-muted-foreground">No sessions have synced for this linked account yet.</p>
                  </GlassCard>
                )}
                {data.sessions.map((session) => (
                  <motion.div key={session.id} variants={fadeUp}>
                    <GlassCard className="p-4 transition-all duration-200 hover:glow-border">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                            <Timer className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {new Date(session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} at{" "}
                              {new Date(session.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {session.status} • {formatDuration(session.activeSeconds)} • {session.topBlock ?? "No top block"}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-6 text-right">
                          <div>
                            <div className="text-sm font-semibold text-foreground">{session.totalBlocks.toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground">blocks</div>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-foreground">{session.averageBph.toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground">per hour</div>
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  </motion.div>
                ))}
              </motion.div>
            </>
          )}
            </>
          )}
        </div>
      </DashboardLayout>
    </div>
  );
}
