import { useQuery } from "@tanstack/react-query";
import { fetchAeternumLeaderboard, fetchAeternumTotalDigs } from "@/lib/aetweaks-data";

export function useAeternumLeaderboard() {
  return useQuery({
    queryKey: ["aeternum-leaderboard"],
    queryFn: async () => ({
      rows: await fetchAeternumLeaderboard(),
      totalDigs: await fetchAeternumTotalDigs(),
    }),
    staleTime: 4_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
}
