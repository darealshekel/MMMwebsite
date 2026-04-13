import { supabaseAdmin } from "./server.js";

export const PUBLIC_SOURCE_BLOCKS_THRESHOLD = 1_000_000;
export const REJECTED_SOURCE_REVIEW_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export type SourceApprovalStatus = "pending" | "approved" | "rejected";
export type SourceScope = "public_server" | "private_singleplayer" | "unsupported";

export type WorldSourceRow = {
  id: string;
  world_key: string;
  display_name: string;
  kind: "singleplayer" | "multiplayer" | "realm" | "unknown";
  host?: string | null;
  source_scope?: SourceScope | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  approval_status?: SourceApprovalStatus | null;
  submitted_by_player_id?: string | null;
  submitted_at?: string | null;
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  icon_url?: string | null;
  scoreboard_title?: string | null;
  sample_sidebar_lines?: string[] | null;
  detected_stat_fields?: string[] | null;
  scan_confidence?: number | null;
  raw_scan_evidence?: Record<string, unknown> | null;
  scan_fingerprint?: string | null;
  last_scan_at?: string | null;
  last_scan_submitted_by_player_id?: string | null;
};

export type PlayerWorldStatRow = {
  player_id: string;
  world_id: string;
  total_blocks?: number | null;
  last_seen_at: string;
};

export type PlayerRow = {
  id: string;
  username: string;
  username_lower?: string | null;
  minecraft_uuid_hash?: string | null;
  last_seen_at: string;
};

export type ConnectedAccountRow = {
  user_id: string;
  minecraft_uuid_hash: string;
  minecraft_username: string;
};

export interface SourceRollup {
  id: string;
  worldKey: string;
  displayName: string;
  host: string | null;
  kind: "singleplayer" | "multiplayer" | "realm" | "unknown";
  sourceScope: SourceScope;
  totalBlocks: number;
  playerCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  approvalStatus: SourceApprovalStatus;
  submittedByPlayerId: string | null;
  submittedAt: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  iconUrl: string | null;
  scoreboardTitle: string | null;
  sampleSidebarLines: string[];
  detectedStatFields: string[];
  scanConfidence: number;
  rawScanEvidence: Record<string, unknown> | null;
  scanFingerprint: string | null;
  lastScanAt: string | null;
  lastScanSubmittedByPlayerId: string | null;
}

export function isPublicSourceApproved(rollup: Pick<SourceRollup, "sourceScope" | "approvalStatus">) {
  return rollup.sourceScope === "public_server" && rollup.approvalStatus === "approved";
}

export function isSourceVisibleInGlobalAggregation(rollup: Pick<SourceRollup, "sourceScope" | "approvalStatus">) {
  return (rollup.sourceScope === "private_singleplayer" && rollup.approvalStatus === "approved") || isPublicSourceApproved(rollup);
}

export function selectLeaderboardWorldRollups(sourceRollups: SourceRollup[]) {
  const globalVisible = sourceRollups.filter(isSourceVisibleInGlobalAggregation);
  const publicVisible = globalVisible.filter(isPublicSourceApproved);

  return {
    globalVisible,
    publicVisible,
  };
}

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export type AeternumAggregate = {
  playerCount: number;
  /** max(total_digs) — the server scoreboard's grand total; used for multiplayer sources */
  serverTotal: number;
  /** sum(player_digs) for non-fake players only; used for singleplayer sources */
  realPlayerSum: number;
};

export function buildSourceRollups(
  worlds: WorldSourceRow[],
  worldStats: PlayerWorldStatRow[],
  aeternumAggregates?: Map<string, AeternumAggregate>,
) {
  const totalsByWorldId = new Map<string, { totalBlocks: number; playerIds: Set<string>; lastSeenAt: string | null }>();

  for (const row of worldStats) {
    const blocks = toNumber(row.total_blocks);
    if (blocks <= 0) continue;

    const existing = totalsByWorldId.get(row.world_id) ?? {
      totalBlocks: 0,
      playerIds: new Set<string>(),
      lastSeenAt: null,
    };

    existing.totalBlocks += blocks;
    existing.playerIds.add(row.player_id);
    existing.lastSeenAt = existing.lastSeenAt && new Date(existing.lastSeenAt).getTime() > new Date(row.last_seen_at).getTime()
      ? existing.lastSeenAt
      : row.last_seen_at;
    totalsByWorldId.set(row.world_id, existing);
  }

  return worlds
    .map((world) => {
      const totals = totalsByWorldId.get(world.id);
      const aeternum = aeternumAggregates?.get(world.id);
      const modBlocks = totals?.totalBlocks ?? 0;
      const modPlayerCount = totals?.playerIds.size ?? 0;
      const isSingleplayer = world.kind === "singleplayer";
      return {
        id: world.id,
        worldKey: world.world_key,
        displayName: world.display_name,
        host: world.host ?? null,
        kind: world.kind,
        sourceScope: (world.source_scope ?? (world.kind === "singleplayer" ? "private_singleplayer" : "public_server")) as SourceScope,
        // For singleplayer: use only the mod-tracked total. Aeternum scoreboard
        // entries for singleplayer worlds include Carpet bots whose is_fake_player
        // flag is never set (the detector only runs on multiplayer servers), so
        // their player_digs would silently inflate the count.
        // For multiplayer: use total_digs (the server's own scoreboard grand total).
        totalBlocks: isSingleplayer
          ? modBlocks
          : Math.max(modBlocks, aeternum?.serverTotal ?? 0),
        // Singleplayer aeternum entries include Carpet bots — not real players.
        // Use only the mod-tracked unique real players for singleplayer.
        playerCount: isSingleplayer ? modPlayerCount : Math.max(modPlayerCount, aeternum?.playerCount ?? 0),
        firstSeenAt: world.first_seen_at ?? null,
        lastSeenAt: totals?.lastSeenAt ?? world.last_seen_at ?? null,
        approvalStatus: (world.approval_status ?? "pending") as SourceApprovalStatus,
        submittedByPlayerId: world.submitted_by_player_id ?? null,
        submittedAt: world.submitted_at ?? world.first_seen_at ?? null,
        reviewedByUserId: world.reviewed_by_user_id ?? null,
        reviewedAt: world.reviewed_at ?? null,
        iconUrl: world.icon_url ?? null,
        scoreboardTitle: world.scoreboard_title ?? null,
        sampleSidebarLines: Array.isArray(world.sample_sidebar_lines) ? world.sample_sidebar_lines.filter((value): value is string => typeof value === "string") : [],
        detectedStatFields: Array.isArray(world.detected_stat_fields) ? world.detected_stat_fields.filter((value): value is string => typeof value === "string") : [],
        scanConfidence: toNumber(world.scan_confidence),
        rawScanEvidence: world.raw_scan_evidence && typeof world.raw_scan_evidence === "object" && !Array.isArray(world.raw_scan_evidence)
          ? world.raw_scan_evidence
          : null,
        scanFingerprint: world.scan_fingerprint ?? null,
        lastScanAt: world.last_scan_at ?? null,
        lastScanSubmittedByPlayerId: world.last_scan_submitted_by_player_id ?? null,
      } satisfies SourceRollup;
    })
    .sort((a, b) => {
      if (a.approvalStatus === "pending" && b.approvalStatus !== "pending") return -1;
      if (b.approvalStatus === "pending" && a.approvalStatus !== "pending") return 1;
      return b.totalBlocks - a.totalBlocks || a.displayName.localeCompare(b.displayName);
    });
}

export async function loadSourceApprovalData() {
  const [worldsResult, worldStatsResult, playersResult, aeternumStatsResult] = await Promise.all([
    supabaseAdmin
      .from("worlds_or_servers")
      .select("id,world_key,display_name,kind,host,source_scope,first_seen_at,last_seen_at,approval_status,submitted_by_player_id,submitted_at,reviewed_by_user_id,reviewed_at,icon_url,scoreboard_title,sample_sidebar_lines,detected_stat_fields,scan_confidence,raw_scan_evidence,scan_fingerprint,last_scan_at,last_scan_submitted_by_player_id"),
    supabaseAdmin
      .from("player_world_stats")
      .select("player_id,world_id,total_blocks,last_seen_at"),
    supabaseAdmin
      .from("players")
      .select("id,username"),
    supabaseAdmin
      .from("aeternum_player_stats")
      .select("source_world_id,total_digs,player_digs")
      .eq("is_fake_player", false)
      .not("source_world_id", "is", null),
  ]);

  for (const result of [worldsResult, worldStatsResult, playersResult, aeternumStatsResult]) {
    if (result.error) throw result.error;
  }

  const aeternumAggregates = new Map<string, AeternumAggregate>();
  for (const row of aeternumStatsResult.data ?? []) {
    const worldId = String(row.source_world_id ?? "");
    if (!worldId) continue;
    const serverTotal = Number(row.total_digs ?? 0);
    const playerDigs = Number(row.player_digs ?? 0);
    const existing = aeternumAggregates.get(worldId) ?? { playerCount: 0, serverTotal: 0, realPlayerSum: 0 };
    existing.playerCount += 1;
    if (Number.isFinite(serverTotal) && serverTotal > existing.serverTotal) {
      existing.serverTotal = serverTotal;
    }
    if (Number.isFinite(playerDigs) && playerDigs > 0) {
      existing.realPlayerSum += playerDigs;
    }
    aeternumAggregates.set(worldId, existing);
  }

  return {
    worlds: (worldsResult.data ?? []) as WorldSourceRow[],
    worldStats: (worldStatsResult.data ?? []) as PlayerWorldStatRow[],
    players: (playersResult.data ?? []) as Array<{ id: string; username: string }>,
    aeternumAggregates,
  };
}
