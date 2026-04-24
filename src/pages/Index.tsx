import { useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Database,
  Flag,
  Gauge,
  Pickaxe,
  Server,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { GlassCard } from "@/components/GlassCard";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { PlayerAvatar } from "@/components/leaderboard/PlayerAvatar";
import { Button } from "@/components/ui/button";
import { fetchLeaderboardSummary, fetchSpecialLeaderboardSummary } from "@/lib/leaderboard-repository";
import type { LeaderboardRowSummary, PublicSourceSummary } from "@/lib/types";
import mmmLogo from "@/assets/mmm-logo.png";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

type ActionCard = {
  eyebrow: string;
  title: string;
  body: string;
  to: string;
  icon: LucideIcon;
};

type ProcessStep = {
  label: string;
  title: string;
  body: string;
  icon: LucideIcon;
};

const fallbackRows: LeaderboardRowSummary[] = [
  {
    playerId: "fallback-aitor",
    username: "AitorTheK1ng",
    skinFaceUrl: "https://minotar.net/avatar/AitorTheK1ng/32",
    lastUpdated: "2026-04-24T00:00:00.000Z",
    blocksMined: 250_000_000,
    totalDigs: 250_000_000,
    rank: 1,
    sourceServer: "Digs",
    sourceKey: "fallback-aitor",
    sourceCount: 2,
    viewKind: "global",
  },
  {
    playerId: "fallback-sheron",
    username: "SheronMan",
    skinFaceUrl: "https://minotar.net/avatar/SheronMan/32",
    lastUpdated: "2026-04-24T00:00:00.000Z",
    blocksMined: 225_000_000,
    totalDigs: 225_000_000,
    rank: 2,
    sourceServer: "Digs",
    sourceKey: "fallback-sheron",
    sourceCount: 1,
    viewKind: "global",
  },
  {
    playerId: "fallback-iktsoi",
    username: "Iktsoi",
    skinFaceUrl: "https://minotar.net/avatar/Iktsoi/32",
    lastUpdated: "2026-04-24T00:00:00.000Z",
    blocksMined: 200_000_000,
    totalDigs: 200_000_000,
    rank: 3,
    sourceServer: "Digs",
    sourceKey: "fallback-iktsoi",
    sourceCount: 1,
    viewKind: "global",
  },
];

const actionCards: ActionCard[] = [
  {
    eyebrow: "Leaderboard",
    title: "Digs",
    body: "The main manual mining ranking. Player totals, flags, skins, source splits, and top-three cards stay consistent with the leaderboard pages.",
    to: "/leaderboard",
    icon: Trophy,
  },
  {
    eyebrow: "Sources",
    title: "Private Server Digs",
    body: "Every server/source gets its own page with a logo, player count, ranked miners, and total blocks mined.",
    to: "/leaderboard/private-server-digs",
    icon: Server,
  },
  {
    eyebrow: "Singleplayer",
    title: "SSP/HSP",
    body: "Survival Single Player and Hardcore Single Player records are separated from server sources but use the same MMM ranking language.",
    to: "/leaderboard/ssp-hsp",
    icon: Pickaxe,
  },
];

const processSteps: ProcessStep[] = [
  {
    label: "01",
    title: "Source-backed totals",
    body: "Records stay attached to the server, world, or singleplayer board they came from.",
    icon: Database,
  },
  {
    label: "02",
    title: "Readable player identity",
    body: "Profiles use skins, flags, source stats, and block color rules so rankings stay scannable.",
    icon: UserRound,
  },
  {
    label: "03",
    title: "Controlled corrections",
    body: "Dashboard tools handle source moderation, manual fixes, roles, and flag updates behind permission checks.",
    icon: ShieldCheck,
  },
];

function formatCompact(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function sortSourcesByBlocks(sources: PublicSourceSummary[]) {
  return [...sources].sort((left, right) => {
    const byBlocks = (right.totalBlocks ?? 0) - (left.totalBlocks ?? 0);
    return byBlocks || left.displayName.localeCompare(right.displayName);
  });
}

export default function Index() {
  const mainQuery = useQuery({
    queryKey: ["landing", "leaderboard", "main"],
    queryFn: () => fetchLeaderboardSummary({ page: 1, pageSize: 3 }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const sspQuery = useQuery({
    queryKey: ["landing", "leaderboard", "ssp-hsp"],
    queryFn: () => fetchSpecialLeaderboardSummary("ssp-hsp", { page: 1, pageSize: 3 }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const topPlayers = mainQuery.data?.featuredRows?.length ? mainQuery.data.featuredRows : fallbackRows;
  const sortedSources = useMemo(() => sortSourcesByBlocks(mainQuery.data?.publicSources ?? []), [mainQuery.data?.publicSources]);
  const topSources = sortedSources.slice(0, 3);
  const totalSourceBlocks = sortedSources.reduce((sum, source) => sum + (source.totalBlocks ?? 0), 0);
  const totalTrackedBlocks = (mainQuery.data?.totalBlocks ?? 0) + totalSourceBlocks + (sspQuery.data?.totalBlocks ?? 0);
  const totalPlayers = (mainQuery.data?.playerCount ?? 0) + (sspQuery.data?.playerCount ?? 0);

  const stats = [
    {
      label: "Tracked blocks",
      value: totalTrackedBlocks > 0 ? formatCompact(totalTrackedBlocks) : "Live",
      detail: "Across Digs, sources, and SSP/HSP",
      icon: BarChart3,
    },
    {
      label: "Private sources",
      value: sortedSources.length ? sortedSources.length.toLocaleString() : "100+",
      detail: "Organized by blocks mined",
      icon: Server,
    },
    {
      label: "Known players",
      value: totalPlayers > 0 ? totalPlayers.toLocaleString() : "Ranked",
      detail: "Profiles, flags, and source splits",
      icon: UserRound,
    },
    {
      label: "Dashboard",
      value: "Admin",
      detail: "Moderation and manual corrections",
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      <main className="container space-y-5 py-5 md:space-y-6 md:py-8">
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: "easeOut" }}
          className="pixel-card grid-bg relative overflow-hidden border-border p-4 md:p-6 xl:p-7"
        >
          <div className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-primary/18 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-24 w-1/2 bg-gradient-to-r from-transparent via-primary/10 to-transparent blur-2xl" />

          <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(390px,0.75fr)] xl:items-stretch">
            <div className="flex min-h-[34rem] flex-col justify-between gap-8">
              <div className="max-w-5xl space-y-6">
                <div className="inline-flex w-fit items-center gap-3 border border-primary/35 bg-primary/10 px-3 py-2 text-primary shadow-[0_0_28px_-18px_hsl(var(--primary))]">
                  <img src={mmmLogo} alt="MMM logo" className="h-5 w-5 object-contain" />
                  <span className="font-pixel text-[8px] leading-none tracking-[0.12em]">MANUAL MINING MANIACS</span>
                </div>

                <div className="space-y-4">
                  <h1 className="max-w-5xl text-balance font-pixel text-[2.3rem] leading-[1.14] text-foreground md:text-[4.2rem] xl:text-[5.2rem]">
                    Manual mining records tied to every source
                    <span className="text-primary animate-blink">_</span>
                  </h1>
                  <p className="max-w-3xl font-display text-[2.1rem] leading-[0.98] text-foreground/88 md:text-[2.75rem]">
                    MMM tracks serious hand-mined block totals, server sources, milestones, and player profiles without mixing the data together.
                  </p>
                  <p className="max-w-2xl text-[9px] leading-[1.9] text-foreground/68 md:text-[10px]">
                    Open the main Digs leaderboard, inspect a private server source, or use the dashboard when records need moderation, flags, or manual corrections.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link to="/leaderboard">
                    <Button className="h-10 font-pixel text-[8px] uppercase tracking-[0.1em] md:text-[9px]">
                      <Trophy className="mr-2 h-3.5 w-3.5" />
                      View Digs
                    </Button>
                  </Link>
                  <Link to="/leaderboard/private-server-digs">
                    <Button variant="outline" className="h-10 font-pixel text-[8px] uppercase tracking-[0.1em] md:text-[9px]">
                      Browse Sources
                      <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  <Link to="/dashboard">
                    <Button variant="ghost" className="h-10 font-pixel text-[8px] uppercase tracking-[0.1em] md:text-[9px]">
                      Dashboard
                    </Button>
                  </Link>
                </div>
              </div>

              <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((stat) => (
                  <motion.div key={stat.label} variants={fadeUp} className="pixel-card min-h-[8.2rem] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-pixel text-[8px] leading-[1.55] text-muted-foreground">{stat.label}</span>
                      <stat.icon className="h-4 w-4 shrink-0 text-primary/75" strokeWidth={2.4} />
                    </div>
                    <div className="mt-4 font-pixel text-[1.15rem] leading-tight text-foreground">{stat.value}</div>
                    <div className="mt-2 text-[8px] leading-[1.65] text-foreground/62">{stat.detail}</div>
                  </motion.div>
                ))}
              </motion.div>
            </div>

            <HeroConsole topPlayers={topPlayers} topSources={topSources} loading={mainQuery.isLoading} />
          </div>
        </motion.section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <GlassCard className="relative overflow-hidden p-5 md:p-6">
            <div className="absolute right-0 top-0 h-40 w-40 bg-primary/10 blur-3xl" />
            <div className="relative space-y-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center border border-primary/35 bg-primary/10 text-primary">
                  <Pickaxe className="h-5 w-5" strokeWidth={2.5} />
                </div>
                <div>
                  <div className="font-pixel text-[8px] text-primary">WHAT MMM IS</div>
                  <h2 className="mt-1 font-pixel text-[1.05rem] leading-[1.4] text-foreground">A source-aware record room</h2>
                </div>
              </div>
              <p className="max-w-[62ch] text-[10px] leading-[1.9] text-foreground/72">
                MMM is built for manual Minecraft mining records. The site keeps the top-level rankings clean while preserving where each total came from: singleplayer worlds, hardcore runs, private servers, and source-specific player rows.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {["No source mixing", "Ranked player profiles", "Server logo directory", "Milestone history"].map((item) => (
                  <div key={item} className="border border-border bg-card/55 px-3 py-3 font-pixel text-[8px] text-foreground/82">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {processSteps.map((step) => (
              <div key={step.label} className="pixel-card grid gap-4 p-4 sm:grid-rows-[auto_1fr] lg:grid-cols-[4.5rem_1fr] lg:items-start">
                <div className="flex items-center gap-3 lg:block">
                  <div className="font-pixel text-[10px] text-primary">#{step.label}</div>
                  <div className="mt-0 grid h-10 w-10 place-items-center border border-border bg-secondary text-primary lg:mt-3">
                    <step.icon className="h-4.5 w-4.5" strokeWidth={2.5} />
                  </div>
                </div>
                <div>
                  <h3 className="font-pixel text-[10px] leading-[1.55] text-foreground">{step.title}</h3>
                  <p className="mt-2 text-[8px] leading-[1.75] text-foreground/64">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {actionCards.map((card, index) => (
            <Link
              key={card.title}
              to={card.to}
              className={`pixel-card group relative flex min-h-[18rem] flex-col justify-between overflow-hidden p-5 transition-colors hover:border-primary/45 ${
                index === 0 ? "lg:col-span-1" : ""
              }`}
            >
              <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/10 blur-2xl transition-opacity group-hover:opacity-100" />
              <div className="relative">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div className="font-pixel text-[8px] text-primary">{card.eyebrow.toUpperCase()}</div>
                  <card.icon className="h-5 w-5 text-primary" strokeWidth={2.5} />
                </div>
                <h2 className="font-pixel text-[1.35rem] leading-[1.35] text-foreground">{card.title}</h2>
                <p className="mt-4 text-[9px] leading-[1.85] text-foreground/68">{card.body}</p>
              </div>
              <div className="relative mt-7 flex items-center justify-between border-t border-border pt-4">
                <span className="font-pixel text-[8px] text-foreground/70">OPEN PAGE</span>
                <ArrowUpRight className="h-4 w-4 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <DashboardPreview />

          <GlassCard className="p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-pixel text-[8px] text-primary">ACHIEVEMENTS</div>
                <h2 className="mt-3 font-pixel text-[1.35rem] leading-[1.35] text-foreground">Milestones keep the history visible</h2>
              </div>
              <Sparkles className="h-5 w-5 text-primary" strokeWidth={2.5} />
            </div>

            <div className="mt-6 space-y-3">
              {[
                { label: "Diggy Milestones", value: "250M", name: "AitorTheK1ng", color: "text-primary" },
                { label: "Hardcore", value: "125M", name: "Ant", color: "text-[#e485bf]" },
                { label: "Server Milestones", value: "375M", name: "Dugged", color: "text-[#0000ff]" },
              ].map((milestone) => (
                <Link
                  key={milestone.label}
                  to="/milestones"
                  className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border border-border bg-card/55 p-4 transition-colors hover:border-primary/45"
                >
                  <div className="min-w-0">
                    <div className={`font-pixel text-[8px] ${milestone.color}`}>{milestone.label}</div>
                    <div className="mt-2 truncate font-pixel text-[10px] text-foreground">{milestone.name}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-pixel text-[1rem] ${milestone.color}`}>{milestone.value}</div>
                    <div className="mt-1 font-pixel text-[7px] text-muted-foreground">FIRST TO</div>
                  </div>
                </Link>
              ))}
            </div>

            <Link to="/milestones" className="mt-5 inline-flex items-center gap-2 font-pixel text-[8px] text-primary">
              View all milestones
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </GlassCard>
        </section>

        <section className="pixel-card grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
          <div>
            <div className="font-pixel text-[8px] text-primary">READY</div>
            <h2 className="mt-3 text-balance font-pixel text-[1.55rem] leading-[1.35] text-foreground md:text-[2rem]">
              Pick a leaderboard and start from the data, not the noise.
            </h2>
            <p className="mt-3 max-w-3xl text-[10px] leading-[1.85] text-foreground/66">
              The landing page is only the front door. The records, source pages, and dashboard keep the actual MMM workflow moving.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Link to="/leaderboard">
              <Button className="h-10 font-pixel text-[8px] uppercase tracking-[0.1em]">Open Digs</Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="outline" className="h-10 font-pixel text-[8px] uppercase tracking-[0.1em]">
                Dashboard
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="container mt-8 border-t border-border py-8">
        <div className="flex flex-col items-center justify-between gap-3 font-pixel text-[8px] text-muted-foreground md:flex-row">
          <span>MMM // MANUAL MINING MANIACS</span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse bg-stat-green" />
            LIVE RECORDS
          </span>
        </div>
      </footer>
    </div>
  );
}

function HeroConsole({
  topPlayers,
  topSources,
  loading,
}: {
  topPlayers: LeaderboardRowSummary[];
  topSources: PublicSourceSummary[];
  loading: boolean;
}) {
  return (
    <aside className="pixel-card relative min-h-[34rem] overflow-hidden border-primary/20 p-4 md:p-5">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div className="absolute -left-20 top-1/3 h-52 w-52 rounded-full bg-primary/12 blur-3xl" />
      <div className="relative flex h-full flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-pixel text-[8px] text-primary">LIVE RECORD CONSOLE</div>
            <div className="mt-2 font-pixel text-[12px] text-foreground">Top signals</div>
          </div>
          <div className="grid h-12 w-12 place-items-center border border-primary/30 bg-primary/10">
            <Gauge className="h-6 w-6 text-primary" strokeWidth={2.5} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-pixel text-[8px] text-muted-foreground">TOP DIGS PLAYERS</span>
            <span className="font-pixel text-[7px] text-primary">{loading ? "SYNCING" : "READY"}</span>
          </div>
          {topPlayers.slice(0, 3).map((player) => (
            <Link
              key={player.rowKey ?? player.username}
              to={`/player/${encodeURIComponent(player.username.toLowerCase())}`}
              className="group grid grid-cols-[2.3rem_2.5rem_minmax(0,1fr)] items-center gap-3 border border-border bg-card/70 p-3 transition-colors hover:border-primary/45"
            >
              <span className={player.rank <= 3 ? "font-pixel text-[10px] text-primary" : "font-pixel text-[10px] text-muted-foreground"}>
                #{player.rank}
              </span>
              <div className="grid h-10 w-10 place-items-center overflow-hidden border border-border bg-secondary">
                <PlayerAvatar username={player.username} skinFaceUrl={player.skinFaceUrl} className="h-full w-full border-0 bg-transparent" fallbackClassName="text-[9px]" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-pixel text-[9px] text-foreground">{player.username}</div>
                <BlocksMinedValue value={player.blocksMined} className="mt-1 block font-pixel text-[10px]">
                  {player.blocksMined.toLocaleString()}
                </BlocksMinedValue>
              </div>
            </Link>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          {[
            { label: "Digs", value: topPlayers[0]?.blocksMined ?? 0, icon: Trophy },
            { label: "Sources", value: topSources[0]?.totalBlocks ?? 0, icon: Server },
            { label: "Profiles", value: topPlayers.length + topSources.length, icon: UserRound },
          ].map((item) => (
            <div key={item.label} className="border border-border bg-background/35 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-pixel text-[7px] text-muted-foreground">{item.label.toUpperCase()}</span>
                <item.icon className="h-3 w-3 text-primary" strokeWidth={2.5} />
              </div>
              {item.label === "Profiles" ? (
                <div className="font-pixel text-[10px] text-foreground">{item.value.toLocaleString()} shown</div>
              ) : (
                <BlocksMinedValue value={item.value} className="block font-pixel text-[10px]">
                  {formatCompact(item.value)}
                </BlocksMinedValue>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-pixel text-[8px] text-muted-foreground">LARGEST SOURCES</span>
            <Link to="/leaderboard/private-server-digs" className="font-pixel text-[7px] text-primary">
              VIEW
            </Link>
          </div>
          {topSources.length ? (
            topSources.map((source, index) => (
              <Link
                key={source.id}
                to={`/leaderboard/${source.slug}`}
                className="group grid grid-cols-[2rem_2.5rem_minmax(0,1fr)] items-center gap-3 border border-border bg-card/55 p-3 transition-colors hover:border-primary/45"
              >
                <span className="font-pixel text-[9px] text-muted-foreground">#{index + 1}</span>
                <div className="grid h-10 w-10 place-items-center overflow-hidden">
                  {source.logoUrl ? (
                    <img src={source.logoUrl} alt={`${source.displayName} logo`} className="h-10 w-auto max-w-10 object-contain" />
                  ) : (
                    <Server className="h-5 w-5 text-primary" strokeWidth={2.5} />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-pixel text-[9px] text-foreground">{source.displayName}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <BlocksMinedValue value={source.totalBlocks ?? 0} className="font-pixel text-[9px]">
                      {(source.totalBlocks ?? 0).toLocaleString()}
                    </BlocksMinedValue>
                    <span className="font-pixel text-[7px] text-muted-foreground">{source.playerCount ?? 0}P</span>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="border border-dashed border-border p-4 font-pixel text-[8px] text-muted-foreground">SOURCES LOADING</div>
          )}
        </div>
      </div>
    </aside>
  );
}

function DashboardPreview() {
  return (
    <section className="pixel-card overflow-hidden p-5 md:p-6">
      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="flex flex-col justify-between gap-5">
          <div>
            <div className="font-pixel text-[8px] text-primary">DASHBOARD SHOWCASE</div>
            <h2 className="mt-3 text-balance font-pixel text-[1.45rem] leading-[1.35] text-foreground">
              Admin tools that look like the rest of MMM
            </h2>
            <p className="mt-4 text-[9px] leading-[1.85] text-foreground/66">
              The dashboard is not a separate control panel style. It uses the same cards, borders, small labels, and block-focused data language as the public leaderboards.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {[
              { icon: BadgeCheck, label: "Approve sources" },
              { icon: Flag, label: "Assign flags" },
              { icon: ShieldCheck, label: "Manage roles" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 border border-border bg-card/60 px-3 py-3">
                <item.icon className="h-4 w-4 text-primary" strokeWidth={2.5} />
                <span className="font-pixel text-[8px] text-foreground/78">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-border bg-background/45 p-3">
          <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
            <span className="font-pixel text-[8px] text-muted-foreground">SOURCE MODERATION</span>
            <span className="font-pixel text-[7px] text-stat-green">ONLINE</span>
          </div>
          <div className="space-y-2">
            {[
              { name: "DugRift SMP", state: "APPROVED", blocks: 16_391_223 },
              { name: "Hermitcraft", state: "SYNCED", blocks: 128_707_897 },
              { name: "Phoenix", state: "REVIEWED", blocks: 5_976_552 },
            ].map((row) => (
              <div key={row.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border border-border bg-card/65 px-3 py-3">
                <div className="min-w-0">
                  <div className="truncate font-pixel text-[9px] text-foreground">{row.name}</div>
                  <div className="mt-1 font-pixel text-[7px] text-primary">{row.state}</div>
                </div>
                <BlocksMinedValue value={row.blocks} className="font-pixel text-[9px]">
                  {row.blocks.toLocaleString()}
                </BlocksMinedValue>
              </div>
            ))}
          </div>
          <Link to="/dashboard" className="mt-3 flex items-center justify-between border border-primary/30 bg-primary/10 px-3 py-3 font-pixel text-[8px] text-primary">
            OPEN DASHBOARD
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
