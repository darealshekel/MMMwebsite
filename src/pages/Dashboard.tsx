import { motion } from "framer-motion";
import { Pickaxe, TrendingUp, Timer, Target, Bell, Trophy, ArrowUp, Clock, Zap } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { ProgressRing } from "@/components/ProgressRing";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { useAeTweaksSnapshot } from "@/hooks/use-aetweaks-snapshot";

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };

function formatDuration(seconds: number) {
  if (seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${Math.max(1, minutes)}m`;
}

function formatTimeAgo(value?: string | null) {
  if (!value) return "Just now";
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatEta(seconds: number | null) {
  if (!seconds || seconds <= 0) return "N/A";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function Dashboard() {
  const { data, isLoading } = useAeTweaksSnapshot();
  const requiresAuth = data?.meta.source === "auth_required";

  const quickStats = data
    ? [
        { label: "Total Blocks Mined", value: data.player?.totalSyncedBlocks ?? 0, icon: Pickaxe, change: data.player?.lastServerName ?? "Awaiting sync" },
        { label: "Avg Est. Blocks / Hour", value: data.estimatedBlocksPerHour, icon: TrendingUp, change: data.meta.source === "live" ? "Personal live estimate" : "Preview estimate" },
        { label: "Total Sessions", value: data.player?.totalSessions ?? 0, icon: Timer, change: `${formatDuration(data.player?.totalPlaySeconds ?? 0)} tracked` },
        { label: "Daily Goal", value: data.dailyGoal?.percent ?? 0, icon: Target, suffix: "%", change: data.dailyGoal ? `${data.dailyGoal.progress.toLocaleString()} / ${data.dailyGoal.target.toLocaleString()}` : "No daily goal synced" },
      ]
    : [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DashboardLayout>
        <div className="mx-auto max-w-6xl">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 space-y-4">
            <div>
              <h1 className="mb-1 text-2xl font-bold text-foreground">Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                {data?.viewer ? `Your control center for ${data.viewer.username}.` : "Link your Minecraft account to unlock your private AeTweaks dashboard."}
              </p>
            </div>
            {data && <SyncStatusBanner meta={data.meta} />}
          </motion.div>

          {isLoading && (
            <GlassCard className="mb-6 p-5">
              <p className="text-sm text-muted-foreground">Loading synced dashboard data...</p>
            </GlassCard>
          )}

          {!!data && (
            <>
              {requiresAuth && (
                <GlassCard glow="primary" className="mb-6 p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                      <h2 className="text-xl font-semibold text-foreground">Secure personal dashboard</h2>
                      <p className="max-w-2xl text-sm text-muted-foreground">
                        Sign in with Microsoft to link your Minecraft identity securely. After that, every dashboard card, session, and project is filtered on the server for your account only.
                      </p>
                    </div>
                    <a href="/login" className="shrink-0">
                      <motion.button whileHover={{ scale: 1.02 }} className="btn-glow rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                        Connect Minecraft Account
                      </motion.button>
                    </a>
                  </div>
                </GlassCard>
              )}

              {data.viewer && (
                <GlassCard className="mb-6 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <img src={data.viewer.avatarUrl} alt={data.viewer.username} className="h-14 w-14 rounded-2xl border border-primary/20" />
                      <div>
                        <div className="text-lg font-semibold text-foreground">{data.viewer.username}</div>
                        <div className="text-xs text-muted-foreground">
                          Linked via {data.viewer.provider} • Last synced {formatTimeAgo(data.lastSyncedAt)}
                        </div>
                      </div>
                    </div>
                    <div className="glass-panel rounded-xl px-4 py-3 text-right">
                      <div className="text-xs text-muted-foreground">Player-only data scope</div>
                      <div className="text-sm font-semibold text-foreground">UUID-linked secure view</div>
                    </div>
                  </div>
                </GlassCard>
              )}

              <motion.div variants={stagger} initial="hidden" animate="show" className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                {quickStats.map((s) => (
                  <motion.div key={s.label} variants={fadeUp}>
                    <GlassCard className="p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{s.label}</span>
                        <s.icon className="h-4 w-4 text-primary/60" />
                      </div>
                      <div className="text-2xl font-bold text-foreground">
                        <AnimatedCounter target={s.value} suffix={s.suffix || ""} />
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <ArrowUp className="h-3 w-3 text-glow-emerald" />
                        <span className="text-xs text-muted-foreground">{s.change}</span>
                      </div>
                    </GlassCard>
                  </motion.div>
                ))}
              </motion.div>

              <div className="mb-6 grid gap-4 lg:grid-cols-3">
                <GlassCard className="p-5 lg:col-span-2">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Active Projects</h3>
                    <span className="text-xs text-primary">{data.projects.filter((project) => project.isActive).length} active</span>
                  </div>
                  <div className="space-y-4">
                    {data.projects.length === 0 && <div className="glass-panel rounded-lg p-4 text-sm text-muted-foreground">No projects have synced yet.</div>}
                    {data.projects.slice(0, 4).map((project) => (
                      <div key={project.id} className="glass-panel rounded-lg p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">{project.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {project.goal ? `${project.progress.toLocaleString()} / ${project.goal.toLocaleString()}` : `${project.progress.toLocaleString()} blocks`}
                          </span>
                        </div>
                        <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                          <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${project.percent}%` }} transition={{ duration: 1, ease: "easeOut" }} />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{project.isActive ? "Active project" : project.status === "complete" ? "Completed" : "Synced project"}</span>
                          <span>{project.percent}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                <GlassCard className="flex flex-col items-center justify-center p-5">
                  <h3 className="mb-4 font-semibold text-foreground">Today's Progress</h3>
                  <ProgressRing progress={data.dailyGoal?.percent ?? 0} size={120} strokeWidth={8} label="Daily Goal" />
                  <div className="mt-4 text-center">
                    <div className="text-2xl font-bold text-foreground">{(data.dailyGoal?.progress ?? 0).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{data.dailyGoal ? `of ${data.dailyGoal.target.toLocaleString()} blocks` : "Waiting for goal sync"}</div>
                  </div>
                </GlassCard>
              </div>

              <div className="mb-6 grid gap-4 lg:grid-cols-2">
                <GlassCard className="p-5">
                  <h3 className="mb-4 font-semibold text-foreground">Recent Sessions</h3>
                  <div className="space-y-3">
                    {data.sessions.length === 0 && <div className="text-sm text-muted-foreground">No synced sessions yet.</div>}
                    {data.sessions.slice(0, 4).map((session) => (
                      <div key={session.id} className="flex items-center justify-between border-b border-border/30 py-2 last:border-0">
                        <div>
                          <span className="text-sm font-medium text-foreground">{new Date(session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{formatDuration(session.activeSeconds)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-medium text-foreground">{session.totalBlocks.toLocaleString()}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{session.averageBph.toLocaleString()}/hr</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                <GlassCard className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Notifications</h3>
                    <Bell className="h-4 w-4 text-primary/60" />
                  </div>
                  <div className="space-y-3">
                    {data.notifications.length === 0 && <div className="text-sm text-muted-foreground">No recent sync notifications yet.</div>}
                    {data.notifications.slice(0, 4).map((notification) => (
                      <div key={notification.id} className="flex items-start justify-between border-b border-border/30 py-2 last:border-0">
                        <div className="space-y-0.5">
                          <span className="text-sm text-foreground/90">{notification.title}</span>
                          {notification.body && <p className="text-xs text-muted-foreground">{notification.body}</p>}
                        </div>
                        <span className="ml-3 whitespace-nowrap text-xs text-muted-foreground">{formatTimeAgo(notification.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </div>

              <GlassCard glow="accent" className="p-5">
                <div className="mb-4 flex items-center gap-3">
                  <Trophy className="h-5 w-5 text-accent" />
                  <h3 className="font-semibold text-foreground">Leaderboard Preview</h3>
                </div>
                {data.leaderboard ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="glass-panel rounded-lg p-4">
                      <div className="text-xs text-muted-foreground">Rank</div>
                      <div className="mt-1 text-2xl font-bold text-primary">#{data.leaderboard.rankCached ?? "—"}</div>
                    </div>
                    <div className="glass-panel rounded-lg p-4">
                      <div className="text-xs text-muted-foreground">Score</div>
                      <div className="mt-1 text-2xl font-bold text-foreground">{data.leaderboard.score.toLocaleString()}</div>
                    </div>
                    <div className="glass-panel rounded-lg p-4">
                      <div className="text-xs text-muted-foreground">Updated</div>
                      <div className="mt-1 text-lg font-semibold text-foreground">{formatTimeAgo(data.leaderboard.updatedAt)}</div>
                    </div>
                  </div>
                ) : (
                  <div className="glass-panel rounded-lg p-4 text-sm text-muted-foreground">No leaderboard entry has been synced for this player yet.</div>
                )}
              </GlassCard>

              <GlassCard className="mt-6 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Sync Snapshot</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="glass-panel rounded-lg p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      Last seen
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{formatTimeAgo(data.player?.lastSeenAt)}</div>
                  </div>
                  <div className="glass-panel rounded-lg p-4">
                          <div className="text-xs text-muted-foreground">Estimated finish</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{formatEta(data.estimatedFinishSeconds)}</div>
                  </div>
                  <div className="glass-panel rounded-lg p-4">
                    <div className="text-xs text-muted-foreground">Tracked worlds</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{data.worlds.length}</div>
                  </div>
                </div>
              </GlassCard>
            </>
          )}
        </div>
      </DashboardLayout>
    </div>
  );
}
