import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { Timer, Pickaxe, TrendingUp, Calendar } from "lucide-react";

const sessions = [
  { date: "Apr 8, 2026", start: "14:22", duration: "2h 14m", blocks: 2340, rate: 1064, project: "Diamond Mine v2" },
  { date: "Apr 7, 2026", start: "20:10", duration: "1h 42m", blocks: 1890, rate: 1112, project: "Nether Highway" },
  { date: "Apr 6, 2026", start: "11:05", duration: "3h 01m", blocks: 3410, rate: 1132, project: "Diamond Mine v2" },
  { date: "Apr 5, 2026", start: "17:33", duration: "2h 38m", blocks: 2780, rate: 1054, project: "Iron Farm Clear" },
  { date: "Apr 4, 2026", start: "09:15", duration: "1h 22m", blocks: 1420, rate: 1035, project: "Obsidian Vault" },
  { date: "Apr 3, 2026", start: "21:40", duration: "4h 12m", blocks: 4890, rate: 1162, project: "Diamond Mine v2" },
];

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

export default function Sessions() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DashboardLayout>
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">Session History</h1>
            <p className="text-sm text-muted-foreground">Browse your past mining sessions and performance data.</p>
          </motion.div>

          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total Sessions", value: "234", icon: Timer },
              { label: "Total Time", value: "312h", icon: Calendar },
              { label: "Avg Blocks/Session", value: "1,842", icon: Pickaxe },
              { label: "Avg Rate", value: "1,094/hr", icon: TrendingUp },
            ].map((s) => (
              <GlassCard key={s.label} className="p-4">
                <s.icon className="w-4 h-4 text-primary/60 mb-2" />
                <div className="text-xl font-bold text-foreground">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </GlassCard>
            ))}
          </div>

          {/* Session List */}
          <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
            {sessions.map((s, i) => (
              <motion.div key={i} variants={fadeUp}>
                <GlassCard className="p-4 hover:glow-border transition-all duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Timer className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{s.date} at {s.start}</div>
                        <div className="text-xs text-muted-foreground">{s.project} • {s.duration}</div>
                      </div>
                    </div>
                    <div className="flex gap-6 text-right">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{s.blocks.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">blocks</div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-foreground">{s.rate.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">per hour</div>
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
