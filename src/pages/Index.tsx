import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, Pickaxe, Server, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import mmmLogo from "@/assets/mmm-logo.png";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function Index() {
  const { data, isLoading } = useLeaderboard({ pageSize: 5 });

  const topPlayers = data?.rows?.slice(0, 5) ?? [];
  const topSources = [...(data?.publicSources ?? [])]
    .sort((a, b) => (b.totalBlocks ?? 0) - (a.totalBlocks ?? 0))
    .slice(0, 6);

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      <section className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center overflow-hidden px-4 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[80px]"
        />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="relative z-10 flex max-w-2xl flex-col items-center gap-6"
        >
          <img src={mmmLogo} alt="MMM logo" className="h-16 w-16 object-contain opacity-90" />

          <h1 className="font-pixel text-4xl leading-tight text-primary drop-shadow-[0_0_28px_rgba(220,38,38,0.45)] md:text-6xl">
            Manual Mining
            <br />
            Maniacs
          </h1>

          <p className="max-w-lg font-display text-lg leading-relaxed text-foreground/75 md:text-xl">
            A place to show your love for mining tens of millions of blocks by hand.
          </p>

          <p className="font-pixel text-[9px] tracking-[0.22em] text-muted-foreground">
            BY: IKTSOI, NEAR, AND ANT
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/leaderboard">
              <Button className="font-pixel text-[9px] uppercase tracking-widest">
                <Trophy className="mr-2 h-3.5 w-3.5" />
                View Leaderboard
              </Button>
            </Link>
            <Link to="/leaderboard/private-server-digs">
              <Button variant="outline" className="font-pixel text-[9px] uppercase tracking-widest">
                <Server className="mr-2 h-3.5 w-3.5" />
                Browse Sources
              </Button>
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.7 }}
          className="absolute bottom-8 z-10 flex flex-col items-center gap-1.5 text-muted-foreground"
        >
          <span className="font-pixel text-[8px] tracking-[0.18em]">SCROLL</span>
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </motion.div>
      </section>

      <main className="container space-y-20 py-20">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="mx-auto max-w-xl space-y-3 text-center"
        >
          <div className="flex items-center justify-center gap-2">
            <Pickaxe className="h-4 w-4 text-primary" />
            <span className="font-pixel text-[9px] tracking-[0.2em] text-primary">WHAT IS MMM</span>
          </div>
          <p className="text-sm leading-[2] text-foreground/70">
            MMM tracks who mines the most blocks by hand in Minecraft. Browse rankings across Digs,
            Private Server Digs, and SSP/HSP - every record is tied to a real player and a verified source.
          </p>
        </motion.section>

        <section>
          <div className="mb-6 flex items-end justify-between">
            <div>
              <div className="font-pixel text-[9px] tracking-[0.2em] text-primary">RANKINGS</div>
              <h2 className="mt-1 font-pixel text-xl text-foreground">Top Dig Players</h2>
            </div>
            <Link
              to="/leaderboard"
              className="group inline-flex items-center gap-1.5 font-pixel text-[9px] text-primary transition-colors hover:text-primary/75"
            >
              View all
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="space-y-2"
          >
            {isLoading
              ? Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="pixel-card h-16 animate-pulse bg-secondary/30" />
                ))
              : topPlayers.map((player, index) => (
                  <motion.div key={player.username} variants={fadeUp}>
                    <Link
                      to={`/player/${player.username}`}
                      className="pixel-card group flex items-center gap-4 p-4 transition-colors hover:border-primary/45"
                    >
                      <span
                        className={`w-8 shrink-0 font-pixel text-sm ${
                          index < 3 ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        #{index + 1}
                      </span>
                      <span className="flex-1 font-pixel text-[11px] text-foreground">{player.username}</span>
                      <span className="font-pixel text-[11px] tabular-nums text-primary">
                        {player.blocksMined?.toLocaleString()}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary/40 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </motion.div>
                ))}
          </motion.div>
        </section>

        <section>
          <div className="mb-6 flex items-end justify-between">
            <div>
              <div className="font-pixel text-[9px] tracking-[0.2em] text-primary">SERVERS &amp; WORLDS</div>
              <h2 className="mt-1 font-pixel text-xl text-foreground">Largest Sources</h2>
            </div>
            <Link
              to="/leaderboard/private-server-digs"
              className="group inline-flex items-center gap-1.5 font-pixel text-[9px] text-primary transition-colors hover:text-primary/75"
            >
              View all
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="pixel-card h-28 animate-pulse bg-secondary/30" />
                ))
              : topSources.map((source) => (
                  <motion.div key={source.slug} variants={fadeUp}>
                    <Link
                      to={`/leaderboard/${source.slug}`}
                      className="pixel-card group flex h-full min-h-[7rem] flex-col justify-between p-4 transition-colors hover:border-primary/45"
                    >
                      <div className="flex items-center gap-3">
                        {source.logoUrl ? (
                          <img src={source.logoUrl} alt={source.displayName} className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="grid h-8 w-8 shrink-0 place-items-center border border-border bg-secondary/60">
                            <Server className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="font-pixel text-[10px] leading-snug text-foreground">{source.displayName}</span>
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-2">
                        <span className="font-pixel text-[11px] tabular-nums text-primary">
                          {(source.totalBlocks ?? 0).toLocaleString()}
                        </span>
                        <span className="font-pixel text-[8px] text-muted-foreground">
                          {source.playerCount ?? 0} players
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                ))}
          </motion.div>
        </section>
      </main>

      <footer className="container mt-4 border-t border-border py-8">
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
