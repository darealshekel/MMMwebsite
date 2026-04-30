import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calendar, Clock, Layers, Pickaxe, Trophy } from "lucide-react";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { Footer } from "@/components/Footer";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { PlayerFlag } from "@/components/leaderboard/PlayerFlag";
import { SkeletonProfile } from "@/components/Skeleton";
import { Sparkline } from "@/components/leaderboard/Sparkline";
import { fetchPlayerDetail } from "@/lib/leaderboard-repository";
import { formatNumber, useCountUp } from "@/hooks/useCountUp";
import type { PlayerDetailResponse, PlayerServerStatSummary, PlayerSessionSummary } from "@/lib/types";
import { isSspHspSource } from "../../shared/source-classification.js";
import { getPlayerBadges } from "@/lib/player-badges";

function usePlayerDetail(slug: string) {
  return useQuery({
    queryKey: ["player-detail", slug.toLowerCase()],
    queryFn: () => fetchPlayerDetail(slug),
    enabled: Boolean(slug.trim()),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });
}

export default function PlayerDetail() {
  const { slug = "" } = useParams();
  const { data: player, isLoading } = usePlayerDetail(slug);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <LeaderboardHeader />
        <main className="container py-6 md:py-8">
          <SkeletonProfile />
        </main>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="min-h-screen bg-background">
        <LeaderboardHeader />
        <main className="container py-20 text-center space-y-4">
          <h1 className="font-pixel text-2xl">PLAYER NOT FOUND</h1>
          <Link
            to="/leaderboard"
            className="inline-flex items-center gap-2 font-pixel text-[10px] text-primary hover:underline"
          >
            <ArrowLeft className="w-3 h-3" /> BACK TO LEADERBOARD
          </Link>
        </main>
      </div>
    );
  }

  return <PlayerDetailContent player={player} />;
}

function PlayerDetailContent({
  player,
}: {
  player: PlayerDetailResponse;
}) {
  const totalBlocks = useCountUp(player.blocksNum, { duration: 1800 });
  const hasActivity = player.activity.length > 0;
  const peak = hasActivity ? Math.max(...player.activity) : 0;
  const avg = hasActivity ? Math.round(player.activity.reduce((a, b) => a + b, 0) / player.activity.length) : 0;

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      <main className="container py-6 md:py-8 space-y-6">
        <Link
          to="/leaderboard"
          className="inline-flex items-center gap-2 font-pixel text-[10px] text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> BACK TO LEADERBOARD
        </Link>

        <section className="pixel-card border border-border p-6 md:p-8 grid-bg animate-fade-in">
          <div className="flex flex-col md:flex-row gap-8 items-start md:items-stretch">
            <div
              className="relative w-40 h-40 md:w-48 md:h-auto md:min-h-[17.75rem] grid place-items-center bg-secondary border border-border shrink-0 overflow-hidden md:self-stretch"
              style={{ background: "var(--gradient-card)" }}
            >
              <img
                src={player.avatarUrl}
                alt={player.name}
                className="w-full h-full object-contain md:max-h-[16.5rem]"
                style={{ imageRendering: "pixelated" }}
              />
              <div className="absolute top-2 left-2 px-2 py-1 bg-background/70 border border-border font-pixel text-[9px] text-primary">
                #{player.rank}
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-between space-y-4 md:min-h-[17.75rem]">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary">
                  <Pickaxe className="w-3.5 h-3.5" strokeWidth={2.5} />
                  <span className="font-pixel text-[9px]">SINGLE PLAYER PROFILE</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <PlayerFlag username={player.name} flagUrl={player.playerFlagUrl} className="h-6 w-9 md:h-7 md:w-11" />
                  <h1 className="font-pixel text-3xl md:text-5xl text-foreground leading-tight">
                    {player.name}
                    <span className="text-primary animate-blink">_</span>
                  </h1>
                  {getPlayerBadges(player.name).map((b) => (
                    <img key={b.src} src={b.src} alt={b.label} title={b.label} className="h-16 w-16 object-contain" />
                  ))}
                </div>
                <p className="font-display text-2xl text-muted-foreground max-w-xl leading-tight">
                  {player.bio}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MiniStat label="Total Blocks" value={formatNumber(totalBlocks)} accent />
                <MiniStat label="Servers" value={String(player.places)} />
                <MiniStat label="Joined" value={player.joined} />
                <MiniStat label="Fav Block" value={player.favoriteBlock} />
              </div>
            </div>
          </div>
        </section>

        <section className="pixel-card border border-border p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" strokeWidth={2.5} />
              <h2 className="font-pixel text-sm md:text-base">MINING ACTIVITY · 30D</h2>
            </div>
            {hasActivity ? (
              <div className="flex gap-4 font-pixel text-[9px] text-muted-foreground">
                <span>
                  PEAK <span className="text-stat-green ml-1">{peak}K</span>
                </span>
                <span>
                  AVG <span className="text-stat-cyan ml-1">{avg}K</span>
                </span>
                <span>
                  LAST <span className="text-primary ml-1">{player.activity.at(-1)}K</span>
                </span>
              </div>
            ) : null}
          </div>
          {hasActivity ? (
            <>
              <div className="h-40 md:h-48">
                <Sparkline data={player.activity} />
              </div>
              <div className="mt-3 flex justify-between font-pixel text-[8px] text-muted-foreground">
                <span>30D AGO</span>
                <span>15D AGO</span>
                <span>TODAY</span>
              </div>
            </>
          ) : (
            <div className="grid h-40 place-items-center border border-dashed border-border font-pixel text-[10px] text-muted-foreground md:h-48">
              Not enough data
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="font-pixel text-xl md:text-2xl flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" strokeWidth={2.5} />
            Per-Server Stats<span className="text-primary animate-blink">_</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {player.servers.map((s) => (
              <ServerStatCard key={s.sourceId ?? s.server} {...s} />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-pixel text-xl md:text-2xl flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" strokeWidth={2.5} />
            Recent Sessions<span className="text-primary animate-blink">_</span>
          </h2>
          <div className="border border-border bg-card overflow-hidden">
            <div className="hidden md:grid grid-cols-[1fr_1fr_120px_140px] gap-4 px-4 py-3 border-b border-border bg-secondary font-pixel text-[9px] text-muted-foreground">
              <span>WHEN</span>
              <span>SERVER</span>
              <span>DURATION</span>
              <span className="text-right">BLOCKS</span>
            </div>
            {player.sessions.length === 0 ? (
              <div className="px-4 py-8 text-center font-pixel text-[10px] text-muted-foreground">
                Not enough data
              </div>
            ) : (
              player.sessions.map((s, i) => (
                <div
                  key={i}
                  className="grid grid-cols-2 md:grid-cols-[1fr_1fr_120px_140px] gap-4 px-4 py-3 border-b border-border last:border-b-0 hover:bg-secondary/50 transition-colors"
                >
                  <div className="font-pixel text-[10px] flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-muted-foreground" />
                    {s.date}
                  </div>
                  <div className="font-pixel text-[10px] text-stat-cyan">{s.server}</div>
                  <div className="font-pixel text-[10px] text-muted-foreground">{s.duration}</div>
                  <div className="font-pixel text-[10px] text-stat-green text-right">
                    +{formatNumber(s.blocks)}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

const MiniStat = ({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) => (
  <div
    className={`px-3 py-2.5 border ${
      accent ? "border-primary/40 bg-primary/5" : "border-border bg-card/60"
    }`}
  >
    <div className="font-pixel text-[8px] text-muted-foreground tracking-widest uppercase">
      {label}
    </div>
    <div className={`font-pixel text-xs mt-1 ${accent ? "text-primary" : "text-foreground"}`}>
      {value}
    </div>
  </div>
);

const ServerStatCard = ({
  server,
  sourceSlug,
  logoUrl,
  sourceType,
  sourceCategory,
  sourceScope,
  blocks,
  rank,
  joined,
}: {
  server: string;
  sourceSlug?: string | null;
  logoUrl?: string | null;
  sourceType?: string | null;
  sourceCategory?: string | null;
  sourceScope?: string | null;
  blocks: number;
  rank: number;
  joined: string;
}) => {
  const animated = useCountUp(blocks, { duration: 1400 });
  const top3 = rank <= 3;
  const isSingleplayerWorld = isSspHspSource({ displayName: server, logoUrl, sourceType, sourceCategory, sourceScope });
  const shouldLink = Boolean(sourceSlug) && !isSingleplayerWorld;
  const content = (
    <>
      <div className="flex items-start justify-between mb-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center border border-border bg-secondary/70">
            {logoUrl ? (
              <img src={logoUrl} alt={`${server} logo`} className="h-7 w-7 object-contain" />
            ) : (
              <Layers className="h-4 w-4 text-muted-foreground" strokeWidth={2.5} />
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate font-pixel text-xs text-foreground">{server}</div>
            <div className="font-pixel text-[8px] text-muted-foreground mt-1 tracking-widest">
              JOINED {joined}
            </div>
          </div>
        </div>
        <div
          className={`px-2 py-1 font-pixel text-[9px] border ${
            top3
              ? "bg-primary/10 border-primary/40 text-primary text-glow-primary"
              : "bg-secondary border-border text-muted-foreground"
          }`}
        >
          #{rank}
        </div>
      </div>
      <BlocksMinedValue as="div" value={blocks} className="font-pixel text-lg">
        {formatNumber(animated)}
      </BlocksMinedValue>
      <div className="font-pixel text-[8px] text-muted-foreground tracking-widest mt-1">
        BLOCKS MINED
      </div>
    </>
  );
  const className = shouldLink
    ? "group block p-4 bg-card border border-border hover:border-primary/40 transition-colors"
    : "group p-4 bg-card border border-border transition-colors";

  if (shouldLink && sourceSlug) {
    return (
      <Link to={`/leaderboard/${encodeURIComponent(sourceSlug)}`} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className}>
      {content}
    </div>
  );
};
