import { useQuery } from "@tanstack/react-query";
import { fetchLeaderboardSummary, type FetchLeaderboardOptions } from "@/lib/leaderboard-repository";

export function useLeaderboard(options: FetchLeaderboardOptions) {
  return useQuery({
    queryKey: ["leaderboard", options.view ?? "global", options.page ?? 1, options.pageSize ?? 50, options.query ?? "", options.minBlocks ?? 0],
    queryFn: () => fetchLeaderboardSummary(options),
    placeholderData: (previousData) => previousData,
    staleTime: 4_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
}
