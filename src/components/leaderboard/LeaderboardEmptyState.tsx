import { Pickaxe } from "lucide-react";

export function LeaderboardEmptyState({
  hasFilters,
  viewLabel,
}: {
  hasFilters: boolean;
  viewLabel: string;
}) {
  return (
    <div className="rounded-[28px] border border-dashed border-white/10 bg-card/60 px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Pickaxe className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{hasFilters ? "No players match these filters" : `No synced players in ${viewLabel}`}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        {hasFilters
          ? "Try a different name or lower the minimum blocks filter."
          : "AeTweaks will populate this leaderboard automatically as synced server and world data arrives."}
      </p>
    </div>
  );
}
