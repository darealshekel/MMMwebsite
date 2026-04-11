import { useQuery } from "@tanstack/react-query";
import { getMainLeaderboard, getSourceLeaderboard, type LeaderboardRequestOptions } from "@/lib/leaderboards";

export interface UseLeaderboardOptions extends LeaderboardRequestOptions {
  sourceSlug?: string | null;
}

export function useLeaderboard(options: UseLeaderboardOptions) {
  return useQuery({
    queryKey: ["leaderboard", options.sourceSlug ?? "main", options.page ?? 1, options.pageSize ?? 50, options.query ?? "", options.minBlocks ?? 0],
    queryFn: () => options.sourceSlug
      ? getSourceLeaderboard(options.sourceSlug, options.pageSize ?? 50, options)
      : getMainLeaderboard(options.pageSize ?? 50, options),
    staleTime: 4_000,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });
}
