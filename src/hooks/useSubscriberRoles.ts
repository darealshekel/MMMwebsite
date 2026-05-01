import { useQuery } from "@tanstack/react-query";

type SubscriberRole = "supporter" | "supporter_plus";

async function fetchSubscriberRoles(): Promise<Record<string, SubscriberRole>> {
  const response = await fetch("/api/subscriber-roles");
  if (!response.ok) return {};
  const data = (await response.json()) as { roles?: Record<string, SubscriberRole> };
  return data.roles ?? {};
}

export function useSubscriberRoles() {
  return useQuery({
    queryKey: ["subscriber-roles"],
    queryFn: fetchSubscriberRoles,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function subscriberRoleClass(role: SubscriberRole | null | undefined): string {
  if (role === "supporter_plus") return "text-gold-shimmer";
  if (role === "supporter") return "text-diamond-blue";
  return "";
}
