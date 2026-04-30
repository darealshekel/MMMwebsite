import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Flag,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Link2,
  UserCog,
  ScrollText,
  Trash2,
  Crown,
} from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { BlocksMinedValue } from "@/components/BlocksMinedValue";
import { LeaderboardDirectoryControls } from "@/components/leaderboard/LeaderboardDirectoryControls";
import { PlayerAvatar } from "@/components/leaderboard/PlayerAvatar";
import { SkeletonCard, SkeletonLeaderboardRows } from "@/components/Skeleton";
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
  EditableSinglePlayerSummary,
  EditableSinglePlayerSourceSummary,
  EditableSourceRowSummary,
  EditableSourceSummary,
  MinecraftClaimStatus,
  MinecraftClaimSummary,
  SourceApprovalSummary,
  ViewerSummary,
} from "@/lib/types";
import {
  fetchAdminAuditEntries,
  fetchEditableSinglePlayers,
  fetchEditableSinglePlayerSources,
  fetchEditableSourceRows,
  fetchEditableSources,
  fetchFlagByUuid,
  fetchRoleByUuid,
  setFlagByUuid,
  setRoleByUuid,
  updateEditableSource,
  updateEditableSinglePlayer,
  updateEditableSourcePlayer,
  updateSiteContentValue,
} from "@/lib/admin-management";
import { fetchAdminMinecraftClaims, updateAdminMinecraftClaim } from "@/lib/minecraft-claims";
import { useSourceApprovals } from "@/hooks/use-source-approvals";

type AdminTool =
  | "source-moderation"
  | "manual-editor"
  | "claims"
  | "flags"
  | "site-content"
  | "audit"
  | "roles";

type DirectPlayerRow = {
  playerId: string | null;
  username: string;
  blocksMined: string;
};

function normalizePlayerLookup(value: string) {
  return value
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(?:\s*\(\s*new\s*\)\s*)+$/i, "")
    .trim()
    .toLowerCase();
}

function formatTimeAgo(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function parseBlocksInput(value: string, label: string) {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    toast.error(`${label} must be a valid non-negative whole number.`);
    return null;
  }
  return parsed;
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

function ClaimStatusBadge({ status }: { status: MinecraftClaimStatus }) {
  if (status === "approved") {
    return <span className="inline-flex items-center border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 font-pixel text-[8px] text-emerald-100">APPROVED</span>;
  }
  if (status === "rejected") {
    return <span className="inline-flex items-center border border-rose-300/20 bg-rose-300/10 px-2 py-1 font-pixel text-[8px] text-rose-100">REJECTED</span>;
  }
  return <span className="inline-flex items-center border border-primary/30 bg-primary/10 px-2 py-1 font-pixel text-[8px] text-primary">PENDING</span>;
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

function PlayerSelectorField({
  value,
  selectedPlayerId,
  players,
  loading,
  onChange,
  onSelect,
}: {
  value: string;
  selectedPlayerId: string | null;
  players: EditableSinglePlayerSummary[];
  loading: boolean;
  onChange: (username: string, playerId: string | null) => void;
  onSelect: (player: EditableSinglePlayerSummary) => void;
}) {
  const query = normalizePlayerLookup(value);
  const selected = selectedPlayerId ? players.find((player) => player.playerId === selectedPlayerId) ?? null : null;
  const matches = query
    ? players
        .filter((player) => normalizePlayerLookup(player.username).includes(query))
        .slice(0, 6)
    : [];

  return (
    <div className="space-y-1">
      <Input
        value={value}
        onChange={(event) => {
          const username = event.target.value;
          const exact = players.find((player) => normalizePlayerLookup(player.username) === normalizePlayerLookup(username));
          onChange(username, exact?.playerId ?? null);
        }}
        placeholder="Search or create player"
        className="font-pixel text-[10px]"
      />
      {selected ? (
        <div className="flex items-center gap-1 font-pixel text-[7px] uppercase tracking-wider text-emerald-100">
          <Check className="h-3 w-3" />
          Selected {selected.username}
        </div>
      ) : query ? (
        <div className="space-y-1 border border-border/70 bg-background/70 p-2">
          {loading ? (
            <div className="font-pixel text-[7px] uppercase tracking-wider text-muted-foreground">Loading players...</div>
          ) : matches.length ? (
            matches.map((player) => (
              <button
                type="button"
                key={player.playerId}
                onClick={() => onSelect(player)}
                className="flex w-full items-center justify-between gap-2 border border-transparent px-2 py-1 text-left font-pixel text-[8px] text-muted-foreground hover:border-primary/30 hover:bg-primary/10 hover:text-foreground"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <PlayerAvatar username={player.username} className="h-5 w-5 border-0 bg-transparent" fallbackClassName="text-[6px]" />
                  <span className="truncate">{player.username}</span>
                </span>
                <span className="text-[7px]">{player.blocksMined.toLocaleString()}</span>
              </button>
            ))
          ) : (
            <div className="font-pixel text-[7px] uppercase tracking-wider text-muted-foreground">
              No matching players found. This will create a new player.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AdminManagementPanel({
  viewer,
  siteContent,
}: {
  viewer: ViewerSummary;
  siteContent: Record<string, string>;
}) {
  const queryClient = useQueryClient();
  const isOwner = viewer.role === "owner";
  const [activeTool, setActiveTool] = useState<AdminTool | null>(null);
  const sourceApprovals = useSourceApprovals(activeTool === "source-moderation");
  const invalidateManualEditorData = () => {
    const keys = [
      ["leaderboard"],
      ["special-leaderboard"],
      ["player-detail"],
      ["aetweaks-snapshot"],
      ["submit-page-data"],
      ["admin-editable-sources"],
      ["admin-editable-source-rows"],
      ["admin-editable-single-players"],
      ["admin-editable-single-player-source-rows"],
      ["current-user"],
    ];
    keys.forEach((queryKey) => {
      void queryClient.invalidateQueries({ queryKey });
    });
  };

  const [roleUuid, setRoleUuid] = useState("");
  const [pendingRole, setPendingRole] = useState<AppRole>("player");
  const [roleReason, setRoleReason] = useState("");
  const [roleTarget, setRoleTarget] = useState<AdminRoleLookupTarget | null>(null);

  const [flagUuid, setFlagUuid] = useState("");
  const [flagCode, setFlagCode] = useState("");
  const [flagReason, setFlagReason] = useState("");
  const [flagTarget, setFlagTarget] = useState<AdminFlagTarget | null>(null);

  const [sourceSearch, setSourceSearch] = useState("");
  const [editorCategory, setEditorCategory] = useState<"sources" | "single-players">("sources");
  const [selectedSource, setSelectedSource] = useState<EditableSourceSummary | null>(null);
  const [selectedSourceName, setSelectedSourceName] = useState("");
  const [selectedSourceTotal, setSelectedSourceTotal] = useState("");
  const [selectedSourceLogo, setSelectedSourceLogo] = useState("");
  const [editorReason, setEditorReason] = useState("");
  const [rowSearch, setRowSearch] = useState("");
  const [rowDrafts, setRowDrafts] = useState<Record<string, { username: string; blocksMined: string }>>({});
  const [manualSourcePlayerMode, setManualSourcePlayerMode] = useState<"existing" | "new">("existing");
  const [manualSourcePlayerDraft, setManualSourcePlayerDraft] = useState<DirectPlayerRow>({ playerId: null, username: "", blocksMined: "" });
  const [singlePlayerSearch, setSinglePlayerSearch] = useState("");
  const [singlePlayerDrafts, setSinglePlayerDrafts] = useState<Record<string, { blocksMined: string; flagUrl: string }>>({});
  const [selectedSinglePlayer, setSelectedSinglePlayer] = useState<EditableSinglePlayerSummary | null>(null);
  const [singlePlayerSourceSearch, setSinglePlayerSourceSearch] = useState("");
  const [singlePlayerSourceDrafts, setSinglePlayerSourceDrafts] = useState<Record<string, { sourceName: string; blocksMined: string }>>({});

  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [deleteReasons, setDeleteReasons] = useState<Record<string, string>>({});
  const [approvalPlayerDrafts, setApprovalPlayerDrafts] = useState<Record<string, DirectPlayerRow[]>>({});
  const [moderationQuery, setModerationQuery] = useState("");
  const [moderationPageSize, setModerationPageSize] = useState(20);
  const [moderationPage, setModerationPage] = useState(1);
  const [directSourceName, setDirectSourceName] = useState("");
  const [directSourceType, setDirectSourceType] = useState("private-server");
  const [directSourceLogo, setDirectSourceLogo] = useState("");
  const [directSourceReason, setDirectSourceReason] = useState("");
  const [directBlocksMined, setDirectBlocksMined] = useState("");
  const [directPlayerRows, setDirectPlayerRows] = useState<DirectPlayerRow[]>([{ playerId: null, username: "", blocksMined: "" }]);
  const [claimStatus, setClaimStatus] = useState<MinecraftClaimStatus>("pending");
  const [claimReasons, setClaimReasons] = useState<Record<string, string>>({});
  const [claimTransferTargets, setClaimTransferTargets] = useState<Record<string, string>>({});

  const [siteDrafts, setSiteDrafts] = useState<Record<string, string>>({
    "dashboard.heroTitle": siteContent["dashboard.heroTitle"] ?? "",
    "dashboard.heroSubtitle": siteContent["dashboard.heroSubtitle"] ?? "",
    "leaderboard.mainTitle": siteContent["leaderboard.mainTitle"] ?? "",
    "leaderboard.mainDescription": siteContent["leaderboard.mainDescription"] ?? "",
  });

  const sourcesQuery = useQuery({
    queryKey: ["admin-editable-sources", sourceSearch],
    queryFn: () => fetchEditableSources(sourceSearch),
    enabled: activeTool === "manual-editor" && editorCategory === "sources",
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const sourceRowsQuery = useQuery({
    queryKey: ["admin-editable-source-rows", selectedSource?.id ?? null, rowSearch],
    queryFn: () => fetchEditableSourceRows(selectedSource!.id, rowSearch),
    enabled: activeTool === "manual-editor" && editorCategory === "sources" && Boolean(selectedSource),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const singlePlayersQuery = useQuery({
    queryKey: ["admin-editable-single-players", singlePlayerSearch],
    queryFn: () => fetchEditableSinglePlayers(singlePlayerSearch),
    enabled: activeTool === "manual-editor" && editorCategory === "single-players",
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const manualEditorPlayersQuery = useQuery({
    queryKey: ["admin-editable-single-players", "manual-editor-picker"],
    queryFn: () => fetchEditableSinglePlayers("", 5000),
    enabled: activeTool === "manual-editor" && editorCategory === "sources",
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const moderationPlayersQuery = useQuery({
    queryKey: ["admin-editable-single-players", "source-moderation-picker"],
    queryFn: () => fetchEditableSinglePlayers("", 5000),
    enabled: activeTool === "source-moderation",
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const singlePlayerSourcesQuery = useQuery({
    queryKey: ["admin-editable-single-player-source-rows", selectedSinglePlayer?.playerId ?? null, singlePlayerSourceSearch],
    queryFn: () => fetchEditableSinglePlayerSources(selectedSinglePlayer!.playerId, singlePlayerSourceSearch),
    enabled: activeTool === "manual-editor" && editorCategory === "single-players" && Boolean(selectedSinglePlayer),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const auditQuery = useQuery({
    queryKey: ["admin-audit"],
    queryFn: fetchAdminAuditEntries,
    enabled: activeTool === "audit",
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const claimsQuery = useQuery({
    queryKey: ["admin-minecraft-claims", claimStatus],
    queryFn: () => fetchAdminMinecraftClaims(claimStatus),
    enabled: activeTool === "claims",
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
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
    mutationFn: ({ sourceId, displayName, totalBlocks, logoUrl, reason }: { sourceId: string; displayName: string; totalBlocks: number | null; logoUrl: string | null; reason?: string }) =>
      updateEditableSource(sourceId, displayName, reason, totalBlocks, logoUrl),
    onSuccess: (data) => {
      setSelectedSource((current) => current ? { ...current, ...data.source } : current);
      setSelectedSourceName(data.source.displayName);
      setSelectedSourceTotal(String(data.source.totalBlocks ?? ""));
      setSelectedSourceLogo(data.source.logoUrl ?? "");
      invalidateManualEditorData();
      void auditQuery.refetch();
      toast.success("Source updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rowUpdate = useMutation({
    mutationFn: (input: { sourceId: string; playerId: string | null; username?: string; sourceName?: string | null; blocksMined: number; createIfMissing?: boolean; reason?: string }) =>
      updateEditableSourcePlayer(input),
    onSuccess: async (data) => {
      const draftKey = `${data.row.sourceId}:${data.row.playerId}`;
      setRowDrafts((current) => {
        if (!data.row.playerId || !(data.row.playerId in current)) return current;
        const next = { ...current };
        delete next[data.row.playerId];
        return next;
      });
      setSinglePlayerSourceDrafts((current) => {
        if (!(draftKey in current)) return current;
        const next = { ...current };
        delete next[draftKey];
        return next;
      });
      setManualSourcePlayerDraft((current) => {
        if (current.playerId && current.playerId !== data.row.playerId) return current;
        return { playerId: null, username: "", blocksMined: "" };
      });
      setManualSourcePlayerMode("existing");
      if (selectedSource) {
        await sourceRowsQuery.refetch();
      }
      await manualEditorPlayersQuery.refetch();
      if (selectedSinglePlayer) {
        await singlePlayerSourcesQuery.refetch();
        const refreshedPlayers = await singlePlayersQuery.refetch();
        const refreshedSelected = refreshedPlayers.data?.players.find((player) => player.playerId === selectedSinglePlayer.playerId);
        if (refreshedSelected) {
          setSelectedSinglePlayer(refreshedSelected);
          setSinglePlayerDrafts((current) => {
            if (!(refreshedSelected.playerId in current)) return current;
            const next = { ...current };
            delete next[refreshedSelected.playerId];
            return next;
          });
        }
      }
      invalidateManualEditorData();
      void auditQuery.refetch();
      toast.success("Leaderboard row updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const singlePlayerUpdate = useMutation({
    mutationFn: (input: { playerId: string; blocksMined: number; flagUrl?: string | null; reason?: string }) =>
      updateEditableSinglePlayer(input),
    onSuccess: async () => {
      await singlePlayersQuery.refetch();
      invalidateManualEditorData();
      void auditQuery.refetch();
      toast.success("Single player updated");
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

  const claimUpdate = useMutation({
    mutationFn: (input: { claimId: string; action: "approve" | "reject" | "unlink" | "transfer"; reason?: string; targetUserId?: string }) =>
      updateAdminMinecraftClaim(input),
    onSuccess: async () => {
      await claimsQuery.refetch();
      void auditQuery.refetch();
      toast.success("Minecraft claim updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const auditEntries = auditQuery.data?.entries ?? [];
  const moderationSources = useMemo(() => sourceApprovals.data?.sources ?? [], [sourceApprovals.data?.sources]);
  const handleSourceApproval = async (
    sourceId: string,
    action: "approved" | "rejected",
    reason?: string,
    playerRows?: Array<{ playerId?: string | null; username: string; blocksMined: number }>,
  ) => {
    try {
      await sourceApprovals.updateSourceApproval({ sourceId, action, reason, playerRows });
      setApprovalPlayerDrafts((current) => {
        if (!(sourceId in current)) return current;
        const next = { ...current };
        delete next[sourceId];
        return next;
      });
      void auditQuery.refetch();
      toast.success(action === "approved" ? "Source approved" : "Source rejected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update source approval");
    }
  };

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
  const moderationPlayerOptions = moderationPlayersQuery.data?.players ?? [];
  const manualEditorPlayerOptions = manualEditorPlayersQuery.data?.players ?? [];
  const manualSourceExactMatch = manualSourcePlayerDraft.username.trim()
    ? manualEditorPlayerOptions.find((player) => normalizePlayerLookup(player.username) === normalizePlayerLookup(manualSourcePlayerDraft.username))
    : null;
  const manualSourceBlocks = Number(manualSourcePlayerDraft.blocksMined.trim());
  const canAddManualSourcePlayer = Boolean(selectedSource)
    && Number.isFinite(manualSourceBlocks)
    && manualSourceBlocks >= 0
    && Number.isInteger(manualSourceBlocks)
    && (manualSourcePlayerMode === "existing"
      ? Boolean(manualSourcePlayerDraft.playerId)
      : Boolean(manualSourcePlayerDraft.username.trim()) && !manualSourceExactMatch);
  const parsedDirectRows = directPlayerRows.map((row) => ({
    playerId: row.playerId,
    username: row.username.trim(),
    blocksMined: Number(row.blocksMined.trim()),
  }));
  const directIsServerSource = directSourceType === "private-server" || directSourceType === "server";
  const directSoloPlayer = directPlayerRows[0] ?? { playerId: null, username: "", blocksMined: "" };
  const directSoloBlocks = Number(directBlocksMined.trim());
  const validDirectRows = parsedDirectRows.length > 0 && parsedDirectRows.length <= 50 && parsedDirectRows.every((row) =>
    row.username && Number.isFinite(row.blocksMined) && row.blocksMined > 0 && Number.isInteger(row.blocksMined),
  );
  const validDirectSoloPlayer = Boolean(directSoloPlayer.username.trim());
  const validDirectSoloBlocks = Number.isFinite(directSoloBlocks) && directSoloBlocks > 0 && Number.isInteger(directSoloBlocks);
  const directSubmissionRows = directIsServerSource
    ? parsedDirectRows
    : [{ playerId: directSoloPlayer.playerId, username: directSoloPlayer.username.trim(), blocksMined: directSoloBlocks }];
  const directTotalBlocks = directIsServerSource
    ? parsedDirectRows.reduce((sum, row) => sum + (Number.isFinite(row.blocksMined) ? row.blocksMined : 0), 0)
    : validDirectSoloBlocks ? directSoloBlocks : 0;
  const canCreateDirectSource = directSourceName.trim() && (directIsServerSource ? validDirectRows : validDirectSoloPlayer && validDirectSoloBlocks);
  const approvalRowsForSource = (source: SourceApprovalSummary): DirectPlayerRow[] =>
    approvalPlayerDrafts[source.id] ?? (source.playerRows ?? []).map((row) => ({
      playerId: row.playerId ?? null,
      username: row.username,
      blocksMined: String(row.blocksMined),
    }));
  const parsedApprovalRowsForSource = (source: SourceApprovalSummary) => approvalRowsForSource(source).map((row) => ({
    playerId: row.playerId,
    username: row.username.trim(),
    blocksMined: Number(row.blocksMined.trim()),
  }));
  const validApprovalRowsForSource = (source: SourceApprovalSummary) => parsedApprovalRowsForSource(source).every((row) =>
    row.username && Number.isFinite(row.blocksMined) && row.blocksMined > 0 && Number.isInteger(row.blocksMined),
  );

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

  const singlePlayerSourceRows = useMemo(() => {
    const rows = singlePlayerSourcesQuery.data?.rows ?? [];
    const nextDrafts: Record<string, { sourceName: string; blocksMined: string }> = {};
    for (const row of rows) {
      const key = `${row.sourceId}:${row.playerId}`;
      nextDrafts[key] = singlePlayerSourceDrafts[key] ?? {
        sourceName: row.sourceName,
        blocksMined: String(row.blocksMined),
      };
    }
    return { rows, nextDrafts };
  }, [singlePlayerSourceDrafts, singlePlayerSourcesQuery.data?.rows]);

  useEffect(() => {
    setModerationPage(1);
  }, [moderationQuery, moderationPageSize]);

  useEffect(() => {
    if (moderationPage > moderationTotalPages) {
      setModerationPage(moderationTotalPages);
    }
  }, [moderationPage, moderationTotalPages]);

  useEffect(() => {
    if (!isOwner && activeTool === "roles") {
      setActiveTool(null);
    }
  }, [activeTool, isOwner]);

  useEffect(() => {
    setManualSourcePlayerDraft({ playerId: null, username: "", blocksMined: "" });
    setManualSourcePlayerMode("existing");
  }, [selectedSource?.id]);

  const applyRoleChange = () => {
    if (!roleTarget) return;
    roleUpdate.mutate({ uuid: roleUuid, role: pendingRole, reason: roleReason });
  };

  const adminTools: Array<{ id: AdminTool; label: string; description: string; ownerOnly?: boolean }> = [
    { id: "source-moderation", label: "Source Moderation", description: "Approvals and direct source add." },
    { id: "manual-editor", label: "Manual Editor", description: "Sources, players, and rows." },
    { id: "claims", label: "Minecraft Claims", description: "Discord/Minecraft linking." },
    { id: "flags", label: "Player Flags", description: "Flag lookup and edits." },
    { id: "site-content", label: "Site Content", description: "Public text overrides." },
    { id: "audit", label: "Audit Trail", description: "Recent admin actions." },
    { id: "roles", label: "Roles", description: "Owner role management.", ownerOnly: true },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <GlassCard className="space-y-4 xl:col-span-2">
        <SectionTitle
          icon={ShieldCheck}
          title="OWNER TOOLS"
          subtitle="Source review, manual edits, claims, flags, site text, audit, and role controls."
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {adminTools
            .filter((tool) => !tool.ownerOnly || isOwner)
            .map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => setActiveTool(tool.id)}
                className={`border px-3 py-3 text-left transition-colors ${
                  activeTool === tool.id
                    ? "border-primary/45 bg-primary/10 text-foreground"
                    : "border-border bg-card hover:border-primary/35 hover:bg-secondary/40"
                }`}
              >
                <div className="font-pixel text-[9px] text-foreground">{tool.label}</div>
                <div className="mt-1 text-[8px] leading-[1.6] text-muted-foreground">{tool.description}</div>
              </button>
            ))}
        </div>
      </GlassCard>

      {isOwner && activeTool === "roles" && (
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

      {activeTool === "flags" && (
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
      )}

      {activeTool === "claims" && (
      <GlassCard className="space-y-4 xl:col-span-2">
        <SectionTitle
          icon={Link2}
          title="MINECRAFT CLAIMS"
          subtitle="Review Discord account claims before linking them to Minecraft UUIDs."
        />

        <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
          <Select value={claimStatus} onValueChange={(value) => setClaimStatus(value as MinecraftClaimStatus)}>
            <SelectTrigger className="h-10 bg-card text-[10px]">
              <SelectValue placeholder="Claim status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <div className="pixel-card px-4 py-3 text-[8px] leading-[1.7] text-muted-foreground">
            Approving creates or updates the linked Minecraft account for that Discord user.
          </div>
        </div>

        {claimsQuery.isLoading ? (
          <SkeletonLeaderboardRows count={3} className="lg:grid-cols-1" />
        ) : claimsQuery.error ? (
          <div className="pixel-card border border-rose-400/20 bg-rose-500/10 p-4 text-[10px] text-rose-100">
            {(claimsQuery.error as Error).message}
          </div>
        ) : (
          <div className="space-y-3">
            {(claimsQuery.data?.claims ?? []).map((claim: MinecraftClaimSummary) => (
              <div key={claim.id} className="pixel-card p-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-pixel text-[10px] text-foreground">{claim.minecraftName}</div>
                      <ClaimStatusBadge status={claim.status} />
                    </div>
                    <div className="break-all text-[8px] leading-[1.7] text-muted-foreground">{claim.minecraftUuid}</div>
                    <div className="text-[8px] leading-[1.7] text-muted-foreground">
                      Discord: {claim.discord.username ?? "Unknown"} {claim.discord.id ? `(${claim.discord.id})` : ""} • Submitted {formatTimeAgo(claim.submittedAt)}
                    </div>
                    <div className="text-[8px] leading-[1.7] text-muted-foreground">Website user: {claim.userId}</div>
                    {claim.rejectionReason ? (
                      <div className="border border-rose-300/20 bg-rose-500/10 p-2 text-[8px] leading-[1.7] text-rose-100">{claim.rejectionReason}</div>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <Textarea
                      value={claimReasons[claim.id] ?? ""}
                      onChange={(event) => setClaimReasons((current) => ({ ...current, [claim.id]: event.target.value }))}
                      placeholder="Reject/unlink reason (optional)"
                      className="min-h-[70px] text-[10px]"
                    />
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Input
                        value={claimTransferTargets[claim.id] ?? ""}
                        onChange={(event) => setClaimTransferTargets((current) => ({ ...current, [claim.id]: event.target.value }))}
                        placeholder="Target website user id for transfer"
                        className="font-pixel text-[10px]"
                      />
                      <Button
                        variant="outline"
                        onClick={() => claimUpdate.mutate({ claimId: claim.id, action: "transfer", targetUserId: claimTransferTargets[claim.id] ?? "" })}
                        disabled={claimUpdate.isPending || !(claimTransferTargets[claim.id] ?? "").trim()}
                      >
                        Transfer
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => claimUpdate.mutate({ claimId: claim.id, action: "approve" })}
                        disabled={claimUpdate.isPending || claim.status === "approved"}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => claimUpdate.mutate({ claimId: claim.id, action: "reject", reason: claimReasons[claim.id] ?? "" })}
                        disabled={claimUpdate.isPending || claim.status === "rejected"}
                      >
                        Reject
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" disabled={claimUpdate.isPending || claim.status !== "approved"}>
                            Unlink
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Unlink {claim.minecraftName}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes the approved Discord-to-Minecraft link and keeps the claim history.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => claimUpdate.mutate({ claimId: claim.id, action: "unlink", reason: claimReasons[claim.id] ?? "" })}>
                              Confirm Unlink
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!(claimsQuery.data?.claims ?? []).length && (
              <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">NO {claimStatus.toUpperCase()} MINECRAFT CLAIMS.</div>
            )}
          </div>
        )}
      </GlassCard>
      )}

      {activeTool === "source-moderation" && (
      <GlassCard className="space-y-4 xl:col-span-2">
        <SectionTitle
          icon={ShieldCheck}
          title="SOURCE MODERATION"
          subtitle="Approve, reject, or delete sources through the existing moderation flow with audit notes."
        />

        <div className="pixel-card space-y-3 p-4">
          <div className="font-pixel text-[9px] uppercase tracking-wider text-muted-foreground">Owner Direct Add</div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)]">
            <Input value={directSourceName} onChange={(event) => setDirectSourceName(event.target.value)} placeholder="Source name" className="font-pixel text-[10px]" />
            <Select value={directSourceType} onValueChange={setDirectSourceType}>
              <SelectTrigger className="h-10 bg-card text-[10px]">
                <SelectValue placeholder="Source type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private-server">Private Server</SelectItem>
                <SelectItem value="server">Server</SelectItem>
                <SelectItem value="singleplayer">Singleplayer</SelectItem>
                <SelectItem value="hardcore">Hardcore</SelectItem>
                <SelectItem value="ssp">SSP</SelectItem>
                <SelectItem value="hsp">HSP</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Input value={directSourceLogo} onChange={(event) => setDirectSourceLogo(event.target.value)} placeholder="Logo URL (optional)" className="font-pixel text-[10px]" />
          </div>
          <Input value={directSourceReason} onChange={(event) => setDirectSourceReason(event.target.value)} placeholder="Reason (optional)" className="font-pixel text-[10px]" />
          {directIsServerSource ? (
            <div className="space-y-2">
              {directPlayerRows.map((row, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                  <PlayerSelectorField
                    value={row.username}
                    selectedPlayerId={row.playerId}
                    players={moderationPlayerOptions}
                    loading={moderationPlayersQuery.isLoading}
                    onChange={(username, playerId) => setDirectPlayerRows((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, username, playerId } : item))}
                    onSelect={(player) => setDirectPlayerRows((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, username: player.username, playerId: player.playerId } : item))}
                  />
                  <Input value={row.blocksMined} onChange={(event) => setDirectPlayerRows((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, blocksMined: event.target.value } : item))} placeholder="Blocks mined" className="font-pixel text-[10px]" />
                  <Button variant="outline" size="icon" disabled={directPlayerRows.length <= 1} onClick={() => setDirectPlayerRows((rows) => rows.filter((_, itemIndex) => itemIndex !== index))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="max-w-md space-y-2">
              <div className="font-pixel text-[8px] uppercase tracking-wider text-muted-foreground">Player</div>
              <PlayerSelectorField
                value={directSoloPlayer.username}
                selectedPlayerId={directSoloPlayer.playerId}
                players={moderationPlayerOptions}
                loading={moderationPlayersQuery.isLoading}
                onChange={(username, playerId) => setDirectPlayerRows((rows) => {
                  const [first = { playerId: null, username: "", blocksMined: "" }, ...rest] = rows;
                  return [{ ...first, username, playerId }, ...rest];
                })}
                onSelect={(player) => setDirectPlayerRows((rows) => {
                  const [first = { playerId: null, username: "", blocksMined: "" }, ...rest] = rows;
                  return [{ ...first, username: player.username, playerId: player.playerId }, ...rest];
                })}
              />
              <div className="font-pixel text-[8px] uppercase tracking-wider text-muted-foreground">Blocks Mined</div>
              <Input
                value={directBlocksMined}
                onChange={(event) => setDirectBlocksMined(event.target.value)}
                placeholder="Blocks mined"
                className="font-pixel text-[10px]"
              />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {directIsServerSource ? (
              <Button variant="outline" disabled={directPlayerRows.length >= 50} onClick={() => setDirectPlayerRows((rows) => [...rows, { playerId: null, username: "", blocksMined: "" }])}>
                <Plus className="mr-2 h-4 w-4" />
                Add Player
              </Button>
            ) : <div />}
            <div className="flex items-center gap-3">
              <BlocksMinedValue value={directTotalBlocks} className="font-pixel text-[10px]">
                {directTotalBlocks.toLocaleString()}
              </BlocksMinedValue>
              <Button
                disabled={sourceApprovals.isCreating || !canCreateDirectSource}
                onClick={async () => {
                  try {
                    await sourceApprovals.createDirectSource({
                      sourceName: directSourceName,
                      sourceType: directSourceType,
                      logoUrl: directSourceLogo || null,
                      playerRows: directSubmissionRows,
                      reason: directSourceReason,
                    });
                    setDirectSourceName("");
                    setDirectSourceLogo("");
                    setDirectSourceReason("");
                    setDirectBlocksMined("");
                    setDirectPlayerRows([{ playerId: null, username: "", blocksMined: "" }]);
                    toast.success("Source added");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Unable to add source");
                  }
                }}
              >
                {sourceApprovals.isCreating ? "Adding..." : "Add Source"}
              </Button>
            </div>
          </div>
        </div>

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
          <SkeletonLeaderboardRows count={4} className="lg:grid-cols-1" />
        ) : sourceApprovals.error ? (
          <div className="pixel-card border border-rose-400/20 bg-rose-500/10 p-4 text-[10px] text-rose-100">
            {(sourceApprovals.error as Error).message}
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedModerationSources.map((source) => {
              const editableApprovalRows = source.approvalStatus === "pending" && source.moderationKind === "submission" && Boolean(source.playerRows?.length);
              const approvalRows = approvalRowsForSource(source);
              const parsedApprovalRows = parsedApprovalRowsForSource(source);
              const approvalRowsValid = !editableApprovalRows || validApprovalRowsForSource(source);
              return (
              <div key={source.id} className="pixel-card p-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="font-pixel text-[10px] text-foreground">{source.displayName}</div>
                      <DangerBadge role={source.approvalStatus === "approved" ? "admin" : source.approvalStatus === "rejected" ? "player" : "owner"} />
                    </div>
                    <div className="text-[8px] leading-[1.7] text-muted-foreground">
                      {(source.sourceType ?? source.kind).toUpperCase()} • {source.totalBlocks.toLocaleString()} blocks • {source.playerCount.toLocaleString()} players • {source.approvalStatus.toUpperCase()}
                    </div>
                    <div className="text-[8px] leading-[1.7] text-muted-foreground">
                      Submitted by {source.submittedByUsername ?? "Unknown player"} • {source.submittedAt ? formatTimeAgo(source.submittedAt) : "Recently"}
                    </div>
                    {source.approvalStatus === "pending" && source.existingSource ? (
                      <div className="mt-2 border border-primary/30 bg-primary/10 px-2 py-1 text-[8px] leading-[1.6] text-primary">
                        Matches existing source {source.existingSource.displayName}. Approval will update that source with these synced stats.
                      </div>
                    ) : null}
                    {source.playerRows?.length ? (
                      <div className="mt-3 grid gap-1">
                        {editableApprovalRows ? (
                          <>
                            <div className="font-pixel text-[8px] uppercase tracking-wider text-muted-foreground">Player assignment</div>
                            {approvalRows.map((row, index) => (
                              <div key={`${source.id}:approval-player:${index}`} className="grid gap-2 border border-border/60 bg-background/40 p-2 md:grid-cols-[minmax(0,1fr)_150px]">
                                <PlayerSelectorField
                                  value={row.username}
                                  selectedPlayerId={row.playerId}
                                  players={moderationPlayerOptions}
                                  loading={moderationPlayersQuery.isLoading}
                                  onChange={(username, playerId) => setApprovalPlayerDrafts((current) => ({
                                    ...current,
                                    [source.id]: approvalRows.map((item, itemIndex) => itemIndex === index ? { ...item, username, playerId } : item),
                                  }))}
                                  onSelect={(player) => setApprovalPlayerDrafts((current) => ({
                                    ...current,
                                    [source.id]: approvalRows.map((item, itemIndex) => itemIndex === index ? { ...item, username: player.username, playerId: player.playerId } : item),
                                  }))}
                                />
                                <Input
                                  value={row.blocksMined}
                                  onChange={(event) => setApprovalPlayerDrafts((current) => ({
                                    ...current,
                                    [source.id]: approvalRows.map((item, itemIndex) => itemIndex === index ? { ...item, blocksMined: event.target.value } : item),
                                  }))}
                                  placeholder="Blocks mined"
                                  className="font-pixel text-[10px]"
                                />
                              </div>
                            ))}
                          </>
                        ) : (
                          <>
                            {source.playerRows.slice(0, 8).map((row) => (
                              <div key={`${source.id}:${row.username}`} className="flex items-center justify-between gap-3 border border-border/60 bg-background/40 px-2 py-1 text-[8px]">
                                <span className="font-pixel text-foreground">{row.username}</span>
                                <BlocksMinedValue value={row.blocksMined} className="font-pixel text-muted-foreground">
                                  {row.blocksMined.toLocaleString()}
                                </BlocksMinedValue>
                              </div>
                            ))}
                            {source.playerRows.length > 8 ? (
                              <div className="text-[8px] text-muted-foreground">+{source.playerRows.length - 8} more players</div>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}
                    {source.proofImageRef ? (
                      <a href={source.proofImageRef} target="_blank" rel="noreferrer" className="mt-3 inline-flex border border-border px-2 py-1 font-pixel text-[8px] text-muted-foreground hover:text-foreground">
                        Open proof{source.proofFileName ? `: ${source.proofFileName}` : ""}
                      </a>
                    ) : null}
                    {source.reviewNote ? (
                      <div className="mt-2 border border-rose-300/20 bg-rose-500/10 px-2 py-1 text-[8px] text-rose-100">
                        {source.reviewNote}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    {source.approvalStatus === "pending" ? (
                      <Textarea
                        value={rejectReasons[source.id] ?? ""}
                        onChange={(event) => setRejectReasons((current) => ({ ...current, [source.id]: event.target.value }))}
                        placeholder="Reject reason"
                        className="min-h-[78px] text-[10px]"
                      />
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {source.approvalStatus === "pending" && source.existingSource ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button disabled={sourceApprovals.isUpdating || sourceApprovals.isDeleting}>
                              {sourceApprovals.updatingSourceId === source.id && sourceApprovals.updatingSourceAction === "approved" ? "Approving..." : "Approve"}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Approve and update existing source?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {source.displayName} matches existing source {source.existingSource.displayName}. This will approve the moderation item and update the existing source with the synced stats instead of creating a duplicate source.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                disabled={!approvalRowsValid}
                                onClick={() => void handleSourceApproval(source.id, "approved", rejectReasons[source.id] ?? "", editableApprovalRows ? parsedApprovalRows : undefined)}
                              >
                                Yes, approve
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <Button
                          onClick={() => void handleSourceApproval(source.id, "approved", rejectReasons[source.id] ?? "", editableApprovalRows ? parsedApprovalRows : undefined)}
                          disabled={source.approvalStatus !== "pending" || sourceApprovals.isUpdating || sourceApprovals.isDeleting || !approvalRowsValid}
                        >
                          {sourceApprovals.updatingSourceId === source.id && sourceApprovals.updatingSourceAction === "approved" ? "Approving..." : "Approve"}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => void handleSourceApproval(source.id, "rejected", rejectReasons[source.id] ?? "")}
                        disabled={source.approvalStatus !== "pending" || sourceApprovals.isUpdating || sourceApprovals.isDeleting || !(rejectReasons[source.id] ?? "").trim()}
                      >
                        {sourceApprovals.updatingSourceId === source.id && sourceApprovals.updatingSourceAction === "rejected" ? "Rejecting..." : "Reject"}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" disabled={source.approvalStatus !== "pending" || sourceApprovals.isUpdating || sourceApprovals.isDeleting}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            {sourceApprovals.deletingSourceId === source.id ? "Deleting..." : "Delete"}
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
              );
            })}
            {!paginatedModerationSources.length && (
              <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">NO SOURCES MATCH THAT SEARCH.</div>
            )}
          </div>
        )}
      </GlassCard>
      )}

      {activeTool === "manual-editor" && (
      <GlassCard className="space-y-4 xl:col-span-2">
        <SectionTitle
          icon={Pencil}
          title="MANUAL EDITOR"
          subtitle="Choose Sources or Single Players, then safely edit display data used by MMM."
        />

        <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
          <Select value={editorCategory} onValueChange={(value) => setEditorCategory(value as "sources" | "single-players")}>
            <SelectTrigger className="h-10 bg-card text-[10px]">
              <SelectValue placeholder="Editor category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sources">Sources</SelectItem>
              <SelectItem value="single-players">Single Players</SelectItem>
            </SelectContent>
          </Select>
          <Input value={editorReason} onChange={(event) => setEditorReason(event.target.value)} placeholder="Reason for edit (optional)" className="font-pixel text-[10px]" />
        </div>

        {editorCategory === "sources" ? (
          <div className="grid gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-3">
              <Input value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} placeholder="Search source by name or slug" className="font-pixel text-[10px]" />
              <ScrollArea className="h-[22rem] border border-border bg-card">
                <div className="space-y-1 p-2">
                  {sourcesQuery.isLoading ? (
                    <SkeletonLeaderboardRows count={4} className="lg:grid-cols-1" />
                  ) : sourcesQuery.error ? (
                    <div className="pixel-card border border-rose-400/20 bg-rose-500/10 p-4 text-[10px] text-rose-100">
                      {(sourcesQuery.error as Error).message}
                    </div>
                  ) : (sourcesQuery.data?.sources ?? []).map((source) => (
                    <button
                      key={source.id}
                      className={`w-full border px-3 py-2 text-left transition-colors ${selectedSource?.id === source.id ? "border-primary/40 bg-primary/10" : "border-transparent hover:border-border hover:bg-secondary/40"}`}
                      onClick={() => {
                        setSelectedSource(source);
                        setSelectedSourceName(source.displayName);
                        setSelectedSourceTotal(String(source.totalBlocks ?? ""));
                        setSelectedSourceLogo(source.logoUrl ?? "");
                      }}
                    >
                      <div className="flex items-center gap-3">
                        {source.logoUrl ? <img src={source.logoUrl} alt={`${source.displayName} logo`} className="h-8 w-8 object-contain" /> : null}
                        <div className="min-w-0">
                          <div className="truncate font-pixel text-[10px] text-foreground">{source.displayName}</div>
                          <div className="mt-1 truncate text-[8px] leading-[1.6] text-muted-foreground">{source.slug} - {(source.totalBlocks ?? 0).toLocaleString()} blocks</div>
                          {source.needsManualReview ? (
                            <div className="mt-1 font-pixel text-[7px] uppercase tracking-wider text-amber-200">Needs name review</div>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))}
                  {!sourcesQuery.isLoading && !sourcesQuery.error && !(sourcesQuery.data?.sources ?? []).length && (
                    <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">NO SOURCES FOUND.</div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-4">
              {selectedSource ? (
                <>
                  <div className="pixel-card space-y-3 p-4">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                      <Input value={selectedSourceName} onChange={(event) => setSelectedSourceName(event.target.value)} placeholder="Source display name" className="font-pixel text-[10px]" />
                      <Input value={selectedSourceTotal} onChange={(event) => setSelectedSourceTotal(event.target.value)} placeholder="Source total blocks" className="font-pixel text-[10px]" />
                    </div>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                      <Input value={selectedSourceLogo} onChange={(event) => setSelectedSourceLogo(event.target.value)} placeholder="Logo URL or /generated/... path" className="font-pixel text-[10px]" />
                      <Button
                        onClick={() => {
                          const totalBlocks = selectedSourceTotal.trim() ? parseBlocksInput(selectedSourceTotal, "Source total") : null;
                          if (selectedSourceTotal.trim() && totalBlocks == null) return;
                          sourceUpdate.mutate({
                            sourceId: selectedSource.id,
                            displayName: selectedSourceName,
                            totalBlocks,
                            logoUrl: selectedSourceLogo.trim() || null,
                            reason: editorReason,
                          });
                        }}
                        disabled={sourceUpdate.isPending || !selectedSourceName.trim()}
                      >
                        Save Source
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
                    <Input value={rowSearch} onChange={(event) => setRowSearch(event.target.value)} placeholder="Search players inside this source" className="font-pixel text-[10px]" />
                    <div className="pixel-card px-4 py-3 text-[8px] leading-[1.7] text-muted-foreground">
                      Edit source-player block totals, or add a player to this source below.
                    </div>
                  </div>

                  <div className="pixel-card space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-pixel text-[9px] uppercase tracking-wider text-foreground">Add player to source</div>
                        <div className="mt-1 text-[8px] leading-[1.7] text-muted-foreground">
                          Select an existing profile or explicitly create a new player. Existing source rows are updated instead of duplicated.
                        </div>
                      </div>
                      <Select value={manualSourcePlayerMode} onValueChange={(value) => {
                        setManualSourcePlayerMode(value as "existing" | "new");
                        setManualSourcePlayerDraft((current) => ({ ...current, playerId: null, username: "" }));
                      }}>
                        <SelectTrigger className="h-9 w-[180px] bg-card text-[9px]">
                          <SelectValue placeholder="Player mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="existing">Existing Player</SelectItem>
                          <SelectItem value="new">New Player</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                      {manualSourcePlayerMode === "existing" ? (
                        <PlayerSelectorField
                          value={manualSourcePlayerDraft.username}
                          selectedPlayerId={manualSourcePlayerDraft.playerId}
                          players={manualEditorPlayerOptions}
                          loading={manualEditorPlayersQuery.isLoading}
                          onChange={(username, playerId) => setManualSourcePlayerDraft((current) => ({ ...current, username, playerId }))}
                          onSelect={(player) => setManualSourcePlayerDraft((current) => ({ ...current, username: player.username, playerId: player.playerId }))}
                        />
                      ) : (
                        <div className="space-y-1">
                          <Input
                            value={manualSourcePlayerDraft.username}
                            onChange={(event) => setManualSourcePlayerDraft((current) => ({
                              ...current,
                              username: event.target.value,
                              playerId: null,
                            }))}
                            placeholder="New player name"
                            className="font-pixel text-[10px]"
                          />
                          {manualSourceExactMatch ? (
                            <div className="font-pixel text-[7px] uppercase tracking-wider text-amber-100">
                              {manualSourceExactMatch.username} already exists. Select Existing Player to avoid a duplicate.
                            </div>
                          ) : null}
                        </div>
                      )}
                      <Input
                        value={manualSourcePlayerDraft.blocksMined}
                        onChange={(event) => setManualSourcePlayerDraft((current) => ({ ...current, blocksMined: event.target.value }))}
                        placeholder="Blocks mined"
                        className="font-pixel text-[10px]"
                      />
                      <Button
                        onClick={() => {
                          const blocksMined = parseBlocksInput(manualSourcePlayerDraft.blocksMined, "Blocks mined");
                          if (blocksMined == null || !selectedSource) return;
                          rowUpdate.mutate({
                            sourceId: selectedSource.id,
                            playerId: manualSourcePlayerMode === "existing" ? manualSourcePlayerDraft.playerId : null,
                            username: manualSourcePlayerDraft.username,
                            blocksMined,
                            createIfMissing: manualSourcePlayerMode === "new",
                            reason: editorReason,
                          });
                        }}
                        disabled={rowUpdate.isPending || !canAddManualSourcePlayer}
                      >
                        {rowUpdate.isPending ? "Saving..." : "Add / Update"}
                      </Button>
                    </div>
                  </div>

                  <ScrollArea className="h-[28rem] border border-border bg-card">
                    <div className="space-y-2 p-3">
                      {sourceRows.rows.map((row: EditableSourceRowSummary) => {
                        const draft = sourceRows.nextDrafts[row.playerId];
                        return (
                          <div key={row.playerId} className="pixel-card grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_180px_auto]">
                            <div className="flex min-w-0 items-center gap-3">
                              <PlayerAvatar username={row.username} className="h-8 w-8" fallbackClassName="text-[8px]" />
                              <div className="min-w-0">
                                <div className="truncate font-pixel text-[10px] text-foreground">{row.username}</div>
                                <div className="mt-1 text-[8px] text-muted-foreground">{formatTimeAgo(row.lastUpdated)}</div>
                              </div>
                            </div>
                            <Input
                              value={draft?.blocksMined ?? String(row.blocksMined)}
                              onChange={(event) => setRowDrafts((current) => ({
                                ...current,
                                [row.playerId]: {
                                  username: row.username,
                                  blocksMined: event.target.value,
                                },
                              }))}
                              className="font-pixel text-[10px]"
                            />
                            <Button
                              onClick={() => {
                                const blocksMined = parseBlocksInput(draft?.blocksMined ?? String(row.blocksMined), "Blocks mined");
                                if (blocksMined == null) return;
                                rowUpdate.mutate({
                                  sourceId: selectedSource.id,
                                  playerId: row.playerId,
                                  username: row.username,
                                  blocksMined,
                                  reason: editorReason,
                                });
                              }}
                              disabled={rowUpdate.isPending}
                            >
                              Save Data
                            </Button>
                          </div>
                        );
                      })}
                      {!sourceRows.rows.length && (
                        <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">NO PLAYERS FOUND IN THIS SOURCE.</div>
                      )}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">Select a source to edit its name, total, logo, and player data.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-3">
              <Input value={singlePlayerSearch} onChange={(event) => setSinglePlayerSearch(event.target.value)} placeholder="Search single player" className="font-pixel text-[10px]" />
              <ScrollArea className="h-[34rem] border border-border bg-card">
                <div className="space-y-1 p-2">
                  {singlePlayersQuery.isLoading ? (
                    <SkeletonLeaderboardRows count={4} className="lg:grid-cols-1" />
                  ) : singlePlayersQuery.error ? (
                    <div className="pixel-card border border-rose-400/20 bg-rose-500/10 p-4 text-[10px] text-rose-100">
                      {(singlePlayersQuery.error as Error).message}
                    </div>
                  ) : (singlePlayersQuery.data?.players ?? []).map((player: EditableSinglePlayerSummary) => (
                    <button
                      key={player.playerId}
                      className={`w-full border px-3 py-2 text-left transition-colors ${selectedSinglePlayer?.playerId === player.playerId ? "border-primary/40 bg-primary/10" : "border-transparent hover:border-border hover:bg-secondary/40"}`}
                      onClick={() => setSelectedSinglePlayer(player)}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <PlayerAvatar username={player.username} className="h-8 w-8" fallbackClassName="text-[8px]" />
                        <div className="min-w-0">
                          <div className="truncate font-pixel text-[10px] text-foreground">#{player.rank} {player.username}</div>
                          <div className="mt-1 truncate text-[8px] leading-[1.6] text-muted-foreground">
                            {player.sourceCount} sources - {player.blocksMined.toLocaleString()} blocks
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                  {!singlePlayersQuery.isLoading && !singlePlayersQuery.error && !(singlePlayersQuery.data?.players ?? []).length && (
                    <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">NO SINGLE PLAYERS FOUND.</div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-4">
              {selectedSinglePlayer ? (() => {
                const globalDraft = singlePlayerDrafts[selectedSinglePlayer.playerId] ?? {
                  blocksMined: String(selectedSinglePlayer.blocksMined),
                  flagUrl: selectedSinglePlayer.flagUrl ?? "",
                };
                return (
                  <>
                    <div className="pixel-card space-y-3 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-pixel text-[10px] text-foreground">#{selectedSinglePlayer.rank} {selectedSinglePlayer.username}</div>
                          <div className="mt-1 text-[8px] leading-[1.7] text-muted-foreground">
                            Global total and flag override. Use the source rows below to edit one source in this player's profile.
                          </div>
                        </div>
                        <PlayerAvatar username={selectedSinglePlayer.username} className="h-9 w-9" fallbackClassName="text-[8px]" />
                      </div>
                      <div className="grid gap-3 xl:grid-cols-[180px_minmax(0,1fr)_auto]">
                        <Input
                          value={globalDraft.blocksMined}
                          onChange={(event) => setSinglePlayerDrafts((current) => ({
                            ...current,
                            [selectedSinglePlayer.playerId]: {
                              blocksMined: event.target.value,
                              flagUrl: current[selectedSinglePlayer.playerId]?.flagUrl ?? selectedSinglePlayer.flagUrl ?? "",
                            },
                          }))}
                          placeholder="Global blocks mined"
                          className="font-pixel text-[10px]"
                        />
                        <Input
                          value={globalDraft.flagUrl}
                          onChange={(event) => setSinglePlayerDrafts((current) => ({
                            ...current,
                            [selectedSinglePlayer.playerId]: {
                              blocksMined: current[selectedSinglePlayer.playerId]?.blocksMined ?? String(selectedSinglePlayer.blocksMined),
                              flagUrl: event.target.value,
                            },
                          }))}
                          placeholder="Flag URL or /generated/... path"
                          className="font-pixel text-[10px]"
                        />
                        <Button
                          onClick={() => {
                            const blocksMined = parseBlocksInput(globalDraft.blocksMined, "Global blocks mined");
                            if (blocksMined == null) return;
                            singlePlayerUpdate.mutate({
                              playerId: selectedSinglePlayer.playerId,
                              blocksMined,
                              flagUrl: globalDraft.flagUrl.trim() || null,
                              reason: editorReason,
                            });
                          }}
                          disabled={singlePlayerUpdate.isPending}
                        >
                          Save Player
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
                      <Input value={singlePlayerSourceSearch} onChange={(event) => setSinglePlayerSourceSearch(event.target.value)} placeholder="Search this player's sources" className="font-pixel text-[10px]" />
                      <div className="pixel-card px-4 py-3 text-[8px] leading-[1.7] text-muted-foreground">
                        Source-specific edits update the row shown inside the player profile.
                      </div>
                    </div>

                    <ScrollArea className="h-[26rem] border border-border bg-card">
                      <div className="space-y-2 p-3">
                        {singlePlayerSourceRows.rows.map((row: EditableSinglePlayerSourceSummary) => {
                          const draftKey = `${row.sourceId}:${row.playerId}`;
                          const draft = singlePlayerSourceRows.nextDrafts[draftKey] ?? {
                            sourceName: row.sourceName,
                            blocksMined: String(row.blocksMined),
                          };
                          return (
                            <div key={draftKey} className="pixel-card grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto_auto]">
                              <div className="flex min-w-0 items-center gap-3">
                                {row.logoUrl ? <img src={row.logoUrl} alt={`${row.sourceName} logo`} className="h-8 w-8 object-contain" /> : null}
                                <div className="min-w-0">
                                  <div className="truncate font-pixel text-[10px] text-foreground">#{row.rank} {row.sourceName}</div>
                                  <div className="mt-1 truncate text-[8px] text-muted-foreground">{formatTimeAgo(row.lastUpdated)} - {row.sourceSlug}</div>
                                  {row.needsManualReview ? (
                                    <div className="mt-1 font-pixel text-[7px] uppercase tracking-wider text-amber-200">Unnamed SSP/HSP split - edit source name if known</div>
                                  ) : null}
                                </div>
                              </div>
                              <Input
                                value={draft.sourceName}
                                onChange={(event) => setSinglePlayerSourceDrafts((current) => ({
                                  ...current,
                                  [draftKey]: {
                                    sourceName: event.target.value,
                                    blocksMined: current[draftKey]?.blocksMined ?? String(row.blocksMined),
                                  },
                                }))}
                                placeholder="Source / world name"
                                className="font-pixel text-[10px]"
                              />
                              <Input
                                value={draft.blocksMined}
                                onChange={(event) => setSinglePlayerSourceDrafts((current) => ({
                                  ...current,
                                  [draftKey]: {
                                    sourceName: current[draftKey]?.sourceName ?? row.sourceName,
                                    blocksMined: event.target.value,
                                  },
                                }))}
                                placeholder="Blocks mined in source"
                                className="font-pixel text-[10px]"
                              />
                              <Button
                                onClick={() => {
                                  const sourceName = draft.sourceName.trim().replace(/\s+/g, " ");
                                  if (!sourceName) {
                                    toast.error("Source name cannot be empty.");
                                    return;
                                  }
                                  const blocksMined = parseBlocksInput(draft.blocksMined, "Source row blocks mined");
                                  if (blocksMined == null) return;
                                  rowUpdate.mutate({
                                    sourceId: row.sourceId,
                                    playerId: row.playerId,
                                    username: row.username,
                                    sourceName,
                                    blocksMined,
                                    reason: editorReason,
                                  });
                                }}
                                disabled={rowUpdate.isPending}
                              >
                                Save Source Row
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => setSinglePlayerSourceDrafts((current) => {
                                  const next = { ...current };
                                  delete next[draftKey];
                                  return next;
                                })}
                                disabled={rowUpdate.isPending}
                              >
                                Cancel
                              </Button>
                            </div>
                          );
                        })}
                        {singlePlayerSourcesQuery.isLoading && <SkeletonCard lines={3} />}
                        {!singlePlayerSourcesQuery.isLoading && !singlePlayerSourceRows.rows.length && (
                          <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">NO SOURCES FOUND FOR THIS PLAYER.</div>
                        )}
                      </div>
                    </ScrollArea>
                  </>
                );
              })() : (
                <div className="pixel-card p-4 font-pixel text-[10px] text-muted-foreground">Select a single player to edit their global data and source-specific profile rows.</div>
              )}
            </div>
          </div>
        )}
      </GlassCard>
      )}
      {activeTool === "site-content" && (
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
      )}

      {activeTool === "audit" && (
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
      )}
    </div>
  );
}

