import type { LeaderboardRowSummary } from "@/lib/types";
import { LeaderboardGrid } from "@/components/leaderboard/LeaderboardGrid";

export function SourceLeaderboardTable({
  rows,
  highlightedPlayer,
}: {
  rows: LeaderboardRowSummary[];
  highlightedPlayer?: string | null;
}) {
  return <LeaderboardGrid rows={rows} highlightedPlayer={highlightedPlayer} />;
}
