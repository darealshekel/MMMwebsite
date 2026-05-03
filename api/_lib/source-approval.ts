import { isPlaceholderLeaderboardUsername, looksLikeSyntheticFakeUsername } from "../../shared/leaderboard-ingestion.js";
import { canonicalPlayerName, cleanPlayerDisplayName } from "../../shared/player-identity.js";
import { buildSourceSlug } from "../../shared/source-slug.js";
import { supabaseAdmin } from "./server.js";
import { selectUserIdentitiesByCanonicalNames } from "./user-identity.js";

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

function normalizePlayerIdentity(value: string | null | undefined) {
  return canonicalPlayerName(value ?? "");
}

export type AeternumAggregate = {
  playerCount: number;
  leaderboardRowCount: number;
  /** Verified in-game source total from the newest server scoreboard snapshot. */
  serverTotal: number;
  /** sum(player_digs) for valid non-fake player rows; canonical player-total input. */
  realPlayerSum: number;
  samplePlayerNames: string[];
};

type AeternumAggregateInputRow = {
  source_world_id?: string | null;
  player_id?: string | null;
  username?: string | null;
  username_lower?: string | null;
  player_digs?: number | string | null;
  total_digs?: number | string | null;
  latest_update?: string | null;
  is_fake_player?: boolean | null;
};

export type CanonicalSourceAggregate = {
  sourceId: string;
  sourceSlug: string;
  totalBlocks: number;
  playerCount: number;
  samplePlayerNames: string[];
};

type CanonicalScoreBucket = {
  rows: Map<string, { username: string; blocksMined: number; lastUpdated: string }>;
  keyByUsername: Map<string, string>;
};

type ServerTotalBucket = {
  latestUpdate: string;
  totalsByUpdate: Map<string, Map<number, number>>;
};

function timestampMs(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function shouldReplaceCanonicalScore(
  existing: { blocksMined: number; lastUpdated: string } | null | undefined,
  blocks: number,
  lastUpdated: string,
) {
  if (!existing) return true;
  const existingUpdatedAt = timestampMs(existing.lastUpdated);
  const incomingUpdatedAt = timestampMs(lastUpdated);
  if (existingUpdatedAt && incomingUpdatedAt && existingUpdatedAt !== incomingUpdatedAt) {
    return incomingUpdatedAt > existingUpdatedAt;
  }
  return blocks > existing.blocksMined || (blocks === existing.blocksMined && lastUpdated > existing.lastUpdated);
}

function recordServerTotal(bucket: ServerTotalBucket, totalDigs: number, latestUpdate: string) {
  if (totalDigs <= 0) return;
  const updateKey = latestUpdate || "";
  if (!bucket.latestUpdate || updateKey > bucket.latestUpdate) {
    bucket.latestUpdate = updateKey;
  }
  const totals = bucket.totalsByUpdate.get(updateKey) ?? new Map<number, number>();
  totals.set(totalDigs, (totals.get(totalDigs) ?? 0) + 1);
  bucket.totalsByUpdate.set(updateKey, totals);
}

function selectServerTotal(bucket: ServerTotalBucket) {
  const totals = bucket.totalsByUpdate.get(bucket.latestUpdate)
    ?? bucket.totalsByUpdate.get("")
    ?? new Map<number, number>();
  const selected = [...totals.entries()].sort((left, right) => {
    const countDelta = right[1] - left[1];
    return countDelta || right[0] - left[0];
  })[0];
  return selected?.[0] ?? 0;
}

function mergeCanonicalSourceScore(
  bucket: CanonicalScoreBucket,
  playerKey: string,
  username: string | null | undefined,
  blocksMined: number,
  lastUpdated = "",
) {
  const blocks = toNumber(blocksMined);
  if (!playerKey || blocks <= 0) return;

  const usernameValue = cleanPlayerDisplayName(username ?? playerKey) || playerKey;
  const usernameKey = normalizePlayerIdentity(usernameValue);
  if (isPlaceholderLeaderboardUsername(usernameKey)) return;
  const targetKey = bucket.rows.has(playerKey)
    ? playerKey
    : usernameKey
      ? bucket.keyByUsername.get(usernameKey) ?? playerKey
      : playerKey;
  const existing = bucket.rows.get(targetKey);
  if (shouldReplaceCanonicalScore(existing, blocks, lastUpdated)) {
    bucket.rows.set(targetKey, {
      username: existing?.username || usernameValue,
      blocksMined: blocks,
      lastUpdated,
    });
  }
  if (usernameKey) {
    bucket.keyByUsername.set(usernameKey, targetKey);
  }
}

export function isValidAeternumPlayerStat(input: {
  usernameLower?: string | null;
  playerDigs?: number | string | null;
  serverTotal?: number | string | null;
  isFakePlayer?: boolean | null;
}) {
  const usernameLower = normalizePlayerIdentity(input.usernameLower);
  const digs = toNumber(input.playerDigs);
  const serverTotal = toNumber(input.serverTotal);
  return usernameLower !== ""
    && digs > 0
    && !input.isFakePlayer
    && !looksLikeSyntheticFakeUsername(usernameLower)
    && !isPlaceholderLeaderboardUsername(usernameLower)
    && !(serverTotal > 0 && digs > serverTotal);
}

export function buildAeternumAggregates(rows: AeternumAggregateInputRow[]) {
  const aggregateBuckets = new Map<string, {
    serverTotals: ServerTotalBucket;
    players: Map<string, { username: string; blocksMined: number; latestUpdate: string }>;
  }>();

  for (const row of rows) {
    const worldId = normalize(row.source_world_id);
    if (!worldId) continue;

    const bucket = aggregateBuckets.get(worldId) ?? {
      serverTotals: { latestUpdate: "", totalsByUpdate: new Map<string, Map<number, number>>() },
      players: new Map<string, { username: string; blocksMined: number; latestUpdate: string }>(),
    };
    aggregateBuckets.set(worldId, bucket);

    const digs = toNumber(row.player_digs);
    const totalDigs = toNumber(row.total_digs);
    const latestUpdate = String(row.latest_update ?? "");
    const usernameLower = normalizePlayerIdentity(row.username_lower ?? row.username);
    const username = cleanPlayerDisplayName(row.username ?? usernameLower) || usernameLower;

    if (!isValidAeternumPlayerStat({
      usernameLower,
      playerDigs: digs,
      serverTotal: totalDigs,
      isFakePlayer: Boolean(row.is_fake_player),
    })) {
      continue;
    }
    recordServerTotal(bucket.serverTotals, totalDigs, latestUpdate);

    const playerKey = usernameLower || normalize(row.player_id);
    if (!playerKey) continue;
    const existing = bucket.players.get(playerKey);
    if (!existing || latestUpdate > existing.latestUpdate || (latestUpdate === existing.latestUpdate && digs > existing.blocksMined) || (!latestUpdate && digs > existing.blocksMined)) {
      bucket.players.set(playerKey, { username, blocksMined: digs, latestUpdate });
    }
  }

  const aggregates = new Map<string, AeternumAggregate>();
  for (const [worldId, bucket] of aggregateBuckets.entries()) {
    const playerRows = [...bucket.players.values()];
    aggregates.set(worldId, {
      playerCount: playerRows.length,
      leaderboardRowCount: playerRows.length,
      serverTotal: selectServerTotal(bucket.serverTotals),
      realPlayerSum: playerRows.reduce((sum, row) => sum + row.blocksMined, 0),
      samplePlayerNames: playerRows.slice(0, 12).map((row) => row.username),
    });
  }

  return aggregates;
}

export function buildSourceRollups(
  worlds: WorldSourceRow[],
  worldStats: PlayerWorldStatRow[],
  aeternumAggregates?: Map<string, AeternumAggregate>,
  options?: {
    preferAeternumForAdmin?: boolean;
    canonicalSourceAggregates?: Map<string, CanonicalSourceAggregate>;
  },
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
      const canonical = options?.canonicalSourceAggregates?.get(world.id);
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
      const canonicalBlocks = canonical?.totalBlocks ?? 0;
      const canonicalPlayerCount = canonical?.playerCount ?? 0;
      const verifiedServerTotal = aeternum?.serverTotal ?? 0;
      const multiplayerTotalBlocks = verifiedServerTotal > 0
        ? verifiedServerTotal
        : Math.max(modBlocks, aeternumPlayerSum, canonicalBlocks);
      const totalBlocks = isSingleplayer
        ? singleplayerTotalBlocks
        : multiplayerTotalBlocks;
      if (!isSingleplayer && verifiedServerTotal > 0 && verifiedServerTotal !== Math.max(aeternumPlayerSum, canonicalBlocks)) {
        console.warn("[source-approval] verified source total differs from player sum", {
          sourceId: world.id,
          worldId: world.id,
          canonicalSourceId: canonical?.sourceId ?? null,
          sourceName: world.display_name,
          verifiedSourceTotal: verifiedServerTotal,
          calculatedApprovedTotal: totalBlocks,
          perPlayerSum: aeternumPlayerSum,
          canonicalSourceTotal: canonicalBlocks,
          modTrackedTotal: modBlocks,
          affectedPlayerNames: canonical?.samplePlayerNames?.length ? canonical.samplePlayerNames : aeternum?.samplePlayerNames ?? [],
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
        playerCount: isSingleplayer ? singleplayerPlayerCount : Math.max(modPlayerCount, aeternumVisiblePlayerCount, canonicalPlayerCount),
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
          .select("source_world_id,player_id,minecraft_uuid_hash,username,username_lower,player_digs,total_digs,latest_update,is_fake_player")
          .in("source_world_id", worldIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  for (const result of [playersResult, worldStatsResult, aeternumStatsResult]) {
    if (result.error) throw result.error;
  }

  const aeternumAggregates = buildAeternumAggregates((aeternumStatsResult.data ?? []) as AeternumAggregateInputRow[]);

  const canonicalSourceAggregates = new Map<string, CanonicalSourceAggregate>();
  const worldSlugEntries = worlds
    .filter((world) => world.source_scope === "public_server" || (world.kind !== "singleplayer" && world.source_scope == null))
    .map((world) => ({
      world,
      slug: buildSourceSlug({
        displayName: world.display_name,
        worldKey: world.world_key,
        host: world.host ?? undefined,
      }),
    }))
    .filter((entry) => entry.slug);
  const worldIdBySourceId = new Map<string, string>();
  const sourceByWorldId = new Map<string, { id: string; slug: string }>();

  if (worldSlugEntries.length > 0) {
    const slugs = [...new Set(worldSlugEntries.map((entry) => entry.slug))];
    const { data: sourceRows, error: sourceRowsError } = await supabaseAdmin
      .from("sources")
      .select("id,slug")
      .in("slug", slugs)
      .eq("is_public", true)
      .eq("is_approved", true)
      .limit(1000);
    if (sourceRowsError) throw sourceRowsError;

    const worldBySlug = new Map(worldSlugEntries.map((entry) => [entry.slug, entry.world]));
    for (const source of (sourceRows ?? []) as Array<{ id: string; slug: string }>) {
      const world = worldBySlug.get(source.slug);
      if (!world) continue;
      worldIdBySourceId.set(source.id, world.id);
      sourceByWorldId.set(world.id, { id: source.id, slug: source.slug });
    }
  }

  if (worldIdBySourceId.size > 0) {
    const sourceIds = [...worldIdBySourceId.keys()];
    const { data: entryRows, error: entryRowsError } = await supabaseAdmin
      .from("leaderboard_entries")
      .select("player_id,source_id,score")
      .in("source_id", sourceIds)
      .gt("score", 0)
      .limit(20_000);
    if (entryRowsError) throw entryRowsError;

    const entryPlayerIds = [
      ...new Set(
        [
          ...((entryRows ?? []) as Array<{ player_id?: string | null }>).map((row) => row.player_id),
          ...((worldStatsResult.data ?? []) as Array<{ player_id?: string | null; world_id?: string | null }>)
            .filter((row) => row.world_id && sourceByWorldId.has(row.world_id))
            .map((row) => row.player_id),
        ]
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
    ];
    const aeternumUsernamesLower = [
      ...new Set(
        ((aeternumStatsResult.data ?? []) as Array<{ source_world_id?: string | null; username?: string | null; username_lower?: string | null }>)
          .filter((row) => row.source_world_id && sourceByWorldId.has(normalize(row.source_world_id)))
          .map((row) => normalizePlayerIdentity(row.username_lower ?? row.username))
          .filter(Boolean),
      ),
    ];
    const [entryPlayersResult, aeternumUsersResult] = await Promise.all([
      entryPlayerIds.length > 0
        ? supabaseAdmin
            .from("users")
            .select("id,username")
            .in("id", entryPlayerIds)
        : Promise.resolve({ data: [], error: null } as const),
      selectUserIdentitiesByCanonicalNames(aeternumUsernamesLower),
    ]);
    if (entryPlayersResult.error) throw entryPlayersResult.error;
    if (aeternumUsersResult.error) throw aeternumUsersResult.error;

    const entryPlayersById = new Map(
      ((entryPlayersResult.data ?? []) as Array<{ id: string; username?: string | null }>)
        .map((row) => [row.id, row.username ?? row.id]),
    );
    const usersByUsernameLower = new Map(
      ((aeternumUsersResult.data ?? []) as Array<{ id: string; username?: string | null; username_lower?: string | null; canonical_name?: string | null }>)
        .filter((row) => row.id && row.username)
        .map((row) => [normalizePlayerIdentity(row.canonical_name ?? row.username_lower ?? row.username), { id: row.id, username: row.username as string }]),
    );

    const bucketsByWorldId = new Map<string, CanonicalScoreBucket>();
    const bucketForWorld = (worldId: string) => {
      const bucket = bucketsByWorldId.get(worldId) ?? { rows: new Map(), keyByUsername: new Map() };
      bucketsByWorldId.set(worldId, bucket);
      return bucket;
    };

    for (const row of (entryRows ?? []) as Array<{ player_id?: string | null; source_id?: string | null; score?: number | string | null }>) {
      if (!row.player_id || !row.source_id) continue;
      const worldId = worldIdBySourceId.get(row.source_id);
      if (!worldId) continue;
      mergeCanonicalSourceScore(
        bucketForWorld(worldId),
        row.player_id,
        entryPlayersById.get(row.player_id) ?? row.player_id,
        toNumber(row.score),
      );
    }

    for (const row of (worldStatsResult.data ?? []) as PlayerWorldStatRow[]) {
      if (!sourceByWorldId.has(row.world_id)) continue;
      mergeCanonicalSourceScore(
        bucketForWorld(row.world_id),
        row.player_id,
        entryPlayersById.get(row.player_id) ?? row.player_id,
        toNumber(row.total_blocks),
      );
    }

    for (const row of (aeternumStatsResult.data ?? []) as Array<{ source_world_id?: string | null; player_id?: string | null; username?: string | null; username_lower?: string | null; player_digs?: number | string | null; total_digs?: number | string | null; latest_update?: string | null; is_fake_player?: boolean | null }>) {
      const worldId = normalize(row.source_world_id);
      if (!worldId || !sourceByWorldId.has(worldId)) continue;
      const usernameLower = normalizePlayerIdentity(row.username_lower ?? row.username);
      const username = cleanPlayerDisplayName(row.username ?? usernameLower) || usernameLower;
      if (!isValidAeternumPlayerStat({
        usernameLower,
        playerDigs: row.player_digs,
        serverTotal: row.total_digs,
        isFakePlayer: row.is_fake_player,
      })) continue;
      const resolvedUser = usersByUsernameLower.get(usernameLower);
      const playerKey = String(row.player_id ?? resolvedUser?.id ?? `scoreboard:${worldId}:${usernameLower}`);
      mergeCanonicalSourceScore(
        bucketForWorld(worldId),
        playerKey,
        resolvedUser?.username ?? username,
        toNumber(row.player_digs),
        String(row.latest_update ?? ""),
      );
    }

    for (const [worldId, bucket] of bucketsByWorldId.entries()) {
      const source = sourceByWorldId.get(worldId);
      if (!source) continue;
      canonicalSourceAggregates.set(worldId, {
        sourceId: source.id,
        sourceSlug: source.slug,
        totalBlocks: [...bucket.rows.values()].reduce((sum, score) => sum + score.blocksMined, 0),
        playerCount: bucket.rows.size,
        samplePlayerNames: [...bucket.rows.values()].slice(0, 12).map((row) => row.username),
      });
    }
  }

  return {
    worlds,
    worldStats: (worldStatsResult.data ?? []) as PlayerWorldStatRow[],
    players: (playersResult.data ?? []) as Array<{ id: string; username: string }>,
    // Load only stats for the currently reviewable worlds so the approval card
    // shows real totals without scanning the full historical dataset.
    aeternumAggregates,
    canonicalSourceAggregates,
  };
}
