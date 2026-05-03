import { motion } from "framer-motion";
import { useCallback, useEffect, useRef } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, Server, Trophy } from "lucide-react";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { Footer } from "@/components/Footer";
import { GlassCard } from "@/components/GlassCard";
import { HeroBackground } from "@/components/HeroBackground";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { PlayerAvatar } from "@/components/leaderboard/PlayerAvatar";
import { SkeletonCardGrid, SkeletonLeaderboardRows } from "@/components/Skeleton";
import { CartoonButton } from "@/components/ui/cartoon-button";
import { fetchLandingSummary } from "@/lib/leaderboard-repository";
import { useSubscriberRoles, subscriberRoleClass } from "@/hooks/useSubscriberRoles";
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

const rankCardTones = [
  {
    background: "var(--gradient-gold)",
    hoverBorder: "hsl(var(--gold) / 0.78)",
    hoverShadow: "hsl(var(--gold) / 0.88)",
  },
  {
    background: "var(--gradient-silver)",
    hoverBorder: "hsl(var(--silver) / 0.72)",
    hoverShadow: "hsl(var(--silver) / 0.82)",
  },
  {
    background: "var(--gradient-bronze)",
    hoverBorder: "hsl(var(--bronze) / 0.76)",
    hoverShadow: "hsl(var(--bronze) / 0.84)",
  },
] as const;

const playerRankCardTones = [
  {
    ...rankCardTones[0],
    background: "linear-gradient(90deg, hsl(47 88% 39%) 0%, hsl(38 76% 23%) 54%, hsl(31 66% 13%) 100%)",
  },
  {
    ...rankCardTones[1],
    background: "linear-gradient(90deg, hsl(220 13% 46%) 0%, hsl(220 10% 25%) 56%, hsl(225 10% 12%) 100%)",
  },
  {
    ...rankCardTones[2],
    background: "linear-gradient(90deg, hsl(22 60% 28%) 0%, hsl(20 54% 20%) 54%, hsl(18 45% 14%) 100%)",
  },
] as const;

function rankCardStyle(index: number): CSSProperties {
  const tone = rankCardTones[index] ?? rankCardTones[0];
  return {
    background: tone.background,
    "--podium-hover-border": tone.hoverBorder,
    "--podium-hover-shadow": tone.hoverShadow,
  } as CSSProperties;
}

function playerRankCardStyle(index: number): CSSProperties {
  const tone = playerRankCardTones[index] ?? playerRankCardTones[0];
  return {
    background: tone.background,
    "--podium-hover-border": tone.hoverBorder,
    "--podium-hover-shadow": tone.hoverShadow,
  } as CSSProperties;
}

const rankingCardClass =
  "group relative overflow-hidden border border-border transition-[transform,filter,box-shadow,border-color] duration-300 ease-out hover:-translate-y-2 hover:scale-[1.015] hover:border-[var(--podium-hover-border)] hover:brightness-110 hover:shadow-[0_22px_58px_-32px_var(--podium-hover-shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

const playerRankWidthClasses = ["w-full", "w-full sm:w-[94%]", "w-full sm:w-[88%]"] as const;

function RankingCardEffects({ background, champion = false }: { background: string; champion?: boolean }) {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-[0.35]"
        style={{ background, mixBlendMode: "screen" }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-[1] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: "linear-gradient(120deg, transparent 16%, hsl(0 0% 100% / 0.11) 46%, transparent 74%)",
          mixBlendMode: "screen",
        }}
      />
      {champion && (
        <>
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-2/3 opacity-55"
            style={{ background: "radial-gradient(ellipse at top, hsl(var(--gold) / 0.36), transparent 70%)" }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 -inset-x-1/2 z-[1] animate-spotlight-sweep"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, hsl(var(--gold) / 0.45) 45%, hsl(0 0% 100% / 0.35) 50%, hsl(var(--gold) / 0.45) 55%, transparent 100%)",
              mixBlendMode: "screen",
            }}
          />
        </>
      )}
    </>
  );
}

export default function Index() {
  const heroCursorFrame = useRef<number | null>(null);
  const heroCursorState = useRef<{ target: HTMLElement | null; x: number; y: number }>({
    target: null,
    x: 0,
    y: 0,
  });
  const landingQuery = useQuery({
    queryKey: ["landing-summary"],
    queryFn: fetchLandingSummary,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const { data: subscriberRoles } = useSubscriberRoles();

  const topPlayers = landingQuery.data?.featuredRows ?? [];
  const topSources = landingQuery.data?.topSources ?? [];
  const updateHeroCursor = useCallback((event: PointerEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    heroCursorState.current = {
      target,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    if (heroCursorFrame.current !== null) return;
    heroCursorFrame.current = window.requestAnimationFrame(() => {
      const { target: section, x, y } = heroCursorState.current;
      if (section) {
        section.style.setProperty("--hero-cursor-x", `${x}px`);
        section.style.setProperty("--hero-cursor-y", `${y}px`);
      }
      heroCursorFrame.current = null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (heroCursorFrame.current !== null) {
        window.cancelAnimationFrame(heroCursorFrame.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      {/* Hero */}
      <section
        className="hero-grid-zone relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background"
        onPointerMove={updateHeroCursor}
        style={{ "--hero-cursor-x": "50%", "--hero-cursor-y": "42%" } as CSSProperties}
      >
        <HeroBackground />

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

          <p className="font-display max-w-2xl text-2xl leading-tight text-foreground/70 md:text-3xl">
            Hand-mined blocks records. A place to show your love for mining tens of millions of blocks by hand.
          </p>

          <p className="font-pixel text-[8px] tracking-[0.22em] text-muted-foreground">
            BY: IKTSOI, ANT, NEAR, SHEKEL AND SHERON
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <CartoonButton asChild variant="primary">
              <Link to="/leaderboard">
                <Trophy className="h-3.5 w-3.5" />
                View Leaderboard
              </Link>
            </CartoonButton>
            <CartoonButton asChild variant="secondary">
              <Link to="/leaderboard/private-server-digs">
                Browse Sources
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </CartoonButton>
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
          <GlassCard className="mx-auto max-w-[720px] px-8 py-7 text-center md:px-10">
            <div className="mb-4 font-pixel text-[7px] leading-none tracking-[0.08em] text-primary">WHAT IS MMM</div>
            <h2 className="mb-4 whitespace-nowrap font-pixel text-[13px] leading-[1.35] text-foreground md:text-[17px]">
              The home for hand-mined block records
            </h2>
            <p className="mx-auto max-w-[600px] font-pixel text-[10px] leading-[1.55] text-[#A8A8A8]">
              MMM is the best place to track all the hand-mined blocks by every person, learn, compete. Rankings stay clean, compete fairly. Submit now and MINE YOUR WAY UP!
            </p>
          </GlassCard>
        </motion.section>

        {/* Top Dig Players */}
        <section className="pixel-card mmm-grid-header border border-border p-6 md:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <div className="font-pixel text-[8px] text-primary mb-1">RANKINGS</div>
              <h2 className="font-pixel text-xl text-foreground">Top Dig Players</h2>
            </div>
            <Link to="/leaderboard" className="font-pixel text-[8px] text-primary flex items-center gap-1">
              VIEW ALL <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {landingQuery.isLoading ? (
            <SkeletonLeaderboardRows count={3} className="lg:grid-cols-1" />
          ) : landingQuery.error ? (
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
              {topPlayers.slice(0, 3).map((player, index) => {
                const tone = playerRankCardTones[index] ?? playerRankCardTones[0];
                return (
                <motion.div
                  key={player.rowKey ?? player.username}
                  variants={fadeUp}
                  transition={{ duration: 0.35 }}
                  className={playerRankWidthClasses[index] ?? "w-full"}
                >
                  <Link
                    to={`/player/${encodeURIComponent(player.username.toLowerCase())}`}
                    className={`${rankingCardClass} flex items-center gap-4 p-4 ${index === 0 ? "animate-champion-glow shadow-[0_0_60px_-10px_hsl(var(--gold)/0.55)]" : ""}`}
                    style={playerRankCardStyle(index)}
                  >
                    <RankingCardEffects background={tone.background} champion={index === 0} />
                    <span className="relative z-[2] w-8 font-pixel text-[10px] text-foreground/80 shrink-0">#{player.rank}</span>
                    <div className="relative z-[2] h-10 w-10 shrink-0 overflow-hidden border border-foreground/15 bg-background/20">
                      <PlayerAvatar
                        username={player.username}
                        uuid={player.playerId}
                        skinFaceUrl={player.skinFaceUrl}
                        render="bust"
                        className="h-full w-full border-0 bg-transparent"
                        fallbackClassName="text-[9px]"
                      />
                    </div>
                    <div className="relative z-[2] min-w-0 flex-1">
                      <div className={`truncate font-pixel text-[10px] ${subscriberRoleClass(subscriberRoles?.[player.username.toLowerCase()] as "supporter" | "supporter_plus" | null | undefined) || "text-foreground"}`}>{player.username}</div>
                    </div>
                    <BlocksMinedValue
                      value={player.blocksMined}
                      className="relative z-[2] max-w-[9.5rem] shrink-0 text-right font-pixel text-[9px] leading-[1.45] sm:text-[10px]"
                    >
                      <span>{player.blocksMined.toLocaleString().replace(/,/g, ",\u200B")}</span>{" "}
                      <span className="text-[#CCCCCC]">Blocks Mined</span>
                    </BlocksMinedValue>
                  </Link>
                </motion.div>
                );
              })}
            </motion.div>
          )}
        </section>

        {/* Largest Servers */}
        <section className="pixel-card mmm-grid-header border border-border p-6 md:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <div className="font-pixel text-[8px] text-primary mb-1">SOURCES</div>
              <h2 className="font-pixel text-xl text-foreground">Largest Servers</h2>
            </div>
            <Link to="/leaderboard/private-server-digs" className="font-pixel text-[8px] text-primary flex items-center gap-1">
              VIEW ALL <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {landingQuery.isLoading ? (
            <SkeletonCardGrid count={3} className="sm:grid-cols-3 lg:grid-cols-3" />
          ) : landingQuery.error ? (
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
              {topSources.map((source, index) => {
                const tone = rankCardTones[index] ?? rankCardTones[0];
                return (
                <motion.div key={source.id} variants={fadeUp} transition={{ duration: 0.35 }}>
                  <Link
                    to={`/leaderboard/${source.slug}`}
                    className={`${rankingCardClass} flex h-full flex-col gap-4 p-5`}
                    style={rankCardStyle(index)}
                  >
                    <RankingCardEffects background={tone.background} champion={index === 0} />
                    <div className="relative z-[2] flex items-center gap-3">
                      <span className="font-pixel text-[8px] text-foreground/80">#{index + 1}</span>
                      <div className="h-10 w-10 flex items-center justify-center overflow-hidden shrink-0 border border-foreground/15 bg-background/20">
                        {source.logoUrl ? (
                          <img src={source.logoUrl} alt={`${source.displayName} logo`} className="h-10 w-auto max-w-10 object-contain" />
                        ) : (
                          <Server className="h-5 w-5 text-primary" strokeWidth={2.5} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-pixel text-[9px] text-foreground">{source.displayName}</div>
                        <div className="font-pixel text-[7px] text-[#CCCCCC] mt-1">{source.playerCount ?? 0} players</div>
                      </div>
                    </div>
                    <BlocksMinedValue
                      value={source.totalBlocks ?? 0}
                      className="relative z-[2] mt-auto font-pixel text-[9px] leading-[1.45] sm:text-[10px]"
                    >
                      <span>{(source.totalBlocks ?? 0).toLocaleString().replace(/,/g, ",\u200B")}</span>{" "}
                      <span className="text-[#CCCCCC]">Blocks Mined</span>
                    </BlocksMinedValue>
                  </Link>
                </motion.div>
                );
              })}
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
                <GlassCard className="flex h-full min-h-[174px] flex-col gap-4 px-4 py-4 text-left md:px-5">
                  <div className="font-pixel text-[20px] leading-none text-primary">{reg.number}</div>
                  <div className="font-pixel text-[10px] leading-[1.45] text-foreground">{reg.title}</div>
                  <p className="font-pixel text-[9px] leading-[1.55] text-[#9E9E9E] flex-1">{reg.body}</p>
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
