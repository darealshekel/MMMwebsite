import { useQuery } from "@tanstack/react-query";
import { fetchMMMSnapshot } from "@/lib/mmm-data";

export function useMMMSnapshot(enabled = true) {
  return useQuery({
    queryKey: ["mmm-snapshot"],
    queryFn: fetchMMMSnapshot,
    enabled,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
