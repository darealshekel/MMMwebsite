import { motion } from "framer-motion";
import { Pickaxe, TrendingUp, Timer, Target, Bell, Trophy, ArrowUp, Clock, Zap, ShieldCheck, LogOut } from "lucide-react";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AdminManagementPanel } from "@/components/dashboard/AdminManagementPanel";
import { AuthRequiredState } from "@/components/AuthRequiredState";
import { GlassCard } from "@/components/GlassCard";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { ProgressRing } from "@/components/ProgressRing";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { useAeTweaksSnapshot } from "@/hooks/use-aetweaks-snapshot";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSiteContent } from "@/hooks/use-site-content";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { signOutEverywhere } from "@/lib/browser-auth";
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
  if (!value) return "-";
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatEta(seconds: number | null) {
  if (!seconds || seconds <= 0) return "-";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function Dashboard() {
  const { data: authViewer, isLoading: isAuthLoading } = useCurrentUser();
  const { data, isLoading } = useAeTweaksSnapshot(true);
  const siteContent = useSiteContent();
  const viewer = data?.viewer ?? authViewer ?? null;
  const isAuthenticated = Boolean(viewer) && data?.meta.source !== "auth_required";
  const isCheckingAuth = isAuthLoading && !viewer && !data;
  const hasDashboardError = data?.meta.source === "error";
  const canManageSources = Boolean(viewer && (viewer.role === "owner" || viewer.isAdmin));
  const recentSessions = data?.sessions.filter((session) => isQualifyingCompletedSession(session)) ?? [];

  const quickStats = data
    ? [
        {
          label: "Total Blocks Mined",
          value: data.leaderboard?.score ?? data.player?.totalSyncedBlocks ?? null,
          icon: Pickaxe,
          change: data.leaderboard ? "Single Players total" : data.player?.lastServerName ?? "-",
          isBlocksMined: true,
        },
        {
          label: "Avg Est. Blocks / Hour",
          value: data.estimatedBlocksPerHour > 0 ? data.estimatedBlocksPerHour : null,
          icon: TrendingUp,
          change: data.estimatedBlocksPerHour > 0 ? "Personal live estimate" : "-",
        },
        {
          label: "Total Sessions",
          value: data.player && data.player.totalSessions > 0 ? data.player.totalSessions : null,
          icon: Timer,
          change: data.player && data.player.totalSessions > 0 ? `${formatDuration(data.player.totalPlaySeconds)} tracked` : "-",
        },
        {
          label: "Daily Goal",
          value: data.dailyGoal?.percent ?? null,
          icon: Target,
          suffix: "%",
          change:
            data.dailyGoal
              ? <>
                  <BlocksMinedValue value={data.dailyGoal.progress}>
                    {data.dailyGoal.progress.toLocaleString()}
                  </BlocksMinedValue>
                  {" / "}
                  <BlocksMinedValue value={data.dailyGoal.target}>
                    {data.dailyGoal.target.toLocaleString()}
                  </BlocksMinedValue>
                </>
              : "-",
        },
      ]
    : [];

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />
      <DashboardLayout>
        <div className="space-y-6">
          {isCheckingAuth && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
              <GlassCard className="w-full max-w-xl p-8 text-center">
                <p className="font-pixel text-[10px] text-muted-foreground">CHECKING YOUR SECURE SESSION...</p>
              </GlassCard>
            </motion.div>
          )}

          {!isCheckingAuth && !isAuthenticated && <AuthRequiredState />}

          {!isCheckingAuth && isAuthenticated && (
            <div className="space-y-6">
              <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pixel-card grid-bg p-6 md:p-8">
                <div className="flex flex-col gap-4">
                  <div className="inline-flex w-fit items-center gap-2 border border-primary/30 bg-primary/10 px-3 py-1.5 text-primary">
                    <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
                    <span className="font-pixel text-[9px]">YOUR DASHBOARD</span>
                  </div>
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.92fr)] xl:items-end">
                    <div className="space-y-2">
                      <h1 className="font-pixel text-3xl leading-tight text-foreground md:text-5xl">
                        {(siteContent.data?.content["dashboard.heroTitle"] || "Dashboard")}
                        <span className="animate-blink text-primary">_</span>
                      </h1>
                      <p className="max-w-md font-display text-2xl leading-tight text-muted-foreground">
                        {siteContent.data?.content["dashboard.heroSubtitle"] || (viewer ? `Your control center for ${viewer.username}.` : "Your private MMM dashboard.")}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.section>

              {isLoading && !data && (
                <GlassCard>
                  <p className="font-pixel text-[10px] text-muted-foreground">LOADING SYNCED DASHBOARD DATA...</p>
                </GlassCard>
              )}

              {hasDashboardError && (
                <GlassCard>
                  <p className="font-pixel text-[10px] text-muted-foreground">DASHBOARD DATA UNAVAILABLE. OWNER TOOLS ARE STILL AVAILABLE BELOW.</p>
                </GlassCard>
              )}

              {!!data && !hasDashboardError && (
                <>
                  {data.viewer && (
                    <GlassCard>
                      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                        <div className="flex items-center gap-4">
                          <img src={data.viewer.avatarUrl} alt={data.viewer.username} className="h-14 w-14 border border-primary/20 bg-secondary" />
                          <div className="space-y-1">
                            <div className="font-pixel text-sm text-foreground">{data.viewer.username}</div>
                            <div className="text-[9px] leading-[1.7] text-muted-foreground">
                              Linked via {data.viewer.provider} • Last synced {formatTimeAgo(data.lastSyncedAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-stretch gap-3 md:min-w-[16rem] md:items-end">
                          <div className="pixel-card px-4 py-3 text-left md:w-full md:text-right">
                            <div className="font-pixel text-[8px] text-muted-foreground">ACCOUNT LINKED AND SECURED</div>
                            <div className="mt-1 font-pixel text-[10px] text-foreground leading-[1.4]">Data tracked using your linked Minecraft Account.</div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2 border-border/50"
                            onClick={() => void signOutEverywhere()}
                          >
                            <LogOut className="h-4 w-4" />
                            Sign Out
                          </Button>
                        </div>
                      </div>
                    </GlassCard>
                  )}

                  <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {quickStats.map((s) => (
                      <motion.div key={s.label} variants={fadeUp} className="h-full">
                        <GlassCard className="grid h-full min-h-[7.75rem] grid-rows-[auto_1fr_auto] p-4">
                          <div className="flex min-h-[2.25rem] items-start justify-between gap-2">
                            <span className="pr-2 font-pixel text-[8px] leading-[1.5] text-muted-foreground">{s.label}</span>
                            <s.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
                          </div>
                          {s.value == null ? (
                            <div className="flex items-end font-pixel text-xl text-foreground md:text-2xl">-</div>
                          ) : s.isBlocksMined ? (
                            <BlocksMinedValue as="div" value={s.value} className="flex items-end font-pixel text-xl md:text-2xl">
                              <AnimatedCounter target={s.value} suffix={s.suffix || ""} />
                            </BlocksMinedValue>
                          ) : (
                            <div className="flex items-end font-pixel text-xl text-foreground md:text-2xl">
                              <AnimatedCounter target={s.value} suffix={s.suffix || ""} />
                            </div>
                          )}
                          <div className="flex min-h-[1rem] items-center gap-1 self-end">
                            {s.change !== "-" && <ArrowUp className="h-3 w-3 text-glow-emerald" />}
                            <span className="text-[8px] leading-[1.5] text-muted-foreground">{s.change}</span>
                          </div>
                        </GlassCard>
                      </motion.div>
                    ))}
                  </motion.div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.85fr)]">
                    <GlassCard className="h-full">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="font-pixel text-[10px] text-foreground">ACTIVE PROJECTS</h3>
                        <span className="font-pixel text-[8px] text-primary">{data.projects.filter((project) => project.isActive).length} ACTIVE</span>
                      </div>
                      <div className="space-y-4">
                        {data.projects.length === 0 && <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">-</div>}
                        {data.projects.slice(0, 4).map((project) => (
                          <div key={project.id} className="pixel-card p-4">
                            <div className="mb-2 flex items-center justify-between gap-4">
                              <span className="font-pixel text-[10px] text-foreground">{project.name}</span>
                              <span className="text-[8px] leading-[1.6] text-muted-foreground">
                                {project.goal ? (
                                  <>
                                    <BlocksMinedValue value={project.progress}>{project.progress.toLocaleString()}</BlocksMinedValue>
                                    {" / "}
                                    <BlocksMinedValue value={project.goal}>{project.goal.toLocaleString()}</BlocksMinedValue>
                                  </>
                                ) : (
                                  <>
                                    <BlocksMinedValue value={project.progress}>{project.progress.toLocaleString()}</BlocksMinedValue>
                                    {" blocks"}
                                  </>
                                )}
                              </span>
                            </div>
                            <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                              <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${project.percent}%` }} transition={{ duration: 1, ease: "easeOut" }} />
                            </div>
                            <div className="flex justify-between text-[8px] leading-[1.6] text-muted-foreground">
                              <span>{project.isActive ? "Active project" : project.status === "complete" ? "Completed" : "Synced project"}</span>
                              <span>{project.percent}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </GlassCard>

                    <GlassCard className="flex h-full flex-col items-center justify-center">
                      <h3 className="mb-4 font-pixel text-[10px] text-foreground">TODAY'S PROGRESS</h3>
                      <ProgressRing progress={data.dailyGoal?.percent ?? 0} size={120} strokeWidth={8} label="Daily Goal" />
                      <div className="mt-4 text-center">
                        {data.dailyGoal ? (
                          <BlocksMinedValue as="div" value={data.dailyGoal.progress} className="font-pixel text-xl md:text-2xl">
                            {data.dailyGoal.progress.toLocaleString()}
                          </BlocksMinedValue>
                        ) : (
                          <div className="font-pixel text-xl text-foreground md:text-2xl">-</div>
                        )}
                        <div className="text-[8px] leading-[1.6] text-muted-foreground">
                          {data.dailyGoal ? <>of <BlocksMinedValue value={data.dailyGoal.target}>{data.dailyGoal.target.toLocaleString()}</BlocksMinedValue> blocks</> : "-"}
                        </div>
                      </div>
                    </GlassCard>
                  </div>

                  <div className="grid gap-4 2xl:grid-cols-2">
                    <GlassCard className="h-full">
                      <h3 className="mb-4 font-pixel text-[10px] text-foreground">RECENT SESSIONS</h3>
                      {recentSessions.length === 0 ? (
                        <div className="font-pixel text-[10px] text-muted-foreground">Not enough data</div>
                      ) : (
                        <ScrollArea className="max-h-[320px] pr-3">
                          <div className="space-y-3">
                            {recentSessions.map((session) => (
                              <div key={session.id} className="pixel-card px-4 py-3">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0">
                                    <div className="font-pixel text-[10px] text-foreground">
                                      {new Date(session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                                    </div>
                                    <div className="mt-1 text-[8px] leading-[1.6] text-muted-foreground">
                                      {new Date(session.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} • {formatDuration(session.activeSeconds)}
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <BlocksMinedValue as="div" value={session.totalBlocks} className="font-pixel text-[10px]">
                                      {session.totalBlocks.toLocaleString()}
                                    </BlocksMinedValue>
                                    <div className="mt-1 text-[8px] leading-[1.6] text-muted-foreground">{session.averageBph.toLocaleString()}/hr</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </GlassCard>

                    <GlassCard className="h-full">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="font-pixel text-[10px] text-foreground">NOTIFICATIONS</h3>
                        <Bell className="h-4 w-4 text-primary/60" />
                      </div>
                      <div className="space-y-3">
                        {data.notifications.length === 0 && <div className="font-pixel text-[10px] text-muted-foreground">-</div>}
                        {data.notifications.slice(0, 4).map((notification) => (
                          <div key={notification.id} className="flex items-start justify-between border-b border-border/30 py-2 last:border-0">
                            <div className="space-y-0.5">
                              <span className="font-pixel text-[10px] text-foreground/90">{notification.title}</span>
                              {notification.body && <p className="text-[8px] leading-[1.6] text-muted-foreground">{notification.body}</p>}
                            </div>
                            <span className="ml-3 whitespace-nowrap text-[8px] leading-[1.6] text-muted-foreground">{formatTimeAgo(notification.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    </GlassCard>
                  </div>

                  <div className="grid gap-4 2xl:grid-cols-2">
                    <GlassCard glow="accent" className="h-full">
                      <div className="mb-4 flex items-center gap-3">
                        <Trophy className="h-5 w-5 text-accent" />
                        <h3 className="font-pixel text-[10px] text-foreground">LEADERBOARD PREVIEW</h3>
                      </div>
                      {data.leaderboard ? (
                        <div className="grid gap-4 sm:grid-cols-[0.82fr_1.18fr_0.72fr]">
                          <div className="pixel-card min-w-0 p-4">
                            <div className="font-pixel text-[8px] text-muted-foreground">RANK</div>
                            <div className="mt-1 font-pixel text-xl text-primary md:text-2xl">
                              {data.leaderboard.rankCached != null ? `#${data.leaderboard.rankCached}` : "—"}
                            </div>
                          </div>
                          <div className="pixel-card min-w-0 p-4">
                            <div className="font-pixel text-[8px] text-muted-foreground">BLOCKS MINED</div>
                            <BlocksMinedValue as="div" value={data.leaderboard.score} className="mt-1 font-pixel text-lg md:text-xl">
                              {data.leaderboard.score.toLocaleString()}
                            </BlocksMinedValue>
                          </div>
                          <div className="pixel-card min-w-0 p-4">
                            <div className="font-pixel text-[8px] text-muted-foreground">UPDATED</div>
                            <div className="mt-1 font-pixel text-[10px] text-foreground">{formatTimeAgo(data.leaderboard.updatedAt)}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">NO LEADERBOARD ENTRY HAS BEEN SYNCED FOR THIS PLAYER YET.</div>
                      )}
                    </GlassCard>

                    <GlassCard className="h-full">
                      <div className="mb-3 flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        <h3 className="font-pixel text-[10px] text-foreground">SYNC SNAPSHOT</h3>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="pixel-card p-4">
                          <div className="flex items-center gap-2 font-pixel text-[8px] text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            LAST SEEN
                          </div>
                          <div className="mt-1 font-pixel text-[10px] text-foreground">{formatTimeAgo(data.player?.lastSeenAt)}</div>
                        </div>
                        <div className="pixel-card p-4">
                          <div className="font-pixel text-[8px] text-muted-foreground">ESTIMATED FINISH</div>
                          <div className="mt-1 font-pixel text-[10px] text-foreground">{formatEta(data.estimatedFinishSeconds)}</div>
                        </div>
                        <div className="pixel-card p-4">
                          <div className="font-pixel text-[8px] text-muted-foreground">TRACKED WORLDS</div>
                          <div className="mt-1 font-pixel text-[10px] text-foreground">{data.worlds.length}</div>
                        </div>
                      </div>
                    </GlassCard>
                  </div>

                </>
              )}

              {canManageSources && viewer && (
                <AdminManagementPanel
                  viewer={viewer}
                  siteContent={siteContent.data?.content ?? {}}
                />
              )}
            </div>
          )}
        </div>
      </DashboardLayout>
    </div>
  );
}
