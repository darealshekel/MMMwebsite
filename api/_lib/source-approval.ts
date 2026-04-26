import { isPlaceholderLeaderboardUsername, looksLikeSyntheticFakeUsername } from "../../shared/leaderboard-ingestion.js";
import { supabaseAdmin } from "./server.js";

export const PUBLIC_SOURCE_BLOCKS_THRESHOLD = 1_000_000;
export const REJECTED_SOURCE_REVIEW_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const SOURCE_APPROVAL_PENDING_LIMIT = 120;
const SOURCE_APPROVAL_REVIEWED_LIMIT = 24;
const SOURCE_APPROVAL_WORLD_SELECT = "id,world_key,display_name,kind,host,source_scope,first_seen_at,last_seen_at,approval_status,submitted_by_player_id,submitted_at,reviewed_by_user_id,reviewed_at,icon_url,scoreboard_title,sample_sidebar_lines,detected_stat_fields,scan_confidence,scan_fingerprint,last_scan_at,last_scan_submitted_by_player_id";

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
  leaderboardRowCount: number;
  /** max(total_digs) — verified in-game source total from the server scoreboard. */
  serverTotal: number;
  /** sum(player_digs) for valid non-fake player rows; canonical player-total input. */
  realPlayerSum: number;
  samplePlayerNames: string[];
};

export function isValidAeternumPlayerStat(input: {
  usernameLower?: string | null;
  playerDigs?: number | string | null;
  serverTotal?: number | string | null;
  isFakePlayer?: boolean | null;
}) {
  const usernameLower = normalize(input.usernameLower);
  const digs = toNumber(input.playerDigs);
  const serverTotal = toNumber(input.serverTotal);
  return usernameLower !== ""
    && digs > 0
    && !input.isFakePlayer
    && !looksLikeSyntheticFakeUsername(usernameLower)
    && !isPlaceholderLeaderboardUsername(usernameLower)
    && !(serverTotal > 0 && digs > serverTotal);
}

export function buildSourceRollups(
  worlds: WorldSourceRow[],
  worldStats: PlayerWorldStatRow[],
  aeternumAggregates?: Map<string, AeternumAggregate>,
  options?: { preferAeternumForAdmin?: boolean },
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
      const preferAeternumForAdmin = options?.preferAeternumForAdmin === true && modBlocks <= 0 && modPlayerCount <= 0;
      const aeternumVisiblePlayerCount = aeternum?.leaderboardRowCount ?? 0;
      const aeternumPlayerSum = aeternum?.realPlayerSum ?? 0;
      // Singleplayer worlds can under-report in player_world_stats during early
      // sync windows. Use aeternum sum as a fallback only when its player count
      // is close to mod-tracked players (reduces Carpet-bot inflation risk).
      const trustedSingleplayerAeternum =
        isSingleplayer &&
        aeternumVisiblePlayerCount > 0 &&
        (
          preferAeternumForAdmin ||
          aeternumVisiblePlayerCount <= Math.max(1, modPlayerCount + 1)
        );
      const singleplayerTotalBlocks = trustedSingleplayerAeternum
        ? Math.max(modBlocks, aeternumPlayerSum)
        : modBlocks;
      const singleplayerPlayerCount = trustedSingleplayerAeternum
        ? Math.max(modPlayerCount, aeternumVisiblePlayerCount)
        : modPlayerCount;
      const multiplayerTotalBlocks = Math.max(modBlocks, aeternum?.serverTotal ?? 0, aeternumPlayerSum);
      const totalBlocks = isSingleplayer
        ? singleplayerTotalBlocks
        : multiplayerTotalBlocks;
      if (!isSingleplayer && aeternum?.serverTotal && aeternum.serverTotal !== aeternumPlayerSum) {
        console.warn("[source-approval] verified source total differs from player sum", {
          sourceId: world.id,
          worldId: world.id,
          sourceName: world.display_name,
          verifiedSourceTotal: aeternum.serverTotal,
          calculatedApprovedTotal: totalBlocks,
          perPlayerSum: aeternumPlayerSum,
          modTrackedTotal: modBlocks,
          affectedPlayerNames: aeternum.samplePlayerNames,
        });
      }
      return {
        id: world.id,
        worldKey: world.world_key,
        displayName: world.display_name,
        host: world.host ?? null,
        kind: world.kind,
        sourceScope: (world.source_scope ?? (world.kind === "singleplayer" ? "private_singleplayer" : "public_server")) as SourceScope,
        totalBlocks,
        // Singleplayer fallback uses aeternum player count only when trusted.
        // Multiplayer visibility should reflect valid visible scoreboard rows,
        // not whether those players used the mod.
        playerCount: isSingleplayer ? singleplayerPlayerCount : Math.max(modPlayerCount, aeternumVisiblePlayerCount),
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
        rawScanEvidence: null,
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

async function loadApprovalWorlds() {
  const [pendingResult, approvedResult, rejectedResult] = await Promise.all([
    supabaseAdmin
      .from("worlds_or_servers")
      .select(SOURCE_APPROVAL_WORLD_SELECT)
      .eq("approval_status", "pending")
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(SOURCE_APPROVAL_PENDING_LIMIT),
    supabaseAdmin
      .from("worlds_or_servers")
      .select(SOURCE_APPROVAL_WORLD_SELECT)
      .eq("approval_status", "approved")
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(Math.floor(SOURCE_APPROVAL_REVIEWED_LIMIT / 2)),
    supabaseAdmin
      .from("worlds_or_servers")
      .select(SOURCE_APPROVAL_WORLD_SELECT)
      .eq("approval_status", "rejected")
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(Math.ceil(SOURCE_APPROVAL_REVIEWED_LIMIT / 2)),
  ]);

  if (pendingResult.error) throw pendingResult.error;
  if (approvedResult.error) throw approvedResult.error;
  if (rejectedResult.error) throw rejectedResult.error;

  const merged = new Map<string, WorldSourceRow>();
  for (const row of pendingResult.data ?? []) {
    if (row?.id) {
      merged.set(String(row.id), row as WorldSourceRow);
    }
  }
  for (const row of approvedResult.data ?? []) {
    if (row?.id) {
      merged.set(String(row.id), row as WorldSourceRow);
    }
  }
  for (const row of rejectedResult.data ?? []) {
    if (row?.id) {
      merged.set(String(row.id), row as WorldSourceRow);
    }
  }

  return [...merged.values()];
}

export async function loadSourceApprovalData() {
  const worlds = await loadApprovalWorlds();
  const worldIds = worlds
    .map((world) => world.id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const playerIds = [
    ...new Set(
      worlds
        .flatMap((world) => [world.submitted_by_player_id, world.last_scan_submitted_by_player_id])
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ];

  const [playersResult, worldStatsResult, aeternumStatsResult] = await Promise.all([
    playerIds.length > 0
      ? supabaseAdmin
          .from("users")
          .select("id,username")
          .in("id", playerIds)
      : Promise.resolve({ data: [], error: null } as const),
    worldIds.length > 0
      ? supabaseAdmin
          .from("player_world_stats")
          .select("player_id,world_id,total_blocks,last_seen_at")
          .in("world_id", worldIds)
          .gt("total_blocks", 0)
      : Promise.resolve({ data: [], error: null } as const),
    worldIds.length > 0
      ? supabaseAdmin
          .from("aeternum_player_stats")
          .select("source_world_id,player_id,minecraft_uuid_hash,username,username_lower,player_digs,total_digs,is_fake_player")
          .in("source_world_id", worldIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  for (const result of [playersResult, worldStatsResult, aeternumStatsResult]) {
    if (result.error) throw result.error;
  }

  const aeternumAggregates = new Map<string, AeternumAggregate>();
  for (const row of aeternumStatsResult.data ?? []) {
    const worldId = normalize((row as { source_world_id?: string | null }).source_world_id);
    if (!worldId) continue;

    const existing = aeternumAggregates.get(worldId) ?? {
      playerCount: 0,
      leaderboardRowCount: 0,
      serverTotal: 0,
      realPlayerSum: 0,
      samplePlayerNames: [],
    };

    const digs = toNumber((row as { player_digs?: number | null }).player_digs);
    const totalDigs = toNumber((row as { total_digs?: number | null }).total_digs);
    const isFake = Boolean((row as { is_fake_player?: boolean | null }).is_fake_player);
    const usernameLower = normalize((row as { username_lower?: string | null }).username_lower);
    const username = String((row as { username?: string | null }).username ?? usernameLower);
    existing.serverTotal = Math.max(existing.serverTotal, totalDigs);
    if (isValidAeternumPlayerStat({
      usernameLower,
      playerDigs: digs,
      serverTotal: totalDigs,
      isFakePlayer: isFake,
    })) {
      existing.leaderboardRowCount += 1;
      existing.realPlayerSum += digs;
      existing.playerCount += 1;
      if (existing.samplePlayerNames.length < 12) {
        existing.samplePlayerNames.push(username);
      }
    }

    aeternumAggregates.set(worldId, existing);
  }

  return {
    worlds,
    worldStats: (worldStatsResult.data ?? []) as PlayerWorldStatRow[],
    players: (playersResult.data ?? []) as Array<{ id: string; username: string }>,
    // Load only stats for the currently reviewable worlds so the approval card
    // shows real totals without scanning the full historical dataset.
    aeternumAggregates,
  };
}
