import { useQuery } from "@tanstack/react-query";
import { fetchCurrentUser } from "@/lib/aetweaks-data";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    staleTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
