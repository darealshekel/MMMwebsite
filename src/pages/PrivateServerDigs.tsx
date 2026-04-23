import { Award, Crown, Database, Medal, Server, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { SourceLeaderboardDirectory } from "@/components/leaderboard/SourceLeaderboardDirectory";
import { SourceTabs } from "@/components/leaderboard/SourceTabs";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import { formatNumber, useCountUp } from "@/hooks/useCountUp";
import type { PublicSourceSummary } from "@/lib/types";

function withSoftWrapSeparators(value: string) {
  return value.replace(/,/g, ",\u200B");
}

export default function PrivateServerDigs() {
  const { data, isLoading, error } = useLeaderboard({
    page: 1,
    pageSize: 1,
  });

  const allSources = data?.publicSources ?? [];
  const sources = allSources;
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

        <section className="pixel-card border border-border p-6 md:p-8 grid-bg">
          <div className={`flex flex-col lg:flex-row lg:items-end justify-between gap-6 animate-fade-in ${!error && !isLoading && topSources.length ? "mb-10" : ""}`}>
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary">
                <Database className="w-3.5 h-3.5" strokeWidth={2.5} />
                <span className="font-pixel text-[9px]">PRIVATE SERVER DIGS</span>
              </div>
              <h1 className="font-pixel text-3xl md:text-5xl text-foreground leading-tight">
                Private Server Digs
                <span className="text-primary animate-blink">_</span>
              </h1>
              <p className="font-display text-2xl text-muted-foreground max-w-2xl leading-tight">
                All source leaderboards now live here. Open any source to view the ranked miners mapped to that source identity.
              </p>
            </div>

            <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)] xl:max-w-[31rem]">
              <div className="flex min-w-0 min-h-[84px] flex-col gap-1.5 border border-border bg-card/60 px-4 py-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Server className="h-3 w-3" strokeWidth={2.5} />
                  <span className="font-pixel text-[8px] uppercase tracking-wider">Sources</span>
                </div>
                <span className="font-pixel text-[11px] leading-[1.45] text-foreground tabular-nums">
                  {totalSources.toLocaleString()}
                </span>
              </div>
              <div className="flex min-w-0 min-h-[84px] flex-col gap-1.5 border border-border bg-card/60 px-4 py-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Database className="h-3 w-3" strokeWidth={2.5} />
                  <span className="font-pixel text-[8px] uppercase tracking-wider">Tracked Blocks</span>
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
            SOURCE DIRECTORY UNAVAILABLE
          </div>
        ) : isLoading ? (
          <div className="py-16 text-center font-pixel text-[10px] text-muted-foreground border border-dashed border-border">
            LOADING SOURCES
          </div>
        ) : (
          <SourceLeaderboardDirectory
            sources={sources}
            title="Private Server Digs"
          />
        )}
      </main>

      <footer className="container py-10 mt-10 border-t border-border">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 font-pixel text-[9px] text-muted-foreground">
          <span>MMM // PRIVATE SERVER DIGS</span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-stat-green animate-pulse" />
            LIVE • SYNCED 2 MIN AGO
          </span>
        </div>
      </footer>
    </div>
  );
}

function TopSourcePodium({ sources }: { sources: PublicSourceSummary[] }) {
  const ordered = [
    sources[1] ? { ...sources[1], slot: 2, label: "SILVER", Icon: Medal, shell: "var(--gradient-silver)", offset: "md:translate-y-6" } : null,
    sources[0] ? { ...sources[0], slot: 1, label: "CHAMPION", Icon: Crown, shell: "var(--gradient-gold)", offset: "md:-translate-y-4" } : null,
    sources[2] ? { ...sources[2], slot: 3, label: "BRONZE", Icon: Award, shell: "var(--gradient-bronze)", offset: "md:translate-y-6" } : null,
  ].filter(Boolean) as Array<PublicSourceSummary & {
    slot: number;
    label: string;
    Icon: typeof Crown;
    shell: string;
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
          className={`group relative block animate-podium-rise transition-transform hover:-translate-y-1 ${source.offset}`}
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
              }`}
              style={{ background: source.shell }}
            >
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "linear-gradient(hsl(0 0% 100% / 0.08) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100% / 0.08) 1px, transparent 1px)",
                  backgroundSize: "16px 16px",
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
                <div className="font-pixel text-[10px] text-foreground/70">#{source.slot}</div>
                <div className="flex items-center justify-center gap-1.5 font-pixel text-base leading-[1.3] text-foreground">
                  <span className="break-words [overflow-wrap:anywhere]">{source.displayName}</span>
                  {source.isDead ? (
                    <span
                      className="mt-[0.02rem] shrink-0 text-[0.96rem] leading-none"
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
                  <div className="mt-0.5 font-pixel text-[8px] uppercase tracking-[0.12em] leading-[1.2] text-foreground/70">
                    Tracked Blocks
                  </div>
                </div>

                <div className="inline-block mt-2 border border-foreground/15 bg-background/25 px-2 py-1 font-pixel text-[8px] text-foreground/80">
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
