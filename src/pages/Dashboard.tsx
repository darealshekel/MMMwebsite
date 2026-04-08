import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GlassCard } from "@/components/GlassCard";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { ProgressRing } from "@/components/ProgressRing";
import {
  Pickaxe, TrendingUp, Timer, Target, Bell, Trophy, ChevronRight,
  ArrowUp, ArrowDown, Clock, Zap
} from "lucide-react";

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };

const quickStats = [
  { label: "Total Blocks Mined", value: 142857, icon: Pickaxe, change: "+2,340 today", up: true },
  { label: "Blocks / Hour", value: 1247, icon: TrendingUp, change: "+12% vs last week", up: true },
  { label: "Active Sessions", value: 234, icon: Timer, change: "Current: 1h 42m", up: true },
  { label: "Daily Goal", value: 78, icon: Target, suffix: "%", change: "1,560 / 2,000", up: true },
];

const recentSessions = [
  { date: "Today", duration: "2h 14m", blocks: 2340, rate: 1064 },
  { date: "Yesterday", duration: "1h 42m", blocks: 1890, rate: 1112 },
  { date: "Apr 6", duration: "3h 01m", blocks: 3410, rate: 1132 },
  { date: "Apr 5", duration: "2h 38m", blocks: 2780, rate: 1054 },
];

const notifications = [
  { text: "Daily goal reached! 🎉", time: "2m ago", type: "success" },
  { text: "Project 'Diamond Mine v2' at 67%", time: "1h ago", type: "info" },
  { text: "New mining session started", time: "1h 42m ago", type: "info" },
  { text: "Weekly leaderboard rank: #12", time: "5h ago", type: "highlight" },
];

const projects = [
  { name: "Diamond Mine v2", progress: 67, blocks: "4,820 / 7,200", eta: "3d 14h" },
  { name: "Nether Highway", progress: 34, blocks: "12,400 / 36,000", eta: "12d 8h" },
  { name: "Iron Farm Clear", progress: 91, blocks: "8,190 / 9,000", eta: "6h 20m" },
];

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DashboardLayout>
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-1">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Welcome back. Here's your mining overview.</p>
          </motion.div>

          {/* Quick Stats */}
          <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {quickStats.map((s) => (
              <motion.div key={s.label} variants={fadeUp}>
                <GlassCard className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <s.icon className="w-4 h-4 text-primary/60" />
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    <AnimatedCounter target={s.value} suffix={s.suffix || ""} />
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    {s.up ? <ArrowUp className="w-3 h-3 text-glow-emerald" /> : <ArrowDown className="w-3 h-3 text-destructive" />}
                    <span className="text-xs text-muted-foreground">{s.change}</span>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>

          <div className="grid lg:grid-cols-3 gap-4 mb-6">
            {/* Projects */}
            <GlassCard className="lg:col-span-2 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Active Projects</h3>
                <span className="text-xs text-primary cursor-pointer hover:underline">View All</span>
              </div>
              <div className="space-y-4">
                {projects.map((p) => (
                  <div key={p.name} className="glass-panel p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-foreground text-sm">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.eta} remaining</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-1.5">
                      <motion.div
                        className="h-full bg-primary rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${p.progress}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{p.blocks}</span>
                      <span>{p.progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Daily Goal Ring */}
            <GlassCard className="p-5 flex flex-col items-center justify-center">
              <h3 className="font-semibold text-foreground mb-4">Today's Progress</h3>
              <ProgressRing progress={78} size={120} strokeWidth={8} label="Daily Goal" />
              <div className="mt-4 text-center">
                <div className="text-2xl font-bold text-foreground">1,560</div>
                <div className="text-xs text-muted-foreground">of 2,000 blocks</div>
              </div>
            </GlassCard>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            {/* Recent Sessions */}
            <GlassCard className="p-5">
              <h3 className="font-semibold text-foreground mb-4">Recent Sessions</h3>
              <div className="space-y-3">
                {recentSessions.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div>
                      <span className="text-sm font-medium text-foreground">{s.date}</span>
                      <span className="text-xs text-muted-foreground ml-2">{s.duration}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium text-foreground">{s.blocks.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground ml-2">{s.rate}/hr</span>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Notifications */}
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Notifications</h3>
                <Bell className="w-4 h-4 text-primary/60" />
              </div>
              <div className="space-y-3">
                {notifications.map((n, i) => (
                  <div key={i} className="flex items-start justify-between py-2 border-b border-border/30 last:border-0">
                    <span className="text-sm text-foreground/90">{n.text}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">{n.time}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* Leaderboard Card */}
          <GlassCard glow="accent" className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <Trophy className="w-5 h-5 text-accent" />
              <h3 className="font-semibold text-foreground">Leaderboard</h3>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { rank: "#2", name: "DiamondKing", blocks: "289,340" },
                { rank: "#1", name: "MineGod42", blocks: "312,500" },
                { rank: "#3", name: "BlockSmith", blocks: "267,120" },
              ].map((p, i) => (
                <div key={i} className={`glass-panel p-4 rounded-lg ${i === 1 ? "glow-border" : ""}`}>
                  <div className={`text-lg font-bold ${i === 1 ? "text-primary" : "text-muted-foreground"}`}>{p.rank}</div>
                  <div className="text-sm font-medium text-foreground mt-1">{p.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{p.blocks} blocks</div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Data Architecture Note */}
          <GlassCard className="mt-6 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Backend-Ready Architecture</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              This dashboard is structured for seamless backend integration. Data entities modeled:
            </p>
            <div className="flex flex-wrap gap-2">
              {["users", "profiles", "projects", "mining_sessions", "daily_goals", "notifications", "synced_stats", "worlds_or_servers", "leaderboards", "settings"].map((e) => (
                <span key={e} className="px-2.5 py-1 text-xs font-mono bg-secondary/50 text-muted-foreground rounded-md border border-border/30">
                  {e}
                </span>
              ))}
            </div>
          </GlassCard>
        </div>
      </DashboardLayout>
    </div>
  );
}
