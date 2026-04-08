import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { GlassCard } from "@/components/GlassCard";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { ProgressRing } from "@/components/ProgressRing";
import { SectionHeading } from "@/components/SectionHeading";
import { HeroBackground } from "@/components/HeroBackground";
import {
  Pickaxe, BarChart3, FolderKanban, Target, Bell, Cpu, Trophy,
  MapPin, Cloud, Download, Github, MessageCircle, Search, X,
  ChevronRight, Blocks, Timer, TrendingUp, Users, Zap, Shield, Database
} from "lucide-react";
import { useState } from "react";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
const fadeUp = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

const statCards = [
  { label: "Blocks Mined", value: 142857, icon: Pickaxe, color: "text-primary" },
  { label: "Projects Active", value: 7, icon: FolderKanban, color: "text-accent" },
  { label: "Sessions Tracked", value: 234, icon: Timer, color: "text-glow-emerald" },
  { label: "Goals Hit", value: 48, icon: Target, color: "text-primary" },
];

const featureCategories = [
  {
    category: "Tracking",
    features: [
      { name: "Mining Tracker", icon: Pickaxe, desc: "Real-time block counting, ore detection, and mining rate analytics across all sessions." },
      { name: "Area Tracking", icon: MapPin, desc: "Track progress by region, chunk, or custom zone with persistent spatial data." },
      { name: "Session History", icon: Timer, desc: "Automatic session logging with duration, blocks mined, XP gained, and efficiency stats." },
    ],
  },
  {
    category: "Management",
    features: [
      { name: "Projects", icon: FolderKanban, desc: "Create mining projects with targets, track completion percentage, ETA, and milestones." },
      { name: "Goals", icon: Target, desc: "Set daily, weekly, and custom goals with progress tracking and streak rewards." },
      { name: "Notifications", icon: Bell, desc: "Smart alerts for milestone hits, goal completions, project updates, and sync events." },
    ],
  },
  {
    category: "Intelligence",
    features: [
      { name: "Analytics", icon: BarChart3, desc: "Deep charts and insights: blocks/hour, efficiency trends, resource breakdowns." },
      { name: "AI ETA", icon: Cpu, desc: "Machine-learning powered completion estimates based on your mining patterns." },
      { name: "Leaderboards", icon: Trophy, desc: "Compete with friends and global players on mining stats and project completions." },
    ],
  },
];

const syncPoints = [
  { icon: Pickaxe, title: "Synced Mining Stats", desc: "Every block you mine is tracked and synced to your cloud dashboard in real time." },
  { icon: FolderKanban, title: "Synced Projects", desc: "Projects persist across servers, worlds, and sessions. Never lose progress." },
  { icon: Target, title: "Synced Goals", desc: "Daily goals follow you everywhere. Track streaks across any Minecraft instance." },
  { icon: Timer, title: "Session History", desc: "Full session timeline with analytics, accessible from any device via dashboard." },
  { icon: Users, title: "Cross-Server Data", desc: "Play on multiple servers? All stats aggregate into your unified profile." },
  { icon: BarChart3, title: "Personal Dashboard", desc: "A premium analytics hub showing everything about your Minecraft journey." },
];

const dashboardStats = [
  { label: "Total Blocks", value: "142,857", sub: "+2,340 today" },
  { label: "Blocks/Hour", value: "1,247", sub: "↑ 12% vs last week" },
  { label: "Est. Finish", value: "3d 14h", sub: "Diamond Mine v2" },
  { label: "Daily Goal", value: "78%", sub: "1,560 / 2,000" },
];

export default function Index() {
  const [featureModal, setFeatureModal] = useState<null | { name: string; icon: any; desc: string }>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const allFeatures = featureCategories.flatMap((c) => c.features);
  const filteredCategories = featureCategories
    .map((c) => ({
      ...c,
      features: c.features.filter(
        (f) =>
          f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.desc.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((c) => c.features.length > 0);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center pt-16">
        <HeroBackground />
        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center max-w-4xl mx-auto"
          >
            <span className="inline-block px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary border border-primary/30 rounded-full bg-primary/5 mb-6">
              Minecraft Mod + Auto Sync Dashboard
            </span>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-[1.1] mb-6">
              Track Everything.
              <br />
              <span className="text-gradient-primary">Sync Everywhere.</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
              AeTweaks brings advanced analytics, project management, and cloud-synced tracking to Minecraft.
              In-game HUD meets a premium online dashboard, with sync that can start the moment players launch the mod.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button size="lg" className="btn-glow bg-primary text-primary-foreground hover:bg-primary/90 gap-2 text-base px-6">
                <Download className="w-4 h-4" /> Download Mod
              </Button>
              <Link to="/dashboard">
                <Button size="lg" variant="outline" className="border-border/60 text-foreground hover:bg-secondary/50 gap-2 text-base px-6">
                  Open Dashboard <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/features">
                <Button size="lg" variant="ghost" className="text-muted-foreground hover:text-foreground gap-2 text-base">
                  View Features
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Floating stat cards */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 max-w-4xl mx-auto"
          >
            {statCards.map((s) => (
              <motion.div key={s.label} variants={fadeUp}>
                <GlassCard className="interactive-card text-center p-4 hover:glow-border transition-all duration-300">
                  <s.icon className={`w-5 h-5 mx-auto mb-2 ${s.color}`} />
                  <div className="text-2xl font-bold text-foreground">
                    <AnimatedCounter target={s.value} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="py-24 relative">
        <div className="container mx-auto px-4">
          <SectionHeading
            tag="Features"
            title="Built for Serious Miners"
            description="Every tool you need to track, plan, and dominate your Minecraft projects — in-game and online."
          />
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="space-y-12"
          >
            {featureCategories.map((cat) => (
              <div key={cat.category}>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-primary/70 mb-4">{cat.category}</h3>
                <div className="grid md:grid-cols-3 gap-4">
                  {cat.features.map((f) => (
                    <motion.div key={f.name} variants={fadeUp}>
                      <GlassCard className="interactive-card h-full hover:glow-border transition-all duration-300 group" onClick={() => setFeatureModal(f)}>
                        <f.icon className="w-6 h-6 text-primary mb-3 group-hover:scale-110 transition-transform" />
                        <h4 className="font-semibold text-foreground mb-1.5">{f.name}</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                      </GlassCard>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* SYNC SECTION */}
      <section className="py-24 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/3 to-transparent" />
        <div className="container mx-auto px-4 relative">
          <SectionHeading
            tag="Cloud Sync"
            title="Your Data, Everywhere"
            description="AeTweaks syncs between your Minecraft client and your online dashboard backend. Play anywhere, track everywhere."
          />
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {syncPoints.map((s) => (
              <motion.div key={s.title} variants={fadeUp}>
                <GlassCard className="h-full">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                    <s.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h4 className="font-semibold text-foreground mb-1.5">{s.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* DASHBOARD PREVIEW */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <SectionHeading
            tag="Dashboard"
            title="Analytics at a Glance"
            description="Your personal command center for every block mined, every project tracked, every goal smashed."
          />
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <GlassCard glow="primary" className="p-8 max-w-5xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                {dashboardStats.map((d) => (
                  <div key={d.label}>
                    <div className="text-xs text-muted-foreground mb-1">{d.label}</div>
                    <div className="text-2xl font-bold text-foreground">{d.value}</div>
                    <div className="text-xs text-primary mt-0.5">{d.sub}</div>
                  </div>
                ))}
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="glass-panel p-4 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-3">Current Project</div>
                  <div className="font-semibold text-foreground mb-2">Diamond Mine v2</div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      initial={{ width: 0 }}
                      whileInView={{ width: "67%" }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1.5">67% — 4,820 / 7,200 blocks</div>
                </div>
                <div className="glass-panel p-4 rounded-lg flex items-center justify-center">
                  <ProgressRing progress={78} label="Daily Goal" />
                </div>
                <div className="glass-panel p-4 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-3">Recent Session</div>
                  <div className="space-y-2">
                    {["2h 14m — 2,340 blocks", "1h 42m — 1,890 blocks", "3h 01m — 3,410 blocks"].map((s, i) => (
                      <div key={i} className="text-sm text-foreground/80 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </section>

      {/* FEATURE EXPLORER */}
      <section className="py-24 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/3 to-transparent" />
        <div className="container mx-auto px-4 relative">
          <SectionHeading
            tag="Explorer"
            title="Explore All Features"
            description="Search and discover every capability AeTweaks brings to your Minecraft experience."
          />
          <div className="max-w-md mx-auto mb-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search features..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors text-sm"
              />
            </div>
          </div>
          <div className="space-y-8 max-w-4xl mx-auto">
            {filteredCategories.map((cat) => (
              <div key={cat.category}>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{cat.category}</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {cat.features.map((f) => (
                    <button
                      key={f.name}
                      onClick={() => setFeatureModal(f)}
                      className="interactive-card glass-panel p-4 text-left hover:glow-border transition-all duration-200 group"
                    >
                      <div className="flex items-center gap-2.5">
                        <f.icon className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium text-foreground">{f.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {filteredCategories.length === 0 && (
              <p className="text-center text-muted-foreground">No features match your search.</p>
            )}
          </div>
        </div>
      </section>

      {/* CTA / DOWNLOAD */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <GlassCard glow="primary" className="text-center p-12 max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Ready to Track Smarter?</h2>
              <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
                Download AeTweaks, connect the sync backend, and start sending Minecraft progress to the cloud automatically.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button size="lg" className="btn-glow bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                  <Download className="w-4 h-4" /> Download Mod
                </Button>
                <Link to="/dashboard">
                  <Button size="lg" variant="outline" className="border-border/60 text-foreground hover:bg-secondary/50 gap-2">
                    Open Dashboard
                  </Button>
                </Link>
                <Button size="lg" variant="ghost" className="text-muted-foreground hover:text-foreground gap-2">
                  <MessageCircle className="w-4 h-4" /> Discord
                </Button>
                <Button size="lg" variant="ghost" className="text-muted-foreground hover:text-foreground gap-2">
                  <Github className="w-4 h-4" /> GitHub
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </section>

      <Footer />

      {/* Feature Modal */}
      {featureModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
          onClick={() => setFeatureModal(null)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass-panel-strong p-8 max-w-md w-full glow-primary"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <featureModal.icon className="w-6 h-6 text-primary" />
              </div>
              <button onClick={() => setFeatureModal(null)} className="interactive-button text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">{featureModal.name}</h3>
            <p className="text-muted-foreground leading-relaxed mb-6">{featureModal.desc}</p>
            <div className="neon-line mb-4" />
            <p className="text-xs text-muted-foreground">Part of AeTweaks Mod + Dashboard Ecosystem</p>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
