import { motion } from "framer-motion";
import { Pickaxe, TrendingUp, Timer, Target, Bell, Trophy, ArrowUp, Clock, Zap, ShieldCheck, CircleCheckBig, XCircle } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthRequiredState } from "@/components/AuthRequiredState";
import { GlassCard } from "@/components/GlassCard";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { ProgressRing } from "@/components/ProgressRing";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { useAeTweaksSnapshot } from "@/hooks/use-aetweaks-snapshot";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSourceApprovals } from "@/hooks/use-source-approvals";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isQualifyingCompletedSession } from "../../shared/session-filters";

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
  const { data: viewer, isLoading: isAuthLoading } = useCurrentUser();
  const isAuthenticated = Boolean(viewer);
  const { data, isLoading } = useAeTweaksSnapshot(isAuthenticated);
  const canManageSources = Boolean(viewer && (viewer.role === "owner" || viewer.isAdmin));
  const sourceApprovals = useSourceApprovals(isAuthenticated && canManageSources);
  const recentSessions = data?.sessions.filter((session) => isQualifyingCompletedSession(session)) ?? [];

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
          {isAuthLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
              <GlassCard className="w-full max-w-xl p-8 text-center">
                <p className="text-sm text-muted-foreground">Checking your secure session...</p>
              </GlassCard>
            </motion.div>
          )}

          {!isAuthLoading && !isAuthenticated && <AuthRequiredState />}

          {!isAuthLoading && isAuthenticated && (
            <>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 space-y-4">
            <div>
              <h1 className="mb-1 text-2xl font-bold text-foreground">Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                {viewer ? `Your control center for ${viewer.username}.` : "Your private AeTweaks dashboard."}
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
                  {recentSessions.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No synced sessions yet.</div>
                  ) : (
                    <ScrollArea className="max-h-[320px] pr-3">
                      <div className="space-y-3">
                        {recentSessions.map((session) => (
                          <div key={session.id} className="glass-panel rounded-xl px-4 py-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-foreground">
                                  {new Date(session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {new Date(session.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} • {formatDuration(session.activeSeconds)}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-sm font-semibold text-foreground">{session.totalBlocks.toLocaleString()}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{session.averageBph.toLocaleString()}/hr</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
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
                      <div className="mt-1 text-2xl font-bold text-primary">
                        {data.leaderboard.rankCached != null ? `#${data.leaderboard.rankCached}` : "—"}
                      </div>
                    </div>
                    <div className="glass-panel rounded-lg p-4">
                      <div className="text-xs text-muted-foreground">Blocks Mined</div>
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

              {canManageSources && (
                <GlassCard className="mt-6 p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-primary" />
                          <h3 className="text-sm font-semibold text-foreground">Source Approval</h3>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Newly detected servers stay private until an owner or admin approves them.
                        </p>
                      </div>
                    <div className="text-xs text-muted-foreground">{viewer?.role === "owner" ? "Owner access" : "Admin access"}</div>
                  </div>

                  {sourceApprovals.isLoading ? (
                    <div className="glass-panel rounded-lg p-4 text-sm text-muted-foreground">Loading source approvals...</div>
                  ) : (sourceApprovals.data?.sources.length ?? 0) === 0 ? (
                    <div className="glass-panel rounded-lg p-4 text-sm text-muted-foreground">No reviewable sources yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {sourceApprovals.data?.sources.map((source) => (
                        <div key={source.id} className="glass-panel rounded-2xl p-4">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <div className="text-base font-semibold text-foreground">{source.displayName}</div>
                                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                                  source.approvalStatus === "approved"
                                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                                    : source.approvalStatus === "rejected"
                                      ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
                                      : "border-amber-300/20 bg-amber-300/10 text-amber-100"
                                }`}>
                                  {source.approvalStatus}
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {source.kind === "singleplayer" ? "Singleplayer world" : "Server"} • {source.totalBlocks.toLocaleString()} blocks • {source.playerCount.toLocaleString()} players
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Submitted by {source.submittedByUsername ?? "Unknown player"} • {source.submittedAt ? formatTimeAgo(source.submittedAt) : "Recently seen"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Confidence {source.scanEvidence.confidence.toLocaleString()} • First seen {source.firstSeenAt ? formatTimeAgo(source.firstSeenAt) : "Recently"}
                              </div>
                              {source.scanEvidence.scoreboardTitle ? (
                                <div className="text-xs text-foreground/80">
                                  Scoreboard: {source.scanEvidence.scoreboardTitle}
                                </div>
                              ) : null}
                              {source.scanEvidence.detectedStatFields.length > 0 ? (
                                <div className="text-xs text-muted-foreground">
                                  Detected: {source.scanEvidence.detectedStatFields.join(", ")}
                                </div>
                              ) : null}
                              {source.scanEvidence.sampleSidebarLines.length > 0 ? (
                                <div className="glass-panel mt-2 rounded-xl p-3 text-xs text-muted-foreground">
                                  {source.scanEvidence.sampleSidebarLines.slice(0, 4).map((line) => (
                                    <div key={line} className="truncate">{line}</div>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <div className="mr-2 text-xs text-muted-foreground">
                                {source.eligibleForPublic ? "Visible on the leaderboard" : "Hidden from public leaderboard"}
                              </div>
                              <Button
                                variant="outline"
                                className="rounded-2xl border-emerald-400/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15"
                                disabled={sourceApprovals.isUpdating}
                                onClick={() => sourceApprovals.updateSourceApproval({ sourceId: source.id, action: "approved" })}
                              >
                                <CircleCheckBig className="mr-2 h-4 w-4" />
                                Accept
                              </Button>
                              <Button
                                variant="outline"
                                className="rounded-2xl border-rose-400/20 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15"
                                disabled={sourceApprovals.isUpdating}
                                onClick={() => sourceApprovals.updateSourceApproval({ sourceId: source.id, action: "rejected" })}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </GlassCard>
              )}
            </>
          )}
            </>
          )}
        </div>
      </DashboardLayout>
    </div>
  );
}
