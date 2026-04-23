import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Flag,
  Pencil,
  Search,
  ShieldCheck,
  UserCog,
  ScrollText,
  Trash2,
  Crown,
} from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { LeaderboardDirectoryControls } from "@/components/leaderboard/LeaderboardDirectoryControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/sonner";
import type {
  AdminAuditEntrySummary,
  AdminFlagTarget,
  AdminRoleLookupTarget,
  AppRole,
  EditableSourceRowSummary,
  EditableSourceSummary,
  SourceApprovalSummary,
  ViewerSummary,
} from "@/lib/types";
import {
  fetchAdminAuditEntries,
  fetchEditableSourceRows,
  fetchEditableSources,
  fetchFlagByUuid,
  fetchRoleByUuid,
  setFlagByUuid,
  setRoleByUuid,
  updateEditableSource,
  updateEditableSourcePlayer,
  updateSiteContentValue,
} from "@/lib/admin-management";
import type { useSourceApprovals } from "@/hooks/use-source-approvals";

type SourceApprovalsApi = ReturnType<typeof useSourceApprovals>;

function formatTimeAgo(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function DangerBadge({ role }: { role: string }) {
  if (role === "owner") {
    return <span className="inline-flex items-center gap-1 border border-primary/30 bg-primary/10 px-2 py-1 font-pixel text-[8px] text-primary"><Crown className="h-3 w-3" /> OWNER</span>;
  }
  if (role === "admin") {
    return <span className="inline-flex items-center gap-1 border border-amber-300/20 bg-amber-300/10 px-2 py-1 font-pixel text-[8px] text-amber-100"><ShieldCheck className="h-3 w-3" /> ADMIN</span>;
  }
  return <span className="inline-flex items-center gap-1 border border-border px-2 py-1 font-pixel text-[8px] text-muted-foreground">PLAYER</span>;
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: typeof ShieldCheck; title: string; subtitle: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-pixel text-[10px] text-foreground">{title}</h3>
      </div>
      <p className="text-[8px] leading-[1.7] text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export function AdminManagementPanel({
  viewer,
  sourceApprovals,
  siteContent,
}: {
  viewer: ViewerSummary;
  sourceApprovals: SourceApprovalsApi;
  siteContent: Record<string, string>;
}) {
  const queryClient = useQueryClient();
  const isOwner = viewer.role === "owner";

  const [roleUuid, setRoleUuid] = useState("");
  const [pendingRole, setPendingRole] = useState<AppRole>("player");
  const [roleReason, setRoleReason] = useState("");
  const [roleTarget, setRoleTarget] = useState<AdminRoleLookupTarget | null>(null);

  const [flagUuid, setFlagUuid] = useState("");
  const [flagCode, setFlagCode] = useState("");
  const [flagReason, setFlagReason] = useState("");
  const [flagTarget, setFlagTarget] = useState<AdminFlagTarget | null>(null);

  const [sourceSearch, setSourceSearch] = useState("");
  const [selectedSource, setSelectedSource] = useState<EditableSourceSummary | null>(null);
  const [selectedSourceName, setSelectedSourceName] = useState("");
  const [editorReason, setEditorReason] = useState("");
  const [rowSearch, setRowSearch] = useState("");
  const [rowDrafts, setRowDrafts] = useState<Record<string, { username: string; blocksMined: string }>>({});

  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [deleteReasons, setDeleteReasons] = useState<Record<string, string>>({});
  const [moderationQuery, setModerationQuery] = useState("");
  const [moderationPageSize, setModerationPageSize] = useState(20);
  const [moderationPage, setModerationPage] = useState(1);

  const [siteDrafts, setSiteDrafts] = useState<Record<string, string>>({
    "dashboard.heroTitle": siteContent["dashboard.heroTitle"] ?? "",
    "dashboard.heroSubtitle": siteContent["dashboard.heroSubtitle"] ?? "",
    "leaderboard.mainTitle": siteContent["leaderboard.mainTitle"] ?? "",
    "leaderboard.mainDescription": siteContent["leaderboard.mainDescription"] ?? "",
  });

  const sourcesQuery = useQuery({
    queryKey: ["admin-editable-sources", sourceSearch],
    queryFn: () => fetchEditableSources(sourceSearch),
    enabled: true,
    staleTime: 1_000,
    retry: false,
  });

  const sourceRowsQuery = useQuery({
    queryKey: ["admin-editable-source-rows", selectedSource?.id ?? null, rowSearch],
    queryFn: () => fetchEditableSourceRows(selectedSource!.id, rowSearch),
    enabled: Boolean(selectedSource),
    staleTime: 1_000,
    retry: false,
  });

  const auditQuery = useQuery({
    queryKey: ["admin-audit"],
    queryFn: fetchAdminAuditEntries,
    staleTime: 2_000,
    retry: false,
  });

  const roleLookup = useMutation({
    mutationFn: fetchRoleByUuid,
    onSuccess: (data) => {
      setRoleTarget(data.target);
      setPendingRole(data.target.role);
      toast.success(`Resolved ${data.target.username ?? data.target.uuid}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const roleUpdate = useMutation({
    mutationFn: ({ uuid, role, reason }: { uuid: string; role: AppRole; reason?: string }) => setRoleByUuid(uuid, role, reason),
    onSuccess: (data) => {
      setRoleTarget(data.target);
      setPendingRole(data.target.role);
      setRoleReason("");
      void queryClient.invalidateQueries({ queryKey: ["current-user"] });
      void auditQuery.refetch();
      toast.success(`Role updated to ${data.target.role.toUpperCase()}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const flagLookup = useMutation({
    mutationFn: fetchFlagByUuid,
    onSuccess: (data) => {
      setFlagTarget(data.target);
      setFlagCode(data.target.flagCode ?? "");
      toast.success(`Resolved ${data.target.username ?? data.target.uuid}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const flagUpdate = useMutation({
    mutationFn: ({ uuid, flagCode: nextFlagCode, reason }: { uuid: string; flagCode: string | null; reason?: string }) =>
      setFlagByUuid(uuid, nextFlagCode, reason),
    onSuccess: (data) => {
      setFlagTarget(data.target);
      setFlagCode(data.target.flagCode ?? "");
      setFlagReason("");
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      void auditQuery.refetch();
      toast.success(data.target.flagCode ? `Flag set to ${data.target.flagCode.toUpperCase()}` : "Flag removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sourceUpdate = useMutation({
    mutationFn: ({ sourceId, displayName, reason }: { sourceId: string; displayName: string; reason?: string }) =>
      updateEditableSource(sourceId, displayName, reason),
    onSuccess: (data) => {
      setSelectedSource((current) => current ? { ...current, displayName: data.source.displayName, slug: data.source.slug } : current);
      setSelectedSourceName(data.source.displayName);
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-editable-sources"] });
      void auditQuery.refetch();
      toast.success("Source updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rowUpdate = useMutation({
    mutationFn: (input: { sourceId: string; playerId: string; username?: string; blocksMined: number; reason?: string }) =>
      updateEditableSourcePlayer(input),
    onSuccess: async () => {
      await sourceRowsQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      void auditQuery.refetch();
      toast.success("Leaderboard row updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const siteUpdate = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => updateSiteContentValue(key, value),
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ["site-content"] });
      void auditQuery.refetch();
      toast.success("Site content updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const auditEntries = auditQuery.data?.entries ?? [];
  const moderationSources = sourceApprovals.data?.sources ?? [];
  const filteredModerationSources = useMemo(() => {
    const normalized = moderationQuery.trim().toLowerCase();
    const visibleSources = !normalized
      ? moderationSources
      : moderationSources.filter((source) => {
          const haystack = [
            source.displayName,
            source.worldKey,
            source.kind,
            source.approvalStatus,
            source.submittedByUsername ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalized);
        });

    return [...visibleSources].sort((left, right) => {
      if (left.approvalStatus !== right.approvalStatus) {
        const order = { pending: 0, rejected: 1, approved: 2 } as const;
        return order[left.approvalStatus] - order[right.approvalStatus];
      }

      const blocksDelta = right.totalBlocks - left.totalBlocks;
      if (blocksDelta !== 0) {
        return blocksDelta;
      }

      return left.displayName.localeCompare(right.displayName);
    });
  }, [moderationQuery, moderationSources]);
  const moderationTotalPages = Math.max(1, Math.ceil(filteredModerationSources.length / moderationPageSize));
  const safeModerationPage = Math.min(moderationPage, moderationTotalPages);
  const paginatedModerationSources = useMemo(() => {
    const start = (safeModerationPage - 1) * moderationPageSize;
    return filteredModerationSources.slice(start, start + moderationPageSize);
  }, [filteredModerationSources, moderationPageSize, safeModerationPage]);

  const sourceRows = useMemo(() => {
    const rows = sourceRowsQuery.data?.rows ?? [];
    const nextDrafts: Record<string, { username: string; blocksMined: string }> = {};
    for (const row of rows) {
      nextDrafts[row.playerId] = rowDrafts[row.playerId] ?? {
        username: row.username,
        blocksMined: String(row.blocksMined),
      };
    }
    return { rows, nextDrafts };
  }, [rowDrafts, sourceRowsQuery.data?.rows]);

  useEffect(() => {
    setModerationPage(1);
  }, [moderationQuery, moderationPageSize]);

  useEffect(() => {
    if (moderationPage > moderationTotalPages) {
      setModerationPage(moderationTotalPages);
    }
  }, [moderationPage, moderationTotalPages]);

  const applyRoleChange = () => {
    if (!roleTarget) return;
    roleUpdate.mutate({ uuid: roleUuid, role: pendingRole, reason: roleReason });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {isOwner && (
        <GlassCard className="space-y-4">
          <SectionTitle
            icon={UserCog}
            title="ROLE MANAGEMENT"
            subtitle="Owner-only UUID lookup and role assignment with lockout protection."
          />

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input value={roleUuid} onChange={(event) => setRoleUuid(event.target.value)} placeholder="PLAYER UUID" className="font-pixel text-[10px]" />
            <Button onClick={() => roleLookup.mutate(roleUuid)} disabled={!roleUuid.trim() || roleLookup.isPending}>
              <Search className="mr-2 h-4 w-4" />
              Lookup
            </Button>
          </div>

          {roleTarget && (
            <div className="pixel-card space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-pixel text-[10px] text-foreground">{roleTarget.username ?? "Unknown Player"}</div>
                  <div className="mt-1 text-[8px] leading-[1.6] text-muted-foreground">{roleTarget.uuid}</div>
                </div>
                <DangerBadge role={roleTarget.role} />
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Select value={pendingRole} onValueChange={(value) => setPendingRole(value as AppRole)}>
                  <SelectTrigger className="h-10 bg-card text-[10px]">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="player">Player</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={roleReason} onChange={(event) => setRoleReason(event.target.value)} placeholder="Reason (optional)" className="font-pixel text-[10px]" />
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={roleUpdate.isPending || pendingRole === roleTarget.role} className="w-full">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Apply Role
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm role change</AlertDialogTitle>
                    <AlertDialogDescription>
                      {roleTarget.username ?? roleTarget.uuid} will be set to {pendingRole.toUpperCase()}. Owner changes are protected and the last owner cannot be removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={applyRoleChange}>Confirm</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </GlassCard>
      )}

      <GlassCard className="space-y-4">
        <SectionTitle
          icon={Flag}
          title="PLAYER FLAGS"
          subtitle="Assign or remove a normalized flag by UUID. Changes propagate anywhere player identity is rendered."
        />

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input value={flagUuid} onChange={(event) => setFlagUuid(event.target.value)} placeholder="PLAYER UUID" className="font-pixel text-[10px]" />
          <Button onClick={() => flagLookup.mutate(flagUuid)} disabled={!flagUuid.trim() || flagLookup.isPending}>
            <Search className="mr-2 h-4 w-4" />
            Lookup
          </Button>
        </div>

        {flagTarget && (
          <div className="pixel-card space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-pixel text-[10px] text-foreground">{flagTarget.username ?? "Unknown Player"}</div>
                <div className="mt-1 text-[8px] leading-[1.6] text-muted-foreground">{flagTarget.uuid}</div>
              </div>
              {flagTarget.flagUrl ? (
                <img src={flagTarget.flagUrl} alt={`${flagTarget.username ?? "player"} flag`} className="h-8 w-12 object-contain" />
              ) : (
                <span className="font-pixel text-[8px] text-muted-foreground">NO FLAG</span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)]">
              <Input value={flagCode} onChange={(event) => setFlagCode(event.target.value.slice(0, 2))} placeholder="us" className="font-pixel text-[10px] uppercase" />
              <Input value={flagReason} onChange={(event) => setFlagReason(event.target.value)} placeholder="Reason (optional)" className="font-pixel text-[10px]" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => flagUpdate.mutate({ uuid: flagUuid, flagCode, reason: flagReason })}
                disabled={flagUpdate.isPending}
              >
                <Check className="mr-2 h-4 w-4" />
                Save Flag
              </Button>
              <Button
                variant="outline"
                onClick={() => flagUpdate.mutate({ uuid: flagUuid, flagCode: null, reason: flagReason })}
                disabled={flagUpdate.isPending}
              >
                Remove Flag
              </Button>
            </div>
          </div>
        )}
      </GlassCard>

      <GlassCard className="space-y-4 xl:col-span-2">
        <SectionTitle
          icon={ShieldCheck}
          title="SOURCE MODERATION"
          subtitle="Approve, reject, or delete sources through the existing moderation flow with audit notes."
        />

        <LeaderboardDirectoryControls
          query={moderationQuery}
          onQueryChange={setModerationQuery}
          placeholder="SEARCH SOURCE MODERATION"
          pageSize={moderationPageSize}
          onPageSizeChange={setModerationPageSize}
          currentPage={safeModerationPage}
          totalPages={moderationTotalPages}
          onPageChange={setModerationPage}
          totalItems={filteredModerationSources.length}
          itemLabel={filteredModerationSources.length === 1 ? "Moderation Source" : "Moderation Sources"}
        />

        {sourceApprovals.isLoading ? (
          <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">LOADING MODERATION DATA...</div>
        ) : sourceApprovals.error ? (
          <div className="pixel-card border border-rose-400/20 bg-rose-500/10 p-4 text-[10px] text-rose-100">
            {(sourceApprovals.error as Error).message}
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedModerationSources.map((source) => (
              <div key={source.id} className="pixel-card p-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="font-pixel text-[10px] text-foreground">{source.displayName}</div>
                      <DangerBadge role={source.approvalStatus === "approved" ? "admin" : source.approvalStatus === "rejected" ? "player" : "owner"} />
                    </div>
                    <div className="text-[8px] leading-[1.7] text-muted-foreground">
                      {source.kind} • {source.totalBlocks.toLocaleString()} blocks • {source.playerCount.toLocaleString()} players
                    </div>
                    <div className="text-[8px] leading-[1.7] text-muted-foreground">
                      Submitted by {source.submittedByUsername ?? "Unknown player"} • {source.submittedAt ? formatTimeAgo(source.submittedAt) : "Recently"}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Textarea
                      value={rejectReasons[source.id] ?? ""}
                      onChange={(event) => setRejectReasons((current) => ({ ...current, [source.id]: event.target.value }))}
                      placeholder="Reject reason or moderation note"
                      className="min-h-[78px] text-[10px]"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => sourceApprovals.updateSourceApproval({ sourceId: source.id, action: "approved", reason: rejectReasons[source.id] ?? "" })}
                        disabled={sourceApprovals.isUpdating || sourceApprovals.isDeleting}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => sourceApprovals.updateSourceApproval({ sourceId: source.id, action: "rejected", reason: rejectReasons[source.id] ?? "" })}
                        disabled={sourceApprovals.isUpdating || sourceApprovals.isDeleting}
                      >
                        Reject
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" disabled={sourceApprovals.isUpdating || sourceApprovals.isDeleting}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {source.displayName}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes the source from the leaderboard flow and logs the destructive action.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <Textarea
                            value={deleteReasons[source.id] ?? ""}
                            onChange={(event) => setDeleteReasons((current) => ({ ...current, [source.id]: event.target.value }))}
                            placeholder="Delete reason (optional)"
                            className="min-h-[78px] text-[10px]"
                          />
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => sourceApprovals.deleteSource({ sourceId: source.id, reason: deleteReasons[source.id] ?? "" })}>
                              Confirm Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!paginatedModerationSources.length && (
              <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">NO SOURCES MATCH THAT SEARCH.</div>
            )}
          </div>
        )}
      </GlassCard>

      <GlassCard className="space-y-4 xl:col-span-2">
        <SectionTitle
          icon={Pencil}
          title="MANUAL EDITOR"
          subtitle="Correct source names and per-player mined totals through a controlled editor."
        />

        <div className="grid gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-3">
            <Input value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} placeholder="Search source by name or slug" className="font-pixel text-[10px]" />
            <ScrollArea className="h-[22rem] border border-border bg-card">
              <div className="space-y-1 p-2">
                {(sourcesQuery.data?.sources ?? []).map((source) => (
                  <button
                    key={source.id}
                    className={`w-full border px-3 py-2 text-left transition-colors ${selectedSource?.id === source.id ? "border-primary/40 bg-primary/10" : "border-transparent hover:border-border hover:bg-secondary/40"}`}
                    onClick={() => {
                      setSelectedSource(source);
                      setSelectedSourceName(source.displayName);
                    }}
                  >
                    <div className="font-pixel text-[10px] text-foreground">{source.displayName}</div>
                    <div className="mt-1 text-[8px] leading-[1.6] text-muted-foreground">{source.slug}</div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-4">
            {selectedSource ? (
              <>
                <div className="pixel-card space-y-3 p-4">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <Input value={selectedSourceName} onChange={(event) => setSelectedSourceName(event.target.value)} placeholder="Source display name" className="font-pixel text-[10px]" />
                    <Input value={editorReason} onChange={(event) => setEditorReason(event.target.value)} placeholder="Reason (optional)" className="font-pixel text-[10px]" />
                    <Button
                      onClick={() => sourceUpdate.mutate({ sourceId: selectedSource.id, displayName: selectedSourceName, reason: editorReason })}
                      disabled={sourceUpdate.isPending || !selectedSourceName.trim()}
                    >
                      Save Source
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
                  <Input value={rowSearch} onChange={(event) => setRowSearch(event.target.value)} placeholder="Search source player rows" className="font-pixel text-[10px]" />
                  <div className="pixel-card px-4 py-3 text-[8px] leading-[1.7] text-muted-foreground">
                    Updating a row recalculates the dependent leaderboard entry safely.
                  </div>
                </div>

                <ScrollArea className="h-[28rem] border border-border bg-card">
                  <div className="space-y-2 p-3">
                    {sourceRows.rows.map((row: EditableSourceRowSummary) => {
                      const draft = sourceRows.nextDrafts[row.playerId];
                      return (
                        <div key={row.playerId} className="pixel-card grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_148px_auto]">
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <Input
                              value={draft?.username ?? row.username}
                              onChange={(event) => setRowDrafts((current) => ({
                                ...current,
                                [row.playerId]: {
                                  username: event.target.value,
                                  blocksMined: current[row.playerId]?.blocksMined ?? String(row.blocksMined),
                                },
                              }))}
                              className="font-pixel text-[10px]"
                            />
                            <Input
                              value={draft?.blocksMined ?? String(row.blocksMined)}
                              onChange={(event) => setRowDrafts((current) => ({
                                ...current,
                                [row.playerId]: {
                                  username: current[row.playerId]?.username ?? row.username,
                                  blocksMined: event.target.value,
                                },
                              }))}
                              className="font-pixel text-[10px]"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3 text-[8px] leading-[1.7] text-muted-foreground">
                            <span>{formatTimeAgo(row.lastUpdated)}</span>
                            {row.flagUrl ? <img src={row.flagUrl} alt={`${row.username} flag`} className="h-6 w-9 object-contain" /> : null}
                          </div>
                          <Button
                            onClick={() => rowUpdate.mutate({
                              sourceId: selectedSource.id,
                              playerId: row.playerId,
                              username: draft?.username ?? row.username,
                              blocksMined: Number(draft?.blocksMined ?? row.blocksMined),
                              reason: editorReason,
                            })}
                            disabled={rowUpdate.isPending}
                          >
                            Save Row
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">Select a source to edit its name and player rows.</div>
            )}
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <SectionTitle
          icon={ScrollText}
          title="SITE CONTENT"
          subtitle="Safe text overrides for the dashboard and main leaderboard headers."
        />

        <div className="space-y-3">
          {Object.entries(siteDrafts).map(([key, value]) => (
            <div key={key} className="pixel-card space-y-2 p-3">
              <div className="font-pixel text-[8px] text-muted-foreground">{key}</div>
              <Textarea
                value={value}
                onChange={(event) => setSiteDrafts((current) => ({ ...current, [key]: event.target.value }))}
                className="min-h-[72px] text-[10px]"
              />
              <Button
                onClick={() => siteUpdate.mutate({ key, value })}
                disabled={siteUpdate.isPending}
              >
                Save Text
              </Button>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <SectionTitle
          icon={AlertTriangle}
          title="AUDIT TRAIL"
          subtitle="Recent privileged actions recorded for moderation, roles, flags, and manual edits."
        />

        <ScrollArea className="h-[28rem] border border-border bg-card">
          <div className="space-y-2 p-3">
            {auditEntries.map((entry: AdminAuditEntrySummary) => (
              <div key={entry.id} className="pixel-card p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-pixel text-[10px] text-foreground">{entry.actionType}</div>
                  <DangerBadge role={entry.actorRole} />
                </div>
                <div className="mt-1 text-[8px] leading-[1.7] text-muted-foreground">
                  {entry.targetType} • {entry.targetId} • {formatTimeAgo(entry.createdAt)}
                </div>
                {entry.reason ? <div className="mt-2 text-[8px] leading-[1.7] text-foreground/80">{entry.reason}</div> : null}
              </div>
            ))}
            {!auditEntries.length && (
              <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">No privileged actions recorded yet.</div>
            )}
          </div>
        </ScrollArea>
      </GlassCard>
    </div>
  );
}
