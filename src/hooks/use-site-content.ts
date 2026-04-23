import { useQuery } from "@tanstack/react-query";
import { fetchSiteContent } from "@/lib/admin-management";

export function useSiteContent() {
  return useQuery({
    queryKey: ["site-content"],
    queryFn: fetchSiteContent,
    staleTime: 2_000,
    retry: false,
  });
}
