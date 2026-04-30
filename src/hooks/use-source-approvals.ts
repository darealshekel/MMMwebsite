import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSourceApprovals, updateSourceApproval, deleteSource, createDirectSource } from "@/lib/source-approval";

export function useSourceApprovals(enabled = true) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["source-approvals"],
    queryFn: fetchSourceApprovals,
    enabled,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: ({ sourceId, action, reason, playerRows }: {
      sourceId: string;
      action: "approved" | "rejected";
      reason?: string;
      playerRows?: Array<{ playerId?: string | null; username: string; blocksMined: number }>;
    }) =>
      updateSourceApproval(sourceId, action, reason, playerRows),
    onSuccess: (data) => {
      queryClient.setQueryData(["source-approvals"], data);
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      void queryClient.invalidateQueries({ queryKey: ["player-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-editable-sources"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-editable-single-players"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-editable-single-player-source-rows"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ sourceId, reason }: { sourceId: string; reason?: string }) => deleteSource(sourceId, reason),
    onSuccess: (data) => {
      queryClient.setQueryData(["source-approvals"], data);
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      void queryClient.invalidateQueries({ queryKey: ["player-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-editable-sources"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-editable-single-players"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-editable-single-player-source-rows"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: createDirectSource,
    onSuccess: (data) => {
      queryClient.setQueryData(["source-approvals"], data);
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      void queryClient.invalidateQueries({ queryKey: ["player-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-editable-sources"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-editable-single-players"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-editable-single-player-source-rows"] });
    },
  });

  return {
    ...query,
    updateSourceApproval: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    updatingSourceId: mutation.isPending ? mutation.variables?.sourceId ?? null : null,
    updatingSourceAction: mutation.isPending ? mutation.variables?.action ?? null : null,
    deleteSource: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    deletingSourceId: deleteMutation.isPending ? deleteMutation.variables?.sourceId ?? null : null,
    createDirectSource: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
