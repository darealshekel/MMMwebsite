import { SlidersHorizontal, X, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { LeaderboardDirectoryControls } from "@/components/leaderboard/LeaderboardDirectoryControls";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { PlayerAvatar } from "@/components/leaderboard/PlayerAvatar";
import { PlayerFlag } from "@/components/leaderboard/PlayerFlag";
import { SourceTabs } from "@/components/leaderboard/SourceTabs";
import { TopMinersPodium, TopStatsRow } from "@/components/leaderboard/TopMinersPodium";
import { fetchSpecialLeaderboardSummary } from "@/lib/leaderboard-repository";

function formatTimeAgo(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function SSPHSPLeaderboard() {
  const [query, setQuery] = useState("");
  const [minBlocks, setMinBlocks] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const summaryQuery = useQuery({
    queryKey: ["special-leaderboard", "ssp-hsp", "summary"],
    queryFn: () => fetchSpecialLeaderboardSummary("ssp-hsp", { page: 1, pageSize: 20 }),
    staleTime: 0,
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["special-leaderboard", "ssp-hsp", page, pageSize, query, minBlocks],
    queryFn: () => fetchSpecialLeaderboardSummary("ssp-hsp", { page, pageSize, query, minBlocks }),
    staleTime: 0,
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  useEffect(() => {
    setPage(1);
  }, [query, minBlocks, pageSize]);

  const summaryData = summaryQuery.data ?? data;
  const rows = data?.rows ?? [];
  const topMiner = summaryData?.featuredRows?.[0]?.username ?? "Waiting...";

  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      <main className="container py-6 md:py-8 space-y-6">
        <SourceTabs
          publicSources={[]}
          activeSourceSlug={null}
          activeDirectory="ssp-hsp"
          ssphspIcons={summaryData?.icons ?? null}
        />

        <section className="pixel-card border border-border p-6 md:p-8 grid-bg">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10 animate-fade-in">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary">
                {summaryData?.icons?.ssp ? <img src={summaryData.icons.ssp} alt="SSP icon" className="h-4 w-4 object-contain" /> : null}
                {summaryData?.icons?.hsp ? <img src={summaryData.icons.hsp} alt="HSP icon" className="h-4 w-4 object-contain" /> : null}
                <span className="font-pixel text-[9px]">SSP/HSP</span>
              </div>
              <h1 className="font-pixel text-3xl md:text-5xl text-foreground leading-tight">
                SSP/HSP
                <span className="text-primary animate-blink">_</span>
              </h1>
              <p className="font-display text-2xl text-muted-foreground max-w-2xl leading-tight">
                {summaryData?.description ?? "Single Player Survival + Hardcore digs from the MMM spreadsheet."}
              </p>
            </div>

            <TopStatsRow
              topMiner={topMiner}
              players={summaryData?.playerCount ?? 0}
              totalBlocks={summaryData?.totalBlocks ?? 0}
            />
          </div>

          <TopMinersPodium rows={summaryData?.featuredRows ?? []} countLabel="WORLDS" />
        </section>

        <section className="space-y-5">
          <h2 className="font-pixel text-2xl md:text-3xl">
            Player Rankings
            <span className="text-primary animate-blink">_</span>
          </h2>

          <LeaderboardDirectoryControls
            query={query}
            onQueryChange={setQuery}
            placeholder="SEARCH PLAYER"
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            currentPage={data?.page ?? 1}
            totalPages={data?.totalPages ?? 1}
            onPageChange={setPage}
            totalItems={data?.totalRows ?? rows.length}
            itemLabel={(data?.totalRows ?? rows.length) === 1 ? "Player" : "Players"}
            actions={
              <>
                <div className="flex items-center gap-3 px-4 py-3 bg-card border border-border">
                  <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
                  <span className="font-pixel text-[10px] text-muted-foreground whitespace-nowrap">MIN BLOCKS</span>
                  <input
                    type="number"
                    value={minBlocks || ""}
                    onChange={(e) => setMinBlocks(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-24 bg-transparent font-pixel text-[10px] focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => {
                    setQuery("");
                    setMinBlocks(0);
                  }}
                  className="flex items-center gap-2 px-4 py-3 bg-card border border-border font-pixel text-[10px] hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  CLEAR
                </button>
              </>
            }
          />

          {error ? (
            <div className="py-16 text-center font-pixel text-[10px] text-muted-foreground border border-dashed border-border">
              SSP/HSP LEADERBOARD UNAVAILABLE
            </div>
          ) : isLoading ? (
            <div className="py-16 text-center font-pixel text-[10px] text-muted-foreground border border-dashed border-border">
              LOADING PLAYERS
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center font-pixel text-[10px] text-muted-foreground border border-dashed border-border">
              NO PLAYERS FOUND
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {rows.map((player) => {
                const top3 = player.rank <= 3;
                return (
                  <Link
                    key={player.rowKey ?? player.username}
                    to={`/player/${encodeURIComponent(player.username.toLowerCase())}`}
                    className="group flex items-center gap-4 px-4 py-3.5 bg-card border border-border hover:border-primary/40 hover:bg-card/80 transition-all text-left"
                  >
                    <div className={`font-pixel text-sm w-10 ${top3 ? "text-primary text-glow-primary" : "text-muted-foreground"}`}>
                      #{player.rank}
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <PlayerFlag username={player.username} flagUrl={player.playerFlagUrl} />
                      <div className="w-10 h-10 grid place-items-center bg-secondary border border-border overflow-hidden">
                        <PlayerAvatar username={player.username} skinFaceUrl={player.skinFaceUrl} className="w-full h-full border-0 bg-transparent" fallbackClassName="text-[10px]" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 self-stretch flex flex-col justify-center">
                      <div className="font-pixel text-xs leading-[1.35] text-foreground break-words [overflow-wrap:anywhere]">{player.username}</div>
                      <div className="font-pixel text-[8px] leading-[1.45] text-muted-foreground mt-1">
                        {formatTimeAgo(player.lastUpdated)} • {player.sourceCount} {player.sourceCount === 1 ? "world" : "worlds"} tracked
                      </div>
                    </div>

                    <div className="min-w-[8.5rem] text-right shrink-0">
                      <BlocksMinedValue as="div" value={player.blocksMined} className="font-pixel text-xs leading-[1.3]">
                        {player.blocksMined.toLocaleString()}
                      </BlocksMinedValue>
                      <div className="font-pixel text-[8px] text-muted-foreground mt-1 tracking-widest">BLOCKS MINED</div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </Link>
                );
              })}
            </div>
          )}

        </section>
      </main>
    </div>
  );
}
