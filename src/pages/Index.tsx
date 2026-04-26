import { useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, Server, Trophy } from "lucide-react";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { Footer } from "@/components/Footer";
import { GlassCard } from "@/components/GlassCard";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { PlayerAvatar } from "@/components/leaderboard/PlayerAvatar";
import { Button } from "@/components/ui/button";
import { fetchLeaderboardSummary, fetchPublicSources } from "@/lib/leaderboard-repository";
import type { PublicSourceSummary } from "@/lib/types";
import mmmNavLogo from "@/assets/mmm-nav-logo.png";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};

const regulations = [
  {
    number: "01",
    title: "Manual Only",
    body: "All blocks must be mined by hand. No macros, auto-clickers, or game-modifying automation of any kind.",
  },
  {
    number: "02",
    title: "Verified Sources",
    body: "Records must be tied to a verified source — a server, world, or SSP/HSP session that has been reviewed and approved.",
  },
  {
    number: "03",
    title: "Accurate Reporting",
    body: "Submit only your own blocks. Inflated totals, duplicate entries, or false attribution will result in removal.",
  },
  {
    number: "04",
    title: "One Identity",
    body: "Each player may have one profile. Alternate accounts used to bypass rules or pad rankings are not allowed.",
  },
];

function sortSourcesByBlocks(sources: PublicSourceSummary[]) {
  return [...sources].sort((a, b) => {
    const diff = (b.totalBlocks ?? 0) - (a.totalBlocks ?? 0);
    return diff || a.displayName.localeCompare(b.displayName);
  });
}

export default function Index() {
  const leaderboardQuery = useQuery({
    queryKey: ["landing", "leaderboard", "main"],
    queryFn: () => fetchLeaderboardSummary({ page: 1, pageSize: 20 }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const sourcesQuery = useQuery({
    queryKey: ["leaderboard-sources"],
    queryFn: fetchPublicSources,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const topPlayers = leaderboardQuery.data?.featuredRows ?? [];
  const topSources = useMemo(() => sortSourcesByBlocks(sourcesQuery.data ?? []).slice(0, 3), [sourcesQuery.data]);

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      {/* Hero */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden grid-bg">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/0 via-background/10 to-background" />
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="relative z-10 flex flex-col items-center gap-6 px-4 text-center"
        >
          <img src={mmmNavLogo} alt="MMM logo" className="h-20 w-20 object-contain" />

          <h1 className="font-pixel text-4xl leading-[1.3] text-primary text-glow-primary md:text-5xl">
            Manual Mining<br />Maniacs
            <span className="animate-blink">_</span>
          </h1>

          <p className="font-display text-2xl leading-snug text-foreground/70 max-w-lg md:text-3xl">
            Hand-mined block records. Every source tracked.
          </p>

          <p className="font-pixel text-[8px] tracking-[0.22em] text-muted-foreground">
            BY: IKTSOI, ANT, SHEKEL AND SHERON
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link to="/leaderboard">
              <Button className="btn-glow h-10 gap-2 font-pixel text-[8px] uppercase tracking-[0.1em]">
                <Trophy className="h-3.5 w-3.5" />
                View Leaderboard
              </Button>
            </Link>
            <Link to="/leaderboard/private-server-digs">
              <Button variant="outline" className="h-10 gap-2 font-pixel text-[8px] uppercase tracking-[0.1em]">
                Browse Sources
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </motion.div>

        <div className="absolute bottom-8 z-10 flex flex-col items-center gap-1 text-muted-foreground">
          <ChevronDown className="h-5 w-5 animate-bounce" />
        </div>
      </section>

      <main className="container space-y-16 py-16">
        {/* About blurb */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.45 }}
        >
          <GlassCard className="mx-auto max-w-3xl p-6 text-center md:p-8">
            <div className="font-pixel text-[8px] text-primary mb-3">WHAT IS MMM</div>
            <h2 className="font-pixel text-lg leading-[1.45] text-foreground mb-4">
              A source-aware record room for serious Minecraft miners
            </h2>
            <p className="text-[10px] leading-[1.9] text-foreground/70 max-w-prose mx-auto">
              MMM tracks hand-mined block totals tied to specific servers, singleplayer worlds, and hardcore runs. Rankings stay clean because sources are never mixed together — every total comes from somewhere verifiable.
            </p>
          </GlassCard>
        </motion.section>

        {/* Top Dig Players */}
        <section>
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <div className="font-pixel text-[8px] text-primary mb-1">RANKINGS</div>
              <h2 className="font-pixel text-xl text-foreground">Top Dig Players</h2>
            </div>
            <Link to="/leaderboard" className="font-pixel text-[8px] text-primary flex items-center gap-1">
              VIEW ALL <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {leaderboardQuery.isLoading ? (
            <div className="pixel-card p-8 text-center font-pixel text-[8px] text-muted-foreground">SYNCING RECORDS...</div>
          ) : leaderboardQuery.error ? (
            <div className="pixel-card p-8 text-center font-pixel text-[8px] text-muted-foreground">LEADERBOARD UNAVAILABLE</div>
          ) : topPlayers.length === 0 ? (
            <div className="pixel-card p-8 text-center font-pixel text-[8px] text-muted-foreground">NO RECORDS YET</div>
          ) : (
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              className="space-y-3"
            >
              {topPlayers.slice(0, 5).map((player) => (
                <motion.div key={player.rowKey ?? player.username} variants={fadeUp} transition={{ duration: 0.35 }}>
                  <Link
                    to={`/player/${encodeURIComponent(player.username.toLowerCase())}`}
                    className="pixel-card group flex items-center gap-4 p-4 transition-colors hover:border-primary/45"
                  >
                    <span className="w-8 font-pixel text-[10px] text-primary shrink-0">#{player.rank}</span>
                    <div className="h-10 w-10 shrink-0 overflow-hidden border border-border">
                      <PlayerAvatar
                        username={player.username}
                        skinFaceUrl={player.skinFaceUrl}
                        className="h-full w-full border-0 bg-transparent"
                        fallbackClassName="text-[9px]"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-pixel text-[10px] text-foreground">{player.username}</div>
                    </div>
                    <BlocksMinedValue value={player.blocksMined} className="font-pixel text-[10px] shrink-0">
                      {player.blocksMined.toLocaleString()}
                    </BlocksMinedValue>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}
        </section>

        {/* Largest Sources */}
        <section>
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <div className="font-pixel text-[8px] text-primary mb-1">SOURCES</div>
              <h2 className="font-pixel text-xl text-foreground">Largest Sources</h2>
            </div>
            <Link to="/leaderboard/private-server-digs" className="font-pixel text-[8px] text-primary flex items-center gap-1">
              VIEW ALL <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {sourcesQuery.isLoading ? (
            <div className="pixel-card p-8 text-center font-pixel text-[8px] text-muted-foreground">LOADING SOURCES...</div>
          ) : sourcesQuery.error ? (
            <div className="pixel-card p-8 text-center font-pixel text-[8px] text-muted-foreground">SOURCES UNAVAILABLE</div>
          ) : topSources.length === 0 ? (
            <div className="pixel-card p-8 text-center font-pixel text-[8px] text-muted-foreground">NO SOURCES YET</div>
          ) : (
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              className="grid gap-4 sm:grid-cols-3"
            >
              {topSources.map((source, index) => (
                <motion.div key={source.id} variants={fadeUp} transition={{ duration: 0.35 }}>
                  <Link
                    to={`/leaderboard/${source.slug}`}
                    className="pixel-card group flex flex-col gap-4 p-5 transition-colors hover:border-primary/45 h-full"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-pixel text-[8px] text-primary">#{index + 1}</span>
                      <div className="h-10 w-10 flex items-center justify-center overflow-hidden shrink-0">
                        {source.logoUrl ? (
                          <img src={source.logoUrl} alt={`${source.displayName} logo`} className="h-10 w-auto max-w-10 object-contain" />
                        ) : (
                          <Server className="h-5 w-5 text-primary" strokeWidth={2.5} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-pixel text-[9px] text-foreground">{source.displayName}</div>
                        <div className="font-pixel text-[7px] text-muted-foreground mt-1">{source.playerCount ?? 0} players</div>
                      </div>
                    </div>
                    <BlocksMinedValue value={source.totalBlocks ?? 0} className="font-pixel text-[10px]">
                      {(source.totalBlocks ?? 0).toLocaleString()} blocks
                    </BlocksMinedValue>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}
        </section>

        {/* Regulations */}
        <section>
          <div className="mb-6 text-center">
            <div className="font-pixel text-[8px] text-primary mb-1">RULES</div>
            <h2 className="font-pixel text-xl text-foreground">Regulations</h2>
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {regulations.map((reg) => (
              <motion.div key={reg.number} variants={fadeUp} transition={{ duration: 0.35 }}>
                <GlassCard className="flex h-full flex-col gap-4 p-5">
                  <div className="font-pixel text-2xl text-primary/30">{reg.number}</div>
                  <div className="font-pixel text-[10px] text-foreground">{reg.title}</div>
                  <p className="text-[9px] leading-[1.85] text-foreground/65 flex-1">{reg.body}</p>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
