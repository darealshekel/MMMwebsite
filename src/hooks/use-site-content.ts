import { useQuery } from "@tanstack/react-query";
import { fetchSiteContent } from "@/lib/admin-management";

export function useSiteContent() {
  return useQuery({
    queryKey: ["site-content"],
    queryFn: fetchSiteContent,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });
}
