import { motion } from "framer-motion";
import { FolderKanban, Pickaxe, Plus, ShieldCheck, Target, Timer } from "lucide-react";
import { AuthRequiredState } from "@/components/AuthRequiredState";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { Button } from "@/components/ui/button";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { SkeletonCardGrid, SkeletonProfile } from "@/components/Skeleton";
import { useMMMSnapshot } from "@/hooks/use-mmm-snapshot";
import { useCurrentUser } from "@/hooks/use-current-user";

const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };

export default function Projects() {
  const { data: viewer, isLoading: isAuthLoading } = useCurrentUser();
  const isAuthenticated = Boolean(viewer);
  const { data, isLoading } = useMMMSnapshot(isAuthenticated);

  const totalProjects = data?.projects.length ?? 0;
  const activeProjects = data?.projects.filter((project) => project.isActive).length ?? 0;
  const completedProjects = data?.projects.filter((project) => project.status === "complete").length ?? 0;
  const totalTrackedBlocks = data?.projects.reduce((sum, project) => sum + project.progress, 0) ?? 0;

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
            <AuthRequiredState title="Projects Locked" subtitle="Log in to view synced mining projects and completion tracking." />
          )}

          {!isAuthLoading && isAuthenticated && (
            <>
              <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pixel-card p-6 md:p-8">
                <div className="flex flex-col gap-4">
                  <div className="inline-flex w-fit items-center gap-2 border border-primary/30 bg-primary/10 px-3 py-1.5 text-primary">
                    <FolderKanban className="h-3.5 w-3.5" strokeWidth={2.5} />
                    <span className="font-pixel text-[9px]">PROJECT TRACKER</span>
                  </div>
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.92fr)] xl:items-end">
                    <div className="space-y-2">
                      <h1 className="font-pixel text-3xl leading-tight text-foreground md:text-5xl">
                        Projects
                        <span className="animate-blink text-primary">_</span>
                      </h1>
                      <p className="max-w-xl font-display text-2xl leading-tight text-muted-foreground">
                        Track synced mining projects, long-form targets, and completion momentum.
                      </p>
                    </div>
                    <div className="space-y-3 xl:justify-self-end xl:max-w-[32rem]">
                      <Button size="sm" className="font-pixel text-[9px] uppercase tracking-[0.08em]">
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        New Project
                      </Button>
                      {data && <SyncStatusBanner meta={data.meta} />}
                    </div>
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
                      { label: "Projects", value: totalProjects, icon: FolderKanban },
                      { label: "Active", value: activeProjects, icon: Timer },
                      { label: "Completed", value: completedProjects, icon: Target },
                      { label: "Tracked Blocks", value: totalTrackedBlocks, icon: Pickaxe, isBlocksMined: true },
                    ].map((stat) => (
                      <motion.div key={stat.label} variants={fadeUp} className="h-full">
                        <GlassCard className="grid h-full min-h-[7.75rem] grid-rows-[auto_1fr_auto] p-4">
                          <div className="flex min-h-[2.25rem] items-start justify-between gap-2">
                            <span className="pr-2 font-pixel text-[8px] leading-[1.5] text-muted-foreground">{stat.label}</span>
                            <stat.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
                          </div>
                          {stat.isBlocksMined ? (
                            <BlocksMinedValue as="div" value={stat.value} className="flex items-end font-pixel text-xl md:text-2xl">
                              {stat.value.toLocaleString()}
                            </BlocksMinedValue>
                          ) : (
                            <div className="flex items-end font-pixel text-xl text-foreground md:text-2xl">{stat.value.toLocaleString()}</div>
                          )}
                          <div className="text-[8px] leading-[1.5] text-muted-foreground">
                            {stat.label === "Projects"
                              ? "ALL SYNCED TRACKERS"
                              : stat.label === "Active"
                                ? "CURRENTLY MOVING"
                                : stat.label === "Completed"
                                  ? "FINISHED GRINDS"
                                  : "SUM OF PROJECT PROGRESS"}
                          </div>
                        </GlassCard>
                      </motion.div>
                    ))}
                  </motion.div>

                  <section className="pixel-card p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <h2 className="font-pixel text-[10px] text-foreground">SYNCED PROJECTS</h2>
                        <p className="text-[8px] leading-[1.6] text-muted-foreground">Every project stays on the same leaderboard/dashboard shell and carries synced mining totals.</p>
                      </div>
                      <div className="font-pixel text-[8px] text-primary">{activeProjects} ACTIVE</div>
                    </div>

                    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
                      {data.projects.length === 0 && (
                        <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">NO ACTIVE PROJECTS HAVE SYNCED FOR THIS ACCOUNT YET.</div>
                      )}

                      {data.projects.map((project) => (
                        <motion.div key={project.id} variants={fadeUp}>
                          <div className={`pixel-card p-4 ${project.status === "complete" ? "opacity-75" : ""}`}>
                            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-center">
                              <div className="flex min-w-0 items-start gap-4">
                                <div className="grid h-10 w-10 shrink-0 place-items-center border border-primary/20 bg-primary/10">
                                  <FolderKanban className="h-4 w-4 text-primary" />
                                </div>
                                <div className="min-w-0 space-y-1">
                                  <div className="font-pixel text-base text-foreground">{project.name}</div>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] leading-[1.6] text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Pickaxe className="h-3 w-3" />
                                      {project.goal ? (
                                        <>
                                          <BlocksMinedValue value={project.progress}>{project.progress.toLocaleString()}</BlocksMinedValue>
                                          {" / "}
                                          <BlocksMinedValue value={project.goal}>{project.goal.toLocaleString()}</BlocksMinedValue>
                                        </>
                                      ) : (
                                        <>
                                          <BlocksMinedValue value={project.progress}>{project.progress.toLocaleString()}</BlocksMinedValue>
                                          {" BLOCKS"}
                                        </>
                                      )}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Timer className="h-3 w-3" />
                                      {project.isActive ? "ACTIVELY SYNCING" : project.status === "complete" ? "COMPLETED" : "SYNCED PROJECT"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-2 xl:text-right">
                                <div className="flex justify-between font-pixel text-[8px] text-muted-foreground xl:justify-end xl:gap-3">
                                  <span>PROGRESS</span>
                                  <span>{project.percent}%</span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                                  <motion.div
                                    className={`h-full rounded-full ${project.status === "complete" ? "bg-glow-emerald" : "bg-primary"}`}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${project.percent}%` }}
                                    transition={{ duration: 1, ease: "easeOut" }}
                                  />
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
