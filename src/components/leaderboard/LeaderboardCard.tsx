import { ChevronRight } from "lucide-react";
import { PlayerAvatar } from "@/components/leaderboard/PlayerAvatar";
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
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[26px] border border-white/8 bg-card/70 p-4 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:bg-card/80 hover:shadow-[0_26px_80px_rgba(10,18,32,0.45)]",
        highlighted && "border-primary/30 bg-primary/5 shadow-[0_26px_80px_rgba(60,73,115,0.18)]",
      )}
    >
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-sm font-semibold text-primary">
          #{row.rank}
        </div>

        <PlayerAvatar username={row.username} skinFaceUrl={row.skinFaceUrl} className="h-14 w-14 rounded-[18px]" fallbackClassName="rounded-[18px]" />

        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-foreground">{row.username}</div>
          <div className="mt-1 text-sm text-muted-foreground">{formatTimeAgo(row.lastUpdated)} • {row.sourceServer}</div>
        </div>

        <div className="text-right">
          <div className="text-lg font-semibold text-foreground">{row.blocksMined.toLocaleString()}</div>
          <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Blocks mined</div>
        </div>

        <ChevronRight className="h-5 w-5 text-white/30 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary" />
      </div>
    </div>
  );
}
