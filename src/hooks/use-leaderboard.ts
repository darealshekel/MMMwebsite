import { useQuery } from "@tanstack/react-query";
import { fetchLeaderboardSummary } from "@/lib/leaderboard-repository";

export function useLeaderboard(params: {
  view?: string;
  page?: number;
  pageSize?: number;
  query?: string;
  minBlocks?: number;
}) {
  return useQuery({
    queryKey: ["leaderboard", params],
    queryFn: async () => {
      console.log("useLeaderboard queryFn running", params);
      const result = await fetchLeaderboardSummary(params);
      console.log("useLeaderboard result", result);
      return result;
    },
    enabled: true,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}
