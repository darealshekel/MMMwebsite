import type { LeaderboardRowSummary } from "@/lib/types";
import { LeaderboardCard } from "@/components/leaderboard/LeaderboardCard";

export function LeaderboardGrid({
  rows,
  highlightedPlayer,
}: {
  rows: LeaderboardRowSummary[];
  highlightedPlayer?: string | null;
}) {
  const normalizedHighlighted = highlightedPlayer?.trim().toLowerCase() ?? "";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rows.map((row) => (
        <LeaderboardCard
          key={`${row.sourceServer}-${row.username}-${row.rank}`}
          row={row}
          highlighted={normalizedHighlighted !== "" && row.username.toLowerCase() === normalizedHighlighted}
        />
      ))}
    </div>
  );
}
