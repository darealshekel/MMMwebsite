import { useQuery } from "@tanstack/react-query";
import { fetchAeTweaksSnapshot } from "@/lib/aetweaks-data";

export function useAeTweaksSnapshot() {
  return useQuery({
    queryKey: ["aetweaks-snapshot"],
    queryFn: fetchAeTweaksSnapshot,
    staleTime: 4_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
}
