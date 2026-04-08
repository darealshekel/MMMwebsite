import { useQuery } from "@tanstack/react-query";
import { fetchAeternumLeaderboardSummary } from "@/lib/leaderboard-repository";

export function useAeternumLeaderboard() {
  return useQuery({
    queryKey: ["aeternum-leaderboard"],
    queryFn: fetchAeternumLeaderboardSummary,
    staleTime: 4_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
}
