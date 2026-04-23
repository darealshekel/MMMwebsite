import { useQuery } from "@tanstack/react-query";
import { fetchAeTweaksSnapshot } from "@/lib/aetweaks-data";

export function useAeTweaksSnapshot(enabled = true) {
  return useQuery({
    queryKey: ["aetweaks-snapshot"],
    queryFn: fetchAeTweaksSnapshot,
    enabled,
    staleTime: 4_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
}
