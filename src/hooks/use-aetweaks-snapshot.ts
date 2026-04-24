import { useQuery } from "@tanstack/react-query";
import { fetchAeTweaksSnapshot } from "@/lib/aetweaks-data";

export function useAeTweaksSnapshot(enabled = true) {
  return useQuery({
    queryKey: ["aetweaks-snapshot"],
    queryFn: fetchAeTweaksSnapshot,
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: true,
  });
}
