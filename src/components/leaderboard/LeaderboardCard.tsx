import { ChevronRight } from "lucide-react";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { PlayerAvatar } from "@/components/leaderboard/PlayerAvatar";
import { PlayerFlag } from "@/components/leaderboard/PlayerFlag";
import { cn } from "@/lib/utils";
import type { LeaderboardRowSummary } from "@/lib/types";

function formatTimeAgo(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function LeaderboardCard({ row, highlighted = false }: { row: LeaderboardRowSummary; highlighted?: boolean }) {
  const detailLabel = row.viewKind === "global"
    ? `${row.sourceCount} ${row.sourceCount === 1 ? "place" : "places"} tracked`
    : row.sourceServer;

  return (
    <div
      className={cn(
        "interactive-card group flex items-center gap-4 border border-border bg-card px-4 py-3.5 text-left transition-all duration-200 hover:border-primary/40 hover:bg-card/80",
        highlighted && "border-primary/35 bg-primary/[0.06]",
      )}
    >
        <div className={cn(
          "font-pixel w-10 text-sm",
          row.rank <= 3 ? "text-primary" : "text-muted-foreground"
        )}>
          #{row.rank}
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <PlayerFlag username={row.username} flagUrl={row.playerFlagUrl} />
          <PlayerAvatar username={row.username} skinFaceUrl={row.skinFaceUrl} className="h-10 w-10" fallbackClassName="text-[10px]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[10px] leading-[1.45] text-foreground break-words [overflow-wrap:anywhere]">{row.username}</div>
          <div className="mt-1 text-[8px] leading-[1.55] text-muted-foreground">{formatTimeAgo(row.lastUpdated)} • {detailLabel}</div>
        </div>

        <div className="min-w-[8.5rem] shrink-0 text-right">
          <BlocksMinedValue as="div" value={row.blocksMined} className="text-[10px] leading-[1.35]">
            {row.blocksMined.toLocaleString()}
          </BlocksMinedValue>
          <div className="mt-1 text-[8px] uppercase tracking-[0.12em] leading-[1.35] text-muted-foreground">Blocks Mined</div>
        </div>

        <ChevronRight className="h-4 w-4 text-muted-foreground transition-all duration-300 group-hover:translate-x-1 group-hover:text-primary" />
    </div>
  );
}
