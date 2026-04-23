import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { GlassCard } from "@/components/GlassCard";
import { ProgressRing } from "@/components/ProgressRing";
import { Button } from "@/components/ui/button";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import {
  BarChart3,
  Bell,
  ChevronRight,
  Cpu,
  FolderKanban,
  Github,
  MapPin,
  MessageCircle,
  Pickaxe,
  Search,
  Target,
  Timer,
  Trophy,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import mmmLogo from "@/assets/mmm-logo.png";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const fadeUp = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } };

type FeatureItem = {
  name: string;
  icon: LucideIcon;
  desc: string;
};

type FeatureCategory = {
  category: string;
  features: FeatureItem[];
};

const statCards = [
  { label: "Blocks Logged", value: 142634, icon: Pickaxe, isBlocksMined: true },
  { label: "Live Projects", value: 6, icon: FolderKanban },
  { label: "Sessions Stored", value: 233, icon: Timer },
  { label: "Targets Crushed", value: 47, icon: Target },
];

const featureCategories: FeatureCategory[] = [
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

const dashboardStats = [
  { label: "Current Project", value: "Diamond Mine v2", sub: "67% COMPLETE" },
  { label: "Blocks / Hour", value: "1,247", sub: "12% OVER LAST WEEK" },
  { label: "Tracked Places", value: "4", sub: "ACTIVE SOURCES" },
];

export default function Index() {
  const [featureModal, setFeatureModal] = useState<FeatureItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const scrollToFeatures = () => {
    document.getElementById("landing-features")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const filteredCategories = useMemo(
    () =>
      featureCategories
        .map((category) => ({
          ...category,
          features: category.features.filter(
            (feature) =>
              feature.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              feature.desc.toLowerCase().includes(searchQuery.toLowerCase()),
          ),
        }))
        .filter((category) => category.features.length > 0),
    [searchQuery],
  );

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      <main className="container space-y-6 py-6 md:py-8">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pixel-card grid-bg p-6 md:p-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)] xl:items-end">
            <div className="space-y-4">
              <div className="inline-flex w-fit items-center gap-3 border border-primary/30 bg-primary/10 px-3 py-1.5 text-primary">
                <img src={mmmLogo} alt="MMM logo" className="h-5 w-5 object-contain mix-blend-screen" />
                <span className="font-pixel text-[9px]">MANUAL MINING MANIACS</span>
              </div>
              <div className="space-y-2">
                <h1 className="font-pixel text-3xl leading-tight text-foreground md:text-5xl">
                  Manual Mining.
                  <br />
                  Recorded the right way
                  <span className="animate-blink text-primary">_</span>
                </h1>
                <p className="max-w-2xl font-display text-2xl leading-tight text-muted-foreground">
                  A place to show your love for mining tens of millions of blocks by hand.
                </p>
                <p className="max-w-2xl text-[10px] leading-[1.8] text-foreground/80">
                  Track long grinds, keep clean proof, and compare yourself against miners who actually put the hours in.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/leaderboard">
                  <Button className="font-pixel text-[9px] uppercase tracking-[0.08em]">
                    <Trophy className="mr-1.5 h-3.5 w-3.5" />
                    Open Leaderboard
                  </Button>
                </Link>
                <Link to="/dashboard">
                  <Button variant="outline" className="font-pixel text-[9px] uppercase tracking-[0.08em]">
                    Open Dashboard
                    <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </Link>
                <Button variant="ghost" className="font-pixel text-[9px] uppercase tracking-[0.08em]" onClick={scrollToFeatures}>
                  View Features
                </Button>
              </div>
            </div>

            <div className="space-y-4 xl:justify-self-end xl:max-w-[32rem]">
              <div className="pixel-card p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center border border-primary/20 bg-primary/10">
                    <img src={mmmLogo} alt="MMM mark" className="h-6 w-6 object-contain mix-blend-screen" />
                  </div>
                  <div>
                    <div className="font-pixel text-[10px] text-foreground">MMM LOCAL BUILD</div>
                    <div className="text-[8px] leading-[1.6] text-muted-foreground">Manual-mining culture, records, sessions, and source-backed proof.</div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {dashboardStats.map((stat) => (
                    <div key={stat.label} className="pixel-card p-3">
                      <div className="font-pixel text-[8px] text-muted-foreground">{stat.label}</div>
                      <div className="mt-1 font-pixel text-[10px] text-foreground">{stat.value}</div>
                      <div className="mt-1 text-[8px] leading-[1.6] text-primary">{stat.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((stat) => (
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
                  {stat.label === "Blocks Logged"
                    ? "TRACKED ACROSS MMM"
                    : stat.label === "Live Projects"
                      ? "CURRENTLY RUNNING"
                      : stat.label === "Sessions Stored"
                        ? "RECORDED HISTORY"
                        : "FINISHED GOALS"}
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>

        {featureCategories.map((category, index) => (
          <section key={category.category} id={index === 0 ? "landing-features" : undefined} className="pixel-card p-5">
            <div className="mb-4 space-y-1">
              <div className="font-pixel text-[8px] text-primary">{category.category.toUpperCase()}</div>
              <h2 className="font-pixel text-[10px] text-foreground">CORE MMM TOOLS</h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {category.features.map((feature) => (
                <button
                  key={feature.name}
                  onClick={() => setFeatureModal(feature)}
                  className="pixel-card p-4 text-left transition-colors hover:border-primary/40"
                >
                  <feature.icon className="mb-3 h-5 w-5 text-primary" />
                  <div className="font-pixel text-base text-foreground">{feature.name}</div>
                  <p className="mt-2 text-[9px] leading-[1.7] text-muted-foreground">{feature.desc}</p>
                </button>
              ))}
            </div>
          </section>
        ))}

        <section className="grid gap-4 2xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <GlassCard className="h-full">
            <div className="mb-4 flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h2 className="font-pixel text-[10px] text-foreground">DASHBOARD PREVIEW</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-[0.95fr_0.95fr_1.1fr]">
              <div className="pixel-card p-4">
                <div className="font-pixel text-[8px] text-muted-foreground">CURRENT PROJECT</div>
                <div className="mt-1 font-pixel text-[10px] text-foreground">Diamond Mine v2</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} whileInView={{ width: "67%" }} viewport={{ once: true }} transition={{ duration: 1, ease: "easeOut" }} />
                </div>
                <div className="mt-1 text-[8px] leading-[1.6] text-primary">67% COMPLETE</div>
              </div>
              <div className="pixel-card flex items-center justify-center p-4">
                <ProgressRing progress={78} label="Daily Goal" />
              </div>
              <div className="pixel-card p-4">
                <div className="font-pixel text-[8px] text-muted-foreground">RECENT RUNS</div>
                <div className="mt-2 space-y-2">
                  {[
                    { duration: "2h 14m", blocks: 2340 },
                    { duration: "1h 42m", blocks: 1890 },
                    { duration: "3h 01m", blocks: 3410 },
                  ].map((entry) => (
                    <div key={entry.duration} className="flex items-center gap-2 text-[8px] leading-[1.6] text-muted-foreground">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <span>{entry.duration} — </span>
                      <BlocksMinedValue value={entry.blocks}>{entry.blocks.toLocaleString()}</BlocksMinedValue>
                      <span> blocks</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="h-full">
            <div className="mb-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="font-pixel text-[10px] text-foreground">WHY MMM</h2>
            </div>
            <div className="space-y-3">
              {[
                "TRACK LONG GRINDS WITHOUT LOSING PROOF",
                "KEEP PROJECTS, GOALS, AND SESSIONS ON ONE SHELL",
                "COMPARE YOUR MANUAL MINING AGAINST REAL PLAYERS",
              ].map((line) => (
                <div key={line} className="pixel-card p-3 font-pixel text-[8px] text-foreground">
                  {line}
                </div>
              ))}
            </div>
          </GlassCard>
        </section>

        <section className="pixel-card p-5">
          <div className="mb-4 space-y-1">
            <div className="font-pixel text-[8px] text-primary">EXPLORER</div>
            <h2 className="font-pixel text-[10px] text-foreground">SEARCH EVERY FEATURE</h2>
          </div>
          <div className="mb-5 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="SEARCH FEATURES..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border border-border bg-card py-3 pl-10 pr-4 font-pixel text-[10px] text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
              />
            </div>
          </div>
          <div className="space-y-6">
            {filteredCategories.map((category) => (
              <div key={category.category}>
                <div className="mb-3 font-pixel text-[8px] text-muted-foreground">{category.category.toUpperCase()}</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {category.features.map((feature) => (
                    <button
                      key={feature.name}
                      onClick={() => setFeatureModal(feature)}
                      className="pixel-card flex items-center gap-2 p-4 text-left transition-colors hover:border-primary/40"
                    >
                      <feature.icon className="h-4 w-4 text-primary" />
                      <span className="font-pixel text-[10px] text-foreground">{feature.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {filteredCategories.length === 0 && (
              <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">NO FEATURES MATCH THAT SEARCH.</div>
            )}
          </div>
        </section>

        <section className="pixel-card p-6 text-center">
          <h2 className="font-pixel text-2xl text-foreground md:text-3xl">Built For The Long Grind</h2>
          <p className="mx-auto mt-3 max-w-3xl text-[10px] leading-[1.8] text-muted-foreground">
            Keep your manual mining history clean, visible, and ready to compare whenever another grinder starts talking numbers.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link to="/leaderboard">
              <Button className="font-pixel text-[9px] uppercase tracking-[0.08em]">
                <Trophy className="mr-1.5 h-3.5 w-3.5" />
                Open Leaderboard
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="outline" className="font-pixel text-[9px] uppercase tracking-[0.08em]">
                Open Dashboard
              </Button>
            </Link>
            <Button variant="ghost" className="font-pixel text-[9px] uppercase tracking-[0.08em]">
              <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
              Discord
            </Button>
            <Button variant="ghost" className="font-pixel text-[9px] uppercase tracking-[0.08em]">
              <Github className="mr-1.5 h-3.5 w-3.5" />
              GitHub
            </Button>
          </div>
        </section>
      </main>

      <footer className="container mt-10 border-t border-border py-10">
        <div className="flex flex-col items-center justify-between gap-3 font-pixel text-[9px] text-muted-foreground md:flex-row">
          <span>MMM // LOCAL BUILD</span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse bg-stat-green" />
            LIVE • SYNCED 2 MIN AGO
          </span>
        </div>
      </footer>

      {featureModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm"
          onClick={() => setFeatureModal(null)}
        >
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="pixel-card w-full max-w-md p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="grid h-12 w-12 place-items-center border border-primary/20 bg-primary/10">
                <featureModal.icon className="h-6 w-6 text-primary" />
              </div>
              <button onClick={() => setFeatureModal(null)} className="text-muted-foreground transition-colors hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <h3 className="font-pixel text-xl text-foreground">{featureModal.name}</h3>
            <p className="mt-3 text-[10px] leading-[1.8] text-muted-foreground">{featureModal.desc}</p>
            <div className="mt-6 border-t border-border pt-4">
              <p className="font-pixel text-[8px] text-muted-foreground">MMM LOCAL BUILD FOR MANUAL MINING MANIACS.</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
