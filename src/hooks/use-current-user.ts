import { useQuery } from "@tanstack/react-query";
import { fetchCurrentUser } from "@/lib/aetweaks-data";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: true,
  });
}
