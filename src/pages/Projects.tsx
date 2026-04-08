import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { FolderKanban, Plus, Clock, Pickaxe } from "lucide-react";
import { Button } from "@/components/ui/button";

const projects = [
  { name: "Diamond Mine v2", progress: 67, target: 7200, mined: 4820, eta: "3d 14h", status: "active" },
  { name: "Nether Highway", progress: 34, target: 36000, mined: 12400, eta: "12d 8h", status: "active" },
  { name: "Iron Farm Clear", progress: 91, target: 9000, mined: 8190, eta: "6h 20m", status: "active" },
  { name: "Base Excavation", progress: 100, target: 15000, mined: 15000, eta: "Done", status: "complete" },
  { name: "Obsidian Vault", progress: 12, target: 5000, mined: 600, eta: "18d 2h", status: "active" },
];

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

export default function Projects() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DashboardLayout>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h1 className="text-2xl font-bold text-foreground">Projects</h1>
              <p className="text-sm text-muted-foreground">Track mining projects and completion goals.</p>
            </motion.div>
            <Button size="sm" className="btn-glow bg-primary text-primary-foreground gap-1.5">
              <Plus className="w-4 h-4" /> New Project
            </Button>
          </div>

          <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
            {projects.map((p) => (
              <motion.div key={p.name} variants={fadeUp}>
                <GlassCard className={`p-5 hover:glow-border transition-all duration-300 ${p.status === "complete" ? "opacity-60" : ""}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <FolderKanban className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground truncate">{p.name}</h3>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1"><Pickaxe className="w-3 h-3" />{p.mined.toLocaleString()} / {p.target.toLocaleString()}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{p.eta}</span>
                        </div>
                      </div>
                    </div>
                    <div className="w-full sm:w-48">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Progress</span>
                        <span>{p.progress}%</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${p.status === "complete" ? "bg-glow-emerald" : "bg-primary"}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${p.progress}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </DashboardLayout>
    </div>
  );
}
