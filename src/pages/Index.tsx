import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import {
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  Database,
  FolderKanban,
  Pickaxe,
  Server,
  ShieldCheck,
  Trophy,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import mmmLogo from "@/assets/mmm-logo.png";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const fadeUp = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } };

type OverviewCard = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
};

type SectionCard = {
  eyebrow: string;
  title: string;
  body: string;
  icon: LucideIcon;
  to: string;
  cta: string;
};

const overviewCards: OverviewCard[] = [
  { label: "Leaderboard types", value: "3", detail: "Digs, Private Server Digs, SSP/HSP", icon: Trophy },
  { label: "Tracked sources", value: "100+", detail: "Servers and worlds kept in one directory", icon: Server },
  { label: "Player profiles", value: "live", detail: "Totals, source splits, and mining activity", icon: UserRound },
  { label: "Dashboard tools", value: "admin", detail: "Sync, source review, flags, and corrections", icon: ShieldCheck },
];

const sections: SectionCard[] = [
  {
    eyebrow: "What MMM is",
    title: "A manual mining records site",
    body: "MMM keeps hand-mined block totals readable, searchable, and tied back to the players and sources they came from.",
    icon: Database,
    to: "/leaderboard",
    cta: "Open records",
  },
  {
    eyebrow: "Manual leaderboards",
    title: "Rankings without noise",
    body: "Browse single-player digs, SSP/HSP, and server-based leaderboards with the same card system across the site.",
    icon: Trophy,
    to: "/leaderboard",
    cta: "View leaderboards",
  },
  {
    eyebrow: "Sources and servers",
    title: "Every source has a page",
    body: "Private Server Digs are organized by blocks mined, player count, source logo, and ranked player totals.",
    icon: Server,
    to: "/leaderboard/private-server-digs",
    cta: "Browse sources",
  },
  {
    eyebrow: "Player stats",
    title: "Profiles for the grind",
    body: "Player pages show total blocks, source breakdowns, flags, skins, and enough activity data when it exists.",
    icon: UserRound,
    to: "/leaderboard",
    cta: "Find players",
  },
  {
    eyebrow: "Dashboard access",
    title: "Manage the data safely",
    body: "Dashboard tools keep source moderation, manual corrections, roles, and player flags behind permission checks.",
    icon: FolderKanban,
    to: "/dashboard",
    cta: "Open dashboard",
  },
];

const leaderboardRows = [
  { rank: "01", label: "Digs", value: 250_000_000, accent: "text-primary" },
  { rank: "02", label: "Private Server Digs", value: 375_000_000, accent: "text-stat-cyan" },
  { rank: "03", label: "SSP/HSP", value: 125_000_000, accent: "text-gold" },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      <main className="container space-y-6 py-6 md:py-8">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pixel-card grid-bg overflow-hidden p-5 md:p-8">
          <div className="grid gap-7 xl:grid-cols-[minmax(0,1.02fr)_minmax(360px,0.78fr)] xl:items-stretch">
            <div className="flex min-h-[30rem] flex-col justify-between gap-8">
              <div className="space-y-5">
                <div className="inline-flex w-fit items-center gap-3 border border-primary/35 bg-primary/10 px-3 py-1.5 text-primary">
                  <img src={mmmLogo} alt="MMM logo" className="h-5 w-5 object-contain mix-blend-screen" />
                  <span className="font-pixel text-[9px]">MANUAL MINING MANIACS</span>
                </div>

                <div className="space-y-4">
                  <h1 className="max-w-5xl font-pixel text-[2.15rem] leading-[1.18] text-foreground md:text-5xl xl:text-6xl">
                    Manual mining records,
                    <br />
                    kept clean
                    <span className="animate-blink text-primary">_</span>
                  </h1>
                  <p className="max-w-3xl font-display text-[2rem] leading-none text-foreground/88 md:text-[2.4rem]">
                    MMM tracks serious manual digs, player totals, and source-backed server records in one place.
                  </p>
                  <p className="max-w-2xl text-[10px] leading-[1.9] text-foreground/76">
                    No bloated intro. Open a leaderboard, check a source, or use the dashboard when data needs to be linked, reviewed, or corrected.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link to="/leaderboard">
                    <Button className="font-pixel text-[9px] uppercase tracking-[0.08em]">
                      <Trophy className="mr-1.5 h-3.5 w-3.5" />
                      View Digs
                    </Button>
                  </Link>
                  <Link to="/leaderboard/private-server-digs">
                    <Button variant="outline" className="font-pixel text-[9px] uppercase tracking-[0.08em]">
                      Browse Servers
                      <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  <Link to="/dashboard">
                    <Button variant="ghost" className="font-pixel text-[9px] uppercase tracking-[0.08em]">
                      Open Dashboard
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="pixel-card border-primary/35 bg-primary/5 p-4">
                  <div className="font-pixel text-[8px] text-primary">RECORD TYPE</div>
                  <div className="mt-2 font-pixel text-[13px] text-foreground">Manual</div>
                  <p className="mt-2 text-[8px] leading-[1.7] text-foreground/68">Hand-mined block records only.</p>
                </div>
                <div className="pixel-card p-4">
                  <div className="font-pixel text-[8px] text-muted-foreground">SOURCE STYLE</div>
                  <div className="mt-2 font-pixel text-[13px] text-foreground">Verified</div>
                  <p className="mt-2 text-[8px] leading-[1.7] text-foreground/68">Players stay tied to their server/source.</p>
                </div>
                <div className="pixel-card p-4">
                  <div className="font-pixel text-[8px] text-muted-foreground">ACCESS</div>
                  <div className="mt-2 font-pixel text-[13px] text-foreground">Dashboard</div>
                  <p className="mt-2 text-[8px] leading-[1.7] text-foreground/68">Admin tools live behind login.</p>
                </div>
              </div>
            </div>

            <aside className="pixel-card relative flex min-h-[30rem] flex-col justify-between overflow-hidden border-primary/20 p-4 md:p-5">
              <div className="absolute -right-24 -top-24 h-56 w-56 rounded-full bg-primary/18 blur-3xl" />
              <div className="relative space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-pixel text-[8px] text-primary">MMM SNAPSHOT</div>
                    <div className="mt-2 font-pixel text-[13px] text-foreground">Record shell</div>
                  </div>
                  <div className="grid h-12 w-12 place-items-center border border-primary/30 bg-primary/10">
                    <Pickaxe className="h-6 w-6 text-primary" />
                  </div>
                </div>

                <div className="space-y-3">
                  {leaderboardRows.map((row) => (
                    <div key={row.label} className="pixel-card grid grid-cols-[2.5rem_1fr] items-center gap-3 p-3">
                      <div className={`font-pixel text-[10px] ${row.accent}`}>#{row.rank}</div>
                      <div className="min-w-0">
                        <div className="font-pixel text-[10px] text-foreground">{row.label}</div>
                        <BlocksMinedValue value={row.value} className="mt-1 block font-pixel text-[12px]">
                          {row.value.toLocaleString()}
                        </BlocksMinedValue>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative mt-5 border-t border-border pt-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <Link to="/milestones" className="pixel-card group flex items-center justify-between gap-3 p-3 transition-colors hover:border-primary/45">
                    <span className="font-pixel text-[8px] text-foreground">Milestones</span>
                    <ArrowUpRight className="h-4 w-4 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                  <Link to="/dashboard" className="pixel-card group flex items-center justify-between gap-3 p-3 transition-colors hover:border-primary/45">
                    <span className="font-pixel text-[8px] text-foreground">Dashboard</span>
                    <ArrowUpRight className="h-4 w-4 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </motion.section>

        <motion.section variants={stagger} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {overviewCards.map((card) => (
            <motion.div key={card.label} variants={fadeUp} className="h-full">
              <GlassCard className="grid h-full min-h-[8rem] grid-rows-[auto_1fr_auto] p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-pixel text-[8px] leading-[1.5] text-muted-foreground">{card.label}</span>
                  <card.icon className="h-4 w-4 shrink-0 text-primary/70" />
                </div>
                <div className="flex items-end font-pixel text-xl text-foreground md:text-2xl">{card.value}</div>
                <div className="text-[8px] leading-[1.65] text-foreground/68">{card.detail}</div>
              </GlassCard>
            </motion.div>
          ))}
        </motion.section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <GlassCard className="h-full p-5 md:p-6">
            <div className="mb-5 flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-primary" />
              <div>
                <div className="font-pixel text-[8px] text-primary">WHAT MMM IS</div>
                <h2 className="mt-1 font-pixel text-[13px] text-foreground">A record room for manual miners</h2>
              </div>
            </div>
            <p className="max-w-2xl text-[10px] leading-[1.9] text-foreground/76">
              MMM keeps manual mining totals clear: who mined the blocks, where the source came from, and how the ranking changes across Digs, Private Server Digs, and SSP/HSP.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {["Source-backed totals", "Player profile breakdowns", "Server logo cards", "Milestone history"].map((item) => (
                <div key={item} className="pixel-card p-3 font-pixel text-[8px] text-foreground">
                  {item}
                </div>
              ))}
            </div>
          </GlassCard>

          <div className="grid gap-4 sm:grid-cols-2">
            {sections.slice(1, 3).map((section) => (
              <Link key={section.title} to={section.to} className="pixel-card group flex min-h-[15rem] flex-col justify-between p-5 transition-colors hover:border-primary/45">
                <div>
                  <section.icon className="mb-4 h-5 w-5 text-primary" />
                  <div className="font-pixel text-[8px] text-primary">{section.eyebrow.toUpperCase()}</div>
                  <h3 className="mt-3 font-pixel text-[13px] leading-[1.45] text-foreground">{section.title}</h3>
                  <p className="mt-3 text-[9px] leading-[1.85] text-foreground/70">{section.body}</p>
                </div>
                <span className="mt-5 inline-flex items-center gap-2 font-pixel text-[8px] text-primary">
                  {section.cta}
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {sections.slice(3).map((section) => (
            <Link key={section.title} to={section.to} className="pixel-card group flex min-h-[14rem] flex-col justify-between p-5 transition-colors hover:border-primary/45">
              <div>
                <section.icon className="mb-4 h-5 w-5 text-primary" />
                <div className="font-pixel text-[8px] text-primary">{section.eyebrow.toUpperCase()}</div>
                <h3 className="mt-3 font-pixel text-[13px] leading-[1.45] text-foreground">{section.title}</h3>
                <p className="mt-3 text-[9px] leading-[1.85] text-foreground/70">{section.body}</p>
              </div>
              <span className="mt-5 inline-flex items-center gap-2 font-pixel text-[8px] text-primary">
                {section.cta}
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
          <GlassCard className="flex min-h-[14rem] flex-col justify-between p-5">
            <div>
              <Pickaxe className="mb-4 h-5 w-5 text-primary" />
              <div className="font-pixel text-[8px] text-primary">MANUAL RECORDS</div>
              <h3 className="mt-3 font-pixel text-[13px] leading-[1.45] text-foreground">Built around blocks mined</h3>
              <p className="mt-3 text-[9px] leading-[1.85] text-foreground/70">
                Block counts keep the same color rules used across the leaderboard so big numbers stay readable at a glance.
              </p>
            </div>
            <BlocksMinedValue value={128_707_897} className="mt-5 block font-pixel text-xl">
              128,707,897
            </BlocksMinedValue>
          </GlassCard>
        </section>

        <section className="pixel-card grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
          <div>
            <div className="font-pixel text-[8px] text-primary">DASHBOARD ACCESS</div>
            <h2 className="mt-3 font-pixel text-2xl leading-tight text-foreground md:text-3xl">Need to review or correct data?</h2>
            <p className="mt-3 max-w-3xl text-[10px] leading-[1.9] text-foreground/72">
              Use the dashboard for source moderation, manual edits, player flags, role management, and account linking from the AeTweaks mod.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Link to="/dashboard">
              <Button className="font-pixel text-[9px] uppercase tracking-[0.08em]">Open Dashboard</Button>
            </Link>
            <Link to="/leaderboard">
              <Button variant="outline" className="font-pixel text-[9px] uppercase tracking-[0.08em]">
                Back to Digs
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="container mt-10 border-t border-border py-10">
        <div className="flex flex-col items-center justify-between gap-3 font-pixel text-[9px] text-muted-foreground md:flex-row">
          <span>MMM // MANUAL MINING MANIACS</span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse bg-stat-green" />
            LIVE SITE
          </span>
        </div>
      </footer>
    </div>
  );
}
