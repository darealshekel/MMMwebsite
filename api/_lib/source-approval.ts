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

export function selectLeaderboardWorldRollups(sourceRollups: SourceRollup[]) {
  const globalVisible = sourceRollups.filter((rollup) =>
    rollup.sourceScope === "private_singleplayer"
    || (rollup.sourceScope === "public_server" && rollup.approvalStatus === "approved"),
  );

  const publicVisible = globalVisible.filter((rollup) =>
    rollup.sourceScope === "public_server" && rollup.approvalStatus === "approved",
  );

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

export function isCanonicalAeternumWorld(world: Pick<WorldSourceRow, "display_name" | "world_key" | "host">) {
  const displayName = normalize(world.display_name);
  const worldKey = normalize(world.world_key);
  const host = normalize(world.host);

  return displayName === "aeternum"
    || worldKey === "aeternum"
    || worldKey === "mc.aeternumsmp.net"
    || host === "mc.aeternumsmp.net";
}

export function buildSourceRollups(worlds: WorldSourceRow[], worldStats: PlayerWorldStatRow[]) {
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
      return {
        id: world.id,
        worldKey: world.world_key,
        displayName: world.display_name,
        host: world.host ?? null,
        kind: world.kind,
        sourceScope: (world.source_scope ?? (world.kind === "singleplayer" ? "private_singleplayer" : "public_server")) as SourceScope,
        totalBlocks: totals?.totalBlocks ?? 0,
        playerCount: totals?.playerIds.size ?? 0,
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
    .filter((rollup) => !isCanonicalAeternumWorld({
      display_name: rollup.displayName,
      world_key: rollup.worldKey,
      host: rollup.host,
    }))
    .sort((a, b) => {
      if (a.approvalStatus === "pending" && b.approvalStatus !== "pending") return -1;
      if (b.approvalStatus === "pending" && a.approvalStatus !== "pending") return 1;
      return b.totalBlocks - a.totalBlocks || a.displayName.localeCompare(b.displayName);
    });
}

export async function loadSourceApprovalData() {
  const [worldsResult, worldStatsResult, playersResult] = await Promise.all([
    supabaseAdmin
      .from("worlds_or_servers")
      .select("id,world_key,display_name,kind,host,source_scope,first_seen_at,last_seen_at,approval_status,submitted_by_player_id,submitted_at,reviewed_by_user_id,reviewed_at,icon_url,scoreboard_title,sample_sidebar_lines,detected_stat_fields,scan_confidence,raw_scan_evidence,scan_fingerprint,last_scan_at,last_scan_submitted_by_player_id"),
    supabaseAdmin
      .from("player_world_stats")
      .select("player_id,world_id,total_blocks,last_seen_at"),
    supabaseAdmin
      .from("players")
      .select("id,username"),
  ]);

  for (const result of [worldsResult, worldStatsResult, playersResult]) {
    if (result.error) throw result.error;
  }

  return {
    worlds: (worldsResult.data ?? []) as WorldSourceRow[],
    worldStats: (worldStatsResult.data ?? []) as PlayerWorldStatRow[],
    players: (playersResult.data ?? []) as Array<{ id: string; username: string }>,
  };
}
