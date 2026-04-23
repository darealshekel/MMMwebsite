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
    }),
    staleTime: 0,
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
}
