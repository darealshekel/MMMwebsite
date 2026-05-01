import { useQuery } from "@tanstack/react-query";
import { fetchCurrentUser } from "@/lib/mmm-data";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
