import { motion } from "framer-motion";
import { Calendar, Pickaxe, Timer, TrendingUp } from "lucide-react";
import { AuthRequiredState } from "@/components/AuthRequiredState";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { SkeletonCardGrid, SkeletonProfile } from "@/components/Skeleton";
import { useMMMSnapshot } from "@/hooks/use-mmm-snapshot";
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
  const { data, isLoading } = useMMMSnapshot(isAuthenticated);

  const totalBlocks = data?.sessions.reduce((sum, session) => sum + session.totalBlocks, 0) ?? 0;
  const totalSeconds = data?.sessions.reduce((sum, session) => sum + session.activeSeconds, 0) ?? 0;
  const averageRate = data?.sessions.length
    ? Math.round(data.sessions.reduce((sum, session) => sum + session.averageBph, 0) / data.sessions.length)
    : 0;
  const averageBlocksPerSession = data?.sessions.length ? Math.round(totalBlocks / data.sessions.length) : 0;

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />
      <DashboardLayout>
        <div className="space-y-6">
          {isAuthLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <SkeletonProfile />
            </motion.div>
          )}

          {!isAuthLoading && !isAuthenticated && (
            <AuthRequiredState title="Sessions Locked" subtitle="Log in to view synced mining sessions and long-term performance history." />
          )}

          {!isAuthLoading && isAuthenticated && (
            <>
              <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pixel-card grid-bg p-6 md:p-8">
                <div className="flex flex-col gap-4">
                  <div className="inline-flex w-fit items-center gap-2 border border-primary/30 bg-primary/10 px-3 py-1.5 text-primary">
                    <Timer className="h-3.5 w-3.5" strokeWidth={2.5} />
                    <span className="font-pixel text-[9px]">SESSION HISTORY</span>
                  </div>
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.92fr)] xl:items-end">
                    <div className="space-y-2">
                      <h1 className="font-pixel text-3xl leading-tight text-foreground md:text-5xl">
                        Sessions
                        <span className="animate-blink text-primary">_</span>
                      </h1>
                      <p className="max-w-xl font-display text-2xl leading-tight text-muted-foreground">
                        Browse synced mining sessions and long-term performance data.
                      </p>
                    </div>
                    {data && (
                      <div className="w-full xl:justify-self-end xl:max-w-[32rem]">
                        <SyncStatusBanner meta={data.meta} />
                      </div>
                    )}
                  </div>
                </div>
              </motion.section>

              {isLoading && (
                <SkeletonCardGrid count={4} />
              )}

              {!!data && (
                <>
                  <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: "Total Sessions", value: data.player?.totalSessions ?? data.sessions.length, icon: Timer },
                      { label: "Total Time", value: formatDuration(data.player?.totalPlaySeconds ?? totalSeconds), icon: Calendar },
                      { label: "Avg Blocks/Session", value: averageBlocksPerSession, icon: Pickaxe, isBlocksMined: true },
                      { label: "Avg Rate", value: `${averageRate.toLocaleString()}/hr`, icon: TrendingUp },
                    ].map((stat) => (
                      <motion.div key={stat.label} variants={fadeUp} className="h-full">
                        <GlassCard className="grid h-full min-h-[7.75rem] grid-rows-[auto_1fr_auto] p-4">
                          <div className="flex min-h-[2.25rem] items-start justify-between gap-2">
                            <span className="pr-2 font-pixel text-[8px] leading-[1.5] text-muted-foreground">{stat.label}</span>
                            <stat.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
                          </div>
                          {stat.isBlocksMined ? (
                            <BlocksMinedValue as="div" value={Number(stat.value)} className="flex items-end font-pixel text-xl md:text-2xl">
                              {Number(stat.value).toLocaleString()}
                            </BlocksMinedValue>
                          ) : (
                            <div className="flex items-end font-pixel text-xl text-foreground md:text-2xl">{stat.value}</div>
                          )}
                          <div className="text-[8px] leading-[1.5] text-muted-foreground">
                            {stat.label === "Total Sessions"
                              ? "ALL LOGGED RUNS"
                              : stat.label === "Total Time"
                                ? "COMBINED ACTIVE TIME"
                                : stat.label === "Avg Blocks/Session"
                                  ? "PER SESSION OUTPUT"
                                  : "AVERAGE BLOCK PACE"}
                          </div>
                        </GlassCard>
                      </motion.div>
                    ))}
                  </motion.div>

                  <section className="pixel-card p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <h2 className="font-pixel text-[10px] text-foreground">SYNCED RUNS</h2>
                        <p className="text-[8px] leading-[1.6] text-muted-foreground">Full mining history, kept on the same shell as the leaderboard and dashboard.</p>
                      </div>
                      <div className="font-pixel text-[8px] text-primary">{data.sessions.length} STORED</div>
                    </div>

                    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
                      {data.sessions.length === 0 && (
                        <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">Not enough data</div>
                      )}
                      {data.sessions.map((session) => (
                        <motion.div key={session.id} variants={fadeUp}>
                          <div className="pixel-card p-4">
                            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-center">
                              <div className="flex items-start gap-3">
                                <div className="grid h-8 w-8 shrink-0 place-items-center border border-primary/20 bg-primary/10">
                                  <Timer className="h-4 w-4 text-primary" />
                                </div>
                                <div className="space-y-1">
                                  <div className="font-pixel text-base text-foreground">
                                    {new Date(session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} at{" "}
                                    {new Date(session.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                  <div className="text-[8px] leading-[1.6] text-muted-foreground">
                                    {session.status.toUpperCase()} • {formatDuration(session.activeSeconds)} • {session.topBlock ?? "NO TOP BLOCK"}
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 xl:text-right">
                                <div>
                                  <BlocksMinedValue as="div" value={session.totalBlocks} className="font-pixel text-xl">
                                    {session.totalBlocks.toLocaleString()}
                                  </BlocksMinedValue>
                                  <div className="text-[8px] leading-[1.6] text-muted-foreground">BLOCKS</div>
                                </div>
                                <div>
                                  <div className="font-pixel text-xl text-foreground">{session.averageBph.toLocaleString()}</div>
                                  <div className="text-[8px] leading-[1.6] text-muted-foreground">PER HOUR</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </DashboardLayout>
    </div>
  );
}
