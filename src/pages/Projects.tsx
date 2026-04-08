import { motion } from "framer-motion";
import { FolderKanban, Plus, Clock, Pickaxe } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { AuthRequiredState } from "@/components/AuthRequiredState";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { useAeTweaksSnapshot } from "@/hooks/use-aetweaks-snapshot";
import { useCurrentUser } from "@/hooks/use-current-user";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

export default function Projects() {
  const { data: viewer, isLoading: isAuthLoading } = useCurrentUser();
  const isAuthenticated = Boolean(viewer);
  const { data, isLoading } = useAeTweaksSnapshot(isAuthenticated);

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
              subtitle="Log in to view your projects and progress."
            />
          )}

          {!isAuthLoading && isAuthenticated && (
            <>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Projects</h1>
              <p className="text-sm text-muted-foreground">Track synced mining projects, goals, and completion momentum.</p>
            </motion.div>
            <Button size="sm" className="btn-glow w-fit gap-1.5 bg-primary text-primary-foreground">
              <Plus className="h-4 w-4" /> New Project
            </Button>
          </div>

          {data && <div className="mb-6"><SyncStatusBanner meta={data.meta} compact /></div>}

          {isLoading && (
            <GlassCard className="mb-6 p-4">
              <p className="text-sm text-muted-foreground">Loading project sync...</p>
            </GlassCard>
          )}

          {!!data && (
            <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
              {data.projects.length === 0 && (
                <GlassCard className="p-5">
                  <p className="text-sm text-muted-foreground">No active projects have synced for this linked account yet.</p>
                </GlassCard>
              )}
              {data.projects.map((project) => (
                <motion.div key={project.id} variants={fadeUp}>
                  <GlassCard className={`interactive-card p-5 transition-all duration-300 hover:glow-border ${project.status === "complete" ? "opacity-70" : ""}`}>
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                          <FolderKanban className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-foreground">{project.name}</h3>
                          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Pickaxe className="h-3 w-3" />
                              {project.goal ? `${project.progress.toLocaleString()} / ${project.goal.toLocaleString()}` : `${project.progress.toLocaleString()} mined`}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {project.isActive ? "Actively syncing" : project.status === "complete" ? "Completed" : "Synced project"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="w-full sm:w-56">
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                          <span>Progress</span>
                          <span>{project.percent}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-secondary">
                          <motion.div className={`h-full rounded-full ${project.status === "complete" ? "bg-glow-emerald" : "bg-primary"}`} initial={{ width: 0 }} animate={{ width: `${project.percent}%` }} transition={{ duration: 1, ease: "easeOut" }} />
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </motion.div>
          )}
            </>
          )}
        </div>
      </DashboardLayout>
    </div>
  );
}
