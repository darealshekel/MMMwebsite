import { useQuery } from "@tanstack/react-query";
import { fetchAeternumLeaderboard } from "@/lib/aetweaks-data";

export function useAeternumLeaderboard() {
  return useQuery({
    queryKey: ["aeternum-leaderboard"],
    queryFn: fetchAeternumLeaderboard,
    staleTime: 4_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
}
