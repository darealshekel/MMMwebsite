import { Award, Crown, Database, Medal, Server, Trophy } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { Footer } from "@/components/Footer";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { rankTextColorClass } from "@/components/leaderboard/rank-colors";
import { SkeletonCardGrid } from "@/components/Skeleton";
import { SourceLeaderboardDirectory } from "@/components/leaderboard/SourceLeaderboardDirectory";
import { SourceTabs } from "@/components/leaderboard/SourceTabs";
import { formatNumber, useCountUp } from "@/hooks/useCountUp";
import { fetchPublicSources } from "@/lib/leaderboard-repository";
import type { PublicSourceSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { shouldShowInPrivateServerDigs } from "../../shared/source-classification.js";

const SERVER_DIGS_TEXT_CLASS = "text-[#CCCCCC]";

function withSoftWrapSeparators(value: string) {
  return value.replace(/,/g, ",\u200B");
}

export default function PrivateServerDigs() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["leaderboard-sources"],
    queryFn: fetchPublicSources,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const allSources = data ?? [];
  const sources = allSources.filter(shouldShowInPrivateServerDigs);
  const totalSources = sources.length;
  const totalBlocks = sources.reduce((sum, source) => sum + (source.totalBlocks ?? 0), 0);
  const topSources = [...sources]
    .sort((a, b) => (b.totalBlocks ?? 0) - (a.totalBlocks ?? 0) || a.displayName.localeCompare(b.displayName))
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      <main className="container py-6 md:py-8 space-y-6">
        <SourceTabs publicSources={allSources} activeSourceSlug={null} activeDirectory="private-server-digs" />

        <section className="pixel-card mmm-grid-header border border-border p-6 md:p-8">
          <div className={`flex flex-col lg:flex-row lg:items-end justify-between gap-6 animate-fade-in ${!error && !isLoading && topSources.length ? "mb-10" : ""}`}>
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary">
                <Database className="w-3.5 h-3.5" strokeWidth={2.5} />
                <span className="font-pixel text-[9px]">SERVER DIGS</span>
              </div>
              <h1 className="font-pixel text-3xl md:text-5xl text-foreground leading-tight">
                Server Digs
                <span className="text-primary animate-blink">_</span>
              </h1>
              <p className="font-display text-2xl text-muted-foreground max-w-2xl leading-tight">
                Ranking of all the Servers with the most blocks mined. These are the servers for the best miners!
              </p>
            </div>

            <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)] xl:max-w-[31rem]">
              <div className="flex min-w-0 flex-col gap-1.5 border border-border bg-card/60 px-4 py-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Server className="h-3 w-3" strokeWidth={2.5} />
                  <span className={cn("font-pixel text-[8px] uppercase tracking-wider", SERVER_DIGS_TEXT_CLASS)}>Servers</span>
                </div>
                <span className="font-pixel text-[11px] leading-[1.45] text-foreground tabular-nums">
                  {totalSources.toLocaleString()}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5 border border-border bg-card/60 px-4 py-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Database className="h-3 w-3" strokeWidth={2.5} />
                  <span className={cn("font-pixel text-[8px] uppercase tracking-wider", SERVER_DIGS_TEXT_CLASS)}>Blocks Mined</span>
                </div>
                <span className="font-pixel text-[11px] leading-[1.45] text-foreground tabular-nums whitespace-nowrap">
                  {totalBlocks.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {!error && !isLoading && topSources.length ? <TopSourcePodium sources={topSources} /> : null}
        </section>

        {error ? (
          <div className="py-16 text-center font-pixel text-[10px] text-muted-foreground border border-dashed border-border">
            SERVER DIRECTORY UNAVAILABLE
          </div>
        ) : isLoading ? (
          <SkeletonCardGrid count={6} className="lg:grid-cols-3" />
        ) : (
          <SourceLeaderboardDirectory
            sources={sources}
            title="Server Digs"
          />
        )}
      </main>

      <Footer />
    </div>
  );
}

function TopSourcePodium({ sources }: { sources: PublicSourceSummary[] }) {
  const ordered = [
    sources[1] ? {
      ...sources[1],
      slot: 2,
      label: "SILVER",
      Icon: Medal,
      shell: "var(--gradient-silver)",
      hoverBorder: "hsl(var(--silver) / 0.72)",
      hoverShadow: "hsl(var(--silver) / 0.82)",
      offset: "md:translate-y-6",
    } : null,
    sources[0] ? {
      ...sources[0],
      slot: 1,
      label: "CHAMPION",
      Icon: Crown,
      shell: "var(--gradient-gold)",
      hoverBorder: "hsl(var(--gold) / 0.78)",
      hoverShadow: "hsl(var(--gold) / 0.88)",
      offset: "md:-translate-y-4",
    } : null,
    sources[2] ? {
      ...sources[2],
      slot: 3,
      label: "BRONZE",
      Icon: Award,
      shell: "var(--gradient-bronze)",
      hoverBorder: "hsl(var(--bronze) / 0.76)",
      hoverShadow: "hsl(var(--bronze) / 0.84)",
      offset: "md:translate-y-6",
    } : null,
  ].filter(Boolean) as Array<PublicSourceSummary & {
    slot: number;
    label: string;
    Icon: typeof Crown;
    shell: string;
    hoverBorder: string;
    hoverShadow: string;
    offset: string;
  }>;

  if (!ordered.length) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-3 items-end md:grid-cols-3 md:gap-6">
      {ordered.map((source) => (
        <Link
          key={source.id}
          to={`/leaderboard/${source.slug}`}
          className={`group relative block animate-podium-rise transition-[transform,filter] duration-300 ease-out hover:-translate-y-2 hover:scale-[1.015] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${source.offset}`}
        >
          <div className={source.slot === 1 ? "animate-float-slow" : ""}>
            <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
              <div
                className={`flex items-center gap-1.5 border px-3 py-1.5 font-pixel text-[9px] ${
                  source.slot === 1
                    ? "border-gold-deep bg-gold text-background"
                    : source.slot === 2
                      ? "border-silver-deep bg-silver text-background"
                      : "border-bronze-deep bg-bronze text-background"
                }`}
              >
                <source.Icon className="h-3 w-3" strokeWidth={2.5} />
                {source.label}
              </div>
            </div>

            <div
              className={`relative flex ${source.slot === 1 ? "h-[480px]" : source.slot === 2 ? "h-[440px]" : "h-[420px]"} flex-col items-center justify-end overflow-hidden border border-border p-4 ${
                source.slot === 1 ? "animate-champion-glow shadow-[0_0_60px_-10px_hsl(var(--gold)/0.55)]" : ""
              } transition-[box-shadow,border-color,filter] duration-300 group-hover:border-[var(--podium-hover-border)] group-hover:brightness-110 group-hover:shadow-[0_22px_58px_-32px_var(--podium-hover-shadow)]`}
              style={
                {
                  background: source.shell,
                  "--podium-hover-border": source.hoverBorder,
                  "--podium-hover-shadow": source.hoverShadow,
                } as CSSProperties
              }
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-[0.35]"
                style={{ background: source.shell, mixBlendMode: "screen" }}
              />
              <div
                className="pointer-events-none absolute inset-0 z-[1] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background:
                    "linear-gradient(120deg, transparent 16%, hsl(0 0% 100% / 0.11) 46%, transparent 74%)",
                  mixBlendMode: "screen",
                }}
              />

              {source.slot === 1 ? (
                <>
                  <div
                    className="absolute inset-x-0 top-0 h-2/3 opacity-60 pointer-events-none"
                    style={{ background: "radial-gradient(ellipse at top, hsl(var(--gold) / 0.4), transparent 70%)" }}
                  />
                  <div
                    className="absolute inset-y-0 -inset-x-1/2 pointer-events-none animate-spotlight-sweep"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent 0%, hsl(var(--gold) / 0.45) 45%, hsl(0 0% 100% / 0.35) 50%, hsl(var(--gold) / 0.45) 55%, transparent 100%)",
                      mixBlendMode: "screen",
                    }}
                  />
                </>
              ) : null}

              <div className="relative z-[1] flex w-full flex-1 items-center justify-center py-2">
                {source.logoUrl ? (
                  <img
                    src={source.logoUrl}
                    alt={`${source.displayName} logo`}
                    className={`mx-auto block w-auto object-contain object-center drop-shadow-[0_10px_28px_rgba(0,0,0,0.45)] ${
                      source.slot === 1
                        ? "h-[78%] max-h-[330px] max-w-[90%]"
                        : "h-[62%] max-h-[250px] max-w-[76%]"
                    }`}
                  />
                ) : (
                  <Trophy
                    className={`${source.slot === 1 ? "h-24 w-24" : "h-20 w-20"} text-foreground`}
                    strokeWidth={2.5}
                  />
                )}
              </div>

              <div className="relative z-[1] w-full space-y-1.5 pt-3 text-center">
                <div className={cn("font-pixel text-[10px]", rankTextColorClass(source.slot))}>#{source.slot}</div>
                <div className="mx-auto flex max-w-full items-center justify-center gap-1.5 font-pixel text-[clamp(10px,1.6vw,16px)] leading-[1.3] text-foreground">
                  <span className="min-w-0 truncate whitespace-nowrap">{source.displayName}</span>
                  {source.isDead ? (
                    <span
                      className="shrink-0 text-[0.96rem] leading-none"
                      role="img"
                      aria-label={`${source.displayName} is dead`}
                      title="Dead server"
                    >
                      💀
                    </span>
                  ) : null}
                </div>

                <div>
                  <PodiumBlocksValue value={source.totalBlocks ?? 0} />
                  <div className={cn("mt-0.5 font-pixel text-[8px] uppercase tracking-[0.12em] leading-[1.2]", SERVER_DIGS_TEXT_CLASS)}>
                    Blocks Mined
                  </div>
                </div>

                <div className={cn("inline-block mt-2 border border-foreground/15 bg-background/25 px-2 py-1 font-pixel text-[8px]", SERVER_DIGS_TEXT_CLASS)}>
                  {(source.playerCount ?? 0).toLocaleString()} {(source.playerCount ?? 0) === 1 ? "PLAYER" : "PLAYERS"}
                </div>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function PodiumBlocksValue({ value }: { value: number }) {
  const counted = useCountUp(value, { duration: 2000, delay: 300 });

  return (
    <BlocksMinedValue as="div" value={value} className="font-pixel text-lg leading-[1.2] text-foreground">
      {withSoftWrapSeparators(formatNumber(counted))}
    </BlocksMinedValue>
  );
}
