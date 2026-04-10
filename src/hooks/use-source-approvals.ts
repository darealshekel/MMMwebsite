import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSourceApprovals, updateSourceApproval } from "@/lib/source-approval";

export function useSourceApprovals(enabled = true) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["source-approvals"],
    queryFn: fetchSourceApprovals,
    enabled,
    staleTime: 4_000,
  });

  const mutation = useMutation({
    mutationFn: ({ sourceId, action }: { sourceId: string; action: "approved" | "rejected" }) =>
      updateSourceApproval(sourceId, action),
    onSuccess: (data) => {
      queryClient.setQueryData(["source-approvals"], data);
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });

  return {
    ...query,
    updateSourceApproval: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    updatingSourceId: mutation.variables?.sourceId ?? null,
  };
}
