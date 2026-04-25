import { useQuery } from "@tanstack/react-query";
import type { LeaderboardRequestOptions } from "@/lib/leaderboards";
import { fetchLeaderboardSummary } from "@/lib/leaderboard-repository";

export interface UseLeaderboardOptions extends LeaderboardRequestOptions {
  sourceSlug?: string | null;
}

export function useLeaderboard(options: UseLeaderboardOptions) {
  return useQuery({
    queryKey: ["leaderboard", options.sourceSlug ?? "main", options.page ?? 1, options.pageSize ?? 50, options.query ?? "", options.minBlocks ?? 0],
    queryFn: () => fetchLeaderboardSummary({
      source: options.sourceSlug ?? undefined,
      page: options.page,
      pageSize: options.pageSize ?? 50,
      query: options.query,
      minBlocks: options.minBlocks,
      includeSources: Boolean(options.sourceSlug),
    }),
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    placeholderData: (previousData) => previousData,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
