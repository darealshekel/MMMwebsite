import { useQuery } from "@tanstack/react-query";
import { fetchLeaderboardSummary } from "@/lib/leaderboard-repository";

type LeaderboardParams = {
  view?: string;
  page?: number;
  pageSize?: number;
  query?: string;
  minBlocks?: number;
};

export function useLeaderboard(params: LeaderboardParams) {
  const normalizedParams = {
    view: params.view ?? "main",
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
    query: params.query?.trim() ?? "",
    minBlocks: params.minBlocks ?? 0,
  };

  return useQuery({
    queryKey: [
      "leaderboard",
      normalizedParams.view,
      normalizedParams.page,
      normalizedParams.pageSize,
      normalizedParams.query,
      normalizedParams.minBlocks,
    ],
    queryFn: async () => {
      console.log("useLeaderboard queryFn running", normalizedParams);
      const result = await fetchLeaderboardSummary(normalizedParams);
      console.log("useLeaderboard result", result);
      return result;
    },
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}
