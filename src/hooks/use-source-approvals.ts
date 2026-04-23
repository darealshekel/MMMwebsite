import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSourceApprovals, updateSourceApproval, deleteSource } from "@/lib/source-approval";

export function useSourceApprovals(enabled = true) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["source-approvals"],
    queryFn: fetchSourceApprovals,
    enabled,
    staleTime: 4_000,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: ({ sourceId, action, reason }: { sourceId: string; action: "approved" | "rejected"; reason?: string }) =>
      updateSourceApproval(sourceId, action, reason),
    onSuccess: (data) => {
      queryClient.setQueryData(["source-approvals"], data);
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ sourceId, reason }: { sourceId: string; reason?: string }) => deleteSource(sourceId, reason),
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
    deleteSource: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    deletingSourceId: deleteMutation.variables?.sourceId ?? null,
  };
}
