import type { LeaderboardRowSummary, LeaderboardViewKind } from "../../src/lib/types.js";
import { isPlaceholderLeaderboardUsername } from "../../shared/leaderboard-ingestion.js";
import { buildSourceSlug } from "../../shared/source-slug.js";
import { supabaseAdmin } from "./server.js";
import { buildSourceRollups, isValidAeternumPlayerStat, loadSourceApprovalData, selectLeaderboardWorldRollups } from "./source-approval.js";

export interface PublicSourceSummary {
  id: string;
  slug: string;
  displayName: string;
  sourceType: string;
}

export interface LeaderboardPageResult {
  scope: "main" | "source";
  title: string;
  description: string;
  scoreLabel: "Blocks Mined";
  source: PublicSourceSummary | null;
  featuredRows: LeaderboardRowSummary[];
  rows: LeaderboardRowSummary[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  totalBlocks: number;
  playerCount: number;
  highlightedPlayer: string | null;
  publicSources: PublicSourceSummary[];
}

type SourceRow = {
  id: string;
  slug: string;
  display_name: string;
  source_type: string;
  is_public: boolean;
  is_approved: boolean;
};

type LeaderboardEntryRow = {
  player_id: string;
  score: number | null;
  updated_at: string;
  source_id: string | null;
  sources?: {
    id: string;
    slug: string;
    display_name: string;
    source_type: string;
    is_public: boolean;
    is_approved: boolean;
  } | Array<{
    id: string;
    slug: string;
    display_name: string;
    source_type: string;
    is_public: boolean;
    is_approved: boolean;
  }> | null;
};

type PlayerRow = {
  id: string;
  username: string;
  minecraft_uuid_hash?: string | null;
};

type AeternumPlayerStatRow = {
  player_id: string | null;
  username: string;
  username_lower: string | null;
  player_digs: number | null;
  total_digs?: number | null;
  latest_update: string;
  is_fake_player: boolean | null;
  server_name: string | null;
  minecraft_uuid_hash?: string | null;
};

export type RankedRowInput = {
  playerId: string;
  username: string;
  blocksMined: number;
  lastUpdated: string;
  sourceId: string | null;
  sourceSlug: string | null;
  sourceServer: string;
  viewKind: LeaderboardViewKind;
  sourceCount: number;
};

type SourceDataset = {
  source: PublicSourceSummary;
  rows: LeaderboardRowSummary[];
  totalBlocks: number;
  playerCount: number;
};

type CanonicalSourceTotals = {
  bySourceSlug: Map<string, { worldId: string; totalBlocks: number; playerCount: number }>;
  globalTotalBlocks: number;
};

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

const DEFAULT_STEVE_SKIN_FACE_URL = "https://minotar.net/avatar/Steve/64";
const WHITESPACE_USERNAME = /\s/;

function buildSkinFaceUrl(username: string) {
  if (WHITESPACE_USERNAME.test(username.trim())) {
    return DEFAULT_STEVE_SKIN_FACE_URL;
  }
  return `https://minotar.net/avatar/${encodeURIComponent(username)}/64`;
}

function mapPublicSource(row: SourceRow): PublicSourceSummary {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    sourceType: row.source_type,
  };
}

async function loadCanonicalSourceTotals(): Promise<CanonicalSourceTotals> {
  const data = await loadSourceApprovalData();
  const rollups = buildSourceRollups(data.worlds, data.worldStats, data.aeternumAggregates, {
    canonicalSourceAggregates: data.canonicalSourceAggregates,
  });
  const { globalVisible, publicVisible } = selectLeaderboardWorldRollups(rollups);

  const bySourceSlug = new Map<string, { worldId: string; totalBlocks: number; playerCount: number }>();
  for (const rollup of publicVisible) {
    const slug = buildSourceSlug({
      displayName: rollup.displayName,
      worldKey: rollup.worldKey,
      host: rollup.host,
    });
    bySourceSlug.set(slug, {
      worldId: rollup.id,
      totalBlocks: rollup.totalBlocks,
      playerCount: rollup.playerCount,
    });
  }

  return {
    bySourceSlug,
    globalTotalBlocks: globalVisible.reduce((sum, rollup) => sum + rollup.totalBlocks, 0),
  };
}

function buildRankedLeaderboardRows(rows: RankedRowInput[]): LeaderboardRowSummary[] {
  const sorted = [...rows].sort((left, right) => {
    if (right.blocksMined !== left.blocksMined) {
      return right.blocksMined - left.blocksMined;
    }

    const usernameComparison = left.username.localeCompare(right.username);
    if (usernameComparison !== 0) {
      return usernameComparison;
    }

    return left.playerId.localeCompare(right.playerId);
  });

  let previousScore: number | null = null;
  let currentRank = 0;

  return sorted.map((row, index) => {
    if (previousScore !== row.blocksMined) {
      currentRank = index + 1;
      previousScore = row.blocksMined;
    }

    return {
      playerId: row.playerId,
      username: row.username,
      skinFaceUrl: buildSkinFaceUrl(row.username),
      lastUpdated: row.lastUpdated,
      blocksMined: row.blocksMined,
      totalDigs: row.blocksMined,
      rank: currentRank,
      sourceServer: row.sourceServer,
      sourceKey: row.sourceSlug ? `source:${row.sourceSlug}` : "main",
      sourceCount: row.sourceCount,
      viewKind: row.viewKind,
      sourceId: row.sourceId,
      sourceSlug: row.sourceSlug,
      rowKey: row.sourceId ? `${row.sourceId}-${row.playerId}` : row.playerId,
    };
  });
}

function filterRows(rows: LeaderboardRowSummary[], query: string | null | undefined, minBlocks: number) {
  const normalizedQuery = (query ?? "").trim().toLowerCase();
  return rows.filter((row) => {
    if (minBlocks > 0 && row.blocksMined < minBlocks) {
      return false;
    }

    if (normalizedQuery && !normalizeUsername(row.username).includes(normalizedQuery)) {
      return false;
    }

    return true;
  });
}

function paginateRows(rows: LeaderboardRowSummary[], page: number, pageSize: number) {
  const safePageSize = Math.max(1, Math.min(250, Math.floor(pageSize) || 50));
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / safePageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const startIndex = (safePage - 1) * safePageSize;

  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows,
    totalPages,
    rows: rows.slice(startIndex, startIndex + safePageSize),
  };
}

async function loadPlayersById(playerIds: string[]) {
  if (playerIds.length === 0) {
    return new Map<string, PlayerRow>();
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,username,minecraft_uuid_hash")
    .in("id", playerIds);

  if (error) throw error;

  return new Map(((data ?? []) as PlayerRow[]).map((row) => [row.id, row]));
}

async function loadPlayersByUsernameLower(usernamesLower: string[]) {
  if (usernamesLower.length === 0) {
    return new Map<string, PlayerRow>();
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,username,username_lower,minecraft_uuid_hash")
    .in("username_lower", usernamesLower);

  if (error) throw error;

  return new Map(
    ((data ?? []) as Array<PlayerRow & { username_lower?: string | null }>)
      .map((row) => [normalizeUsername(row.username), { id: row.id, username: row.username }]),
  );
}

async function loadAeternumSnapshotRows() {
  return loadScoreboardSnapshotRowsForWorld(null, "Aeternum");
}

async function loadScoreboardSnapshotRowsForWorld(worldId: string | null, serverName?: string | null) {
  const { data, error } = await supabaseAdmin
    .from("aeternum_player_stats")
    .select("player_id,username,username_lower,player_digs,total_digs,latest_update,is_fake_player,server_name,minecraft_uuid_hash")
    .eq("is_fake_player", false)
    .match(worldId ? { source_world_id: worldId } : { server_name: serverName ?? "Aeternum" });

  if (error) throw error;

  const allRows = (data ?? []) as AeternumPlayerStatRow[];

  // Compute server total first — used as a sanity cap for individual player scores
  const serverTotal = allRows.reduce((max, row) => Math.max(max, toNumber(row.total_digs)), 0);

  const byUsername = new Map<string, AeternumPlayerStatRow>();
  for (const row of allRows) {
    const username = row.username?.trim();
    const usernameLower = (row.username_lower ?? username?.toLowerCase() ?? "").trim();
    const blocks = toNumber(row.player_digs);
    if (!username || !isValidAeternumPlayerStat({
      usernameLower,
      playerDigs: blocks,
      serverTotal,
      isFakePlayer: row.is_fake_player,
    })) {
      continue;
    }

    const existing = byUsername.get(usernameLower);
    const existingBlocks = toNumber(existing?.player_digs);
    if (!existing || blocks > existingBlocks || (blocks === existingBlocks && row.latest_update > existing.latest_update)) {
      byUsername.set(usernameLower, row);
    }
  }

  const rows = [...byUsername.values()];

  return { rows, serverTotal };
}

export async function getPublicSources() {
  const { data, error } = await supabaseAdmin
    .from("sources")
    .select("id,slug,display_name,source_type,is_public,is_approved")
    .eq("is_public", true)
    .eq("is_approved", true)
    .order("display_name", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as SourceRow[]).map(mapPublicSource);
}

export async function resolvePublicSourceBySlug(sourceSlug: string) {
  const { data, error } = await supabaseAdmin
    .from("sources")
    .select("id,slug,display_name,source_type,is_public,is_approved")
    .eq("slug", sourceSlug)
    .eq("is_public", true)
    .eq("is_approved", true)
    .maybeSingle();

  if (error) throw error;
  return data ? mapPublicSource(data as SourceRow) : null;
}

async function buildSnapshotBackedSourceDataset(
  source: PublicSourceSummary,
  canonical: { worldId: string; totalBlocks: number; playerCount: number },
): Promise<SourceDataset> {
  const snapshot = await loadScoreboardSnapshotRowsForWorld(canonical.worldId, source.displayName);
  const usernamesLower = [...new Set(snapshot.rows.map((row) => (row.username_lower ?? row.username.toLowerCase()).trim()))];
  const playersByUsername = await loadPlayersByUsernameLower(usernamesLower);
  const { data: sourceEntryRows, error: sourceEntryError } = await supabaseAdmin
    .from("leaderboard_entries")
    .select("player_id,score,updated_at,source_id")
    .eq("source_id", source.id);
  if (sourceEntryError) throw sourceEntryError;

  type AetRow = {
    playerId: string;
    username: string;
    blocksMined: number;
    lastUpdated: string;
  };
  const byIdentity = new Map<string, AetRow>();

  for (const row of snapshot.rows) {
      const username = row.username.trim();
      const usernameLower = (row.username_lower ?? username.toLowerCase()).trim();
      const player = playersByUsername.get(usernameLower);
      const playerId = row.player_id ?? player?.id ?? `anon:${source.slug}:${usernameLower}`;
      byIdentity.set(playerId, {
        playerId,
        username: player?.username ?? username,
        blocksMined: toNumber(row.player_digs),
        lastUpdated: row.latest_update,
      });
  }

  const sourceEntries = (sourceEntryRows ?? []) as LeaderboardEntryRow[];
  const sourcePlayersById = await loadPlayersById([...new Set(sourceEntries.map((row) => row.player_id).filter(Boolean))]);
  for (const row of sourceEntries) {
    if (!row.player_id) continue;
    const score = toNumber(row.score);
    if (score <= 0) continue;

    const player = sourcePlayersById.get(row.player_id);
    if (player && isPlaceholderLeaderboardUsername(normalizeUsername(player.username))) {
      continue;
    }
    const existing = byIdentity.get(row.player_id);
    if (!existing) {
      byIdentity.set(row.player_id, {
        playerId: row.player_id,
        username: player?.username ?? row.player_id,
        blocksMined: score,
        lastUpdated: row.updated_at,
      });
      continue;
    }

    if (score > existing.blocksMined) {
      existing.blocksMined = score;
    }
    if (row.updated_at > existing.lastUpdated) {
      existing.lastUpdated = row.updated_at;
    }
    if (player?.username) {
      existing.username = player.username;
    }
    byIdentity.set(row.player_id, existing);
  }

  const ranked = buildRankedLeaderboardRows(
    [...byIdentity.values()].map((row) => ({
      playerId: row.playerId,
      username: row.username,
      blocksMined: row.blocksMined,
      lastUpdated: row.lastUpdated,
      sourceId: source.id,
      sourceSlug: source.slug,
      sourceServer: source.displayName,
      viewKind: "source" as const,
      sourceCount: 1,
    })),
  );

  return {
    source,
    rows: ranked,
    totalBlocks: canonical.totalBlocks || ranked.reduce((sum, row) => sum + row.blocksMined, 0),
    playerCount: ranked.length,
  };
}

export async function getSourceLeaderboardRows(sourceSlug: string): Promise<SourceDataset | null> {
  const source = await resolvePublicSourceBySlug(sourceSlug);
  if (!source) {
    return null;
  }

  const canonicalTotals = await loadCanonicalSourceTotals();
  const canonical = canonicalTotals.bySourceSlug.get(source.slug);

  if (canonical?.worldId) {
    return buildSnapshotBackedSourceDataset(source, canonical);
  }

  const { data, error } = await supabaseAdmin
    .from("leaderboard_entries")
    .select("player_id,score,updated_at,source_id")
    .eq("source_id", source.id)
    .order("score", { ascending: false });

  if (error) throw error;

  const bestByPlayer = new Map<string, LeaderboardEntryRow>();
  for (const row of (data ?? []) as LeaderboardEntryRow[]) {
    if (!row.player_id) continue;
    const existing = bestByPlayer.get(row.player_id);
    const score = toNumber(row.score);
    const existingScore = toNumber(existing?.score);
    if (!existing || score > existingScore || (score === existingScore && row.updated_at > existing.updated_at)) {
      bestByPlayer.set(row.player_id, row);
    }
  }

  const entries = [...bestByPlayer.values()];
  const playersById = await loadPlayersById([...new Set(entries.map((row) => row.player_id))]);

  const ranked = buildRankedLeaderboardRows(
    entries.flatMap((entry) => {
      const player = playersById.get(entry.player_id);
      if (!player) return [];

      return [{
        playerId: player.id,
        username: player.username,
        blocksMined: toNumber(entry.score),
        lastUpdated: entry.updated_at,
        sourceId: source.id,
        sourceSlug: source.slug,
        sourceServer: source.displayName,
        viewKind: "source" as const,
        sourceCount: 1,
      }];
    }),
  );

  return {
    source,
    rows: ranked,
    totalBlocks: canonical?.totalBlocks ?? ranked.reduce((sum, row) => sum + row.blocksMined, 0),
    playerCount: ranked.length,
  };
}

export async function getMainLeaderboardRows() {
  const [{ data: sourceEntries, error: sourceEntriesError }, publicSources, canonicalTotals] = await Promise.all([
    supabaseAdmin
      .from("leaderboard_entries")
      .select("player_id,score,updated_at,source_id,sources!inner(id,slug,display_name,source_type,is_public,is_approved)")
      .not("source_id", "is", null)
      .eq("sources.is_approved", true),
    getPublicSources(),
    loadCanonicalSourceTotals(),
  ]);

  if (sourceEntriesError) throw sourceEntriesError;

  type AggregateEntry = {
    playerId: string;
    username: string;
    updatedAt: string;
    sourceScores: Map<string, number>;
  };

  const byIdentity = new Map<string, AggregateEntry>();

  const rows = (sourceEntries ?? []) as LeaderboardEntryRow[];
  const playerIds = [...new Set(rows.map((row) => row.player_id).filter(Boolean))];
  const playersById = await loadPlayersById(playerIds);

  for (const row of rows) {
    const sourceMeta = Array.isArray(row.sources) ? row.sources[0] : row.sources;
    if (!row.player_id || !sourceMeta?.slug) continue;
    const player = playersById.get(row.player_id);
    if (!player) continue;

    const identityKey = `pid:${player.id}`;
    const bucket = byIdentity.get(identityKey) ?? {
      playerId: player.id,
      username: player.username,
      updatedAt: row.updated_at,
      sourceScores: new Map<string, number>(),
    };

    const sourceSlug = sourceMeta.slug;
    const existing = bucket.sourceScores.get(sourceSlug) ?? 0;
    const score = toNumber(row.score);
    if (score > existing) {
      bucket.sourceScores.set(sourceSlug, score);
    }
    if (row.updated_at > bucket.updatedAt) {
      bucket.updatedAt = row.updated_at;
    }
    byIdentity.set(identityKey, bucket);
  }

  for (const source of publicSources) {
    const canonical = canonicalTotals.bySourceSlug.get(source.slug);
    if (!canonical?.worldId) continue;

    const snapshot = await loadScoreboardSnapshotRowsForWorld(canonical.worldId, source.displayName);
    const usernamesLower = [...new Set(snapshot.rows.map((row) => (row.username_lower ?? row.username.toLowerCase()).trim()))];
    const playersByUsername = await loadPlayersByUsernameLower(usernamesLower);

    for (const row of snapshot.rows) {
      const username = row.username.trim();
      const usernameLower = (row.username_lower ?? username.toLowerCase()).trim();
      const player = row.player_id ? playersById.get(row.player_id) : playersByUsername.get(usernameLower);
      const identityKey = player ? `pid:${player.id}` : `uname:${usernameLower}`;

      const bucket = byIdentity.get(identityKey) ?? {
        playerId: player?.id ?? `anon:${usernameLower}`,
        username: player?.username ?? username,
        updatedAt: row.latest_update,
        sourceScores: new Map<string, number>(),
      };

      const score = toNumber(row.player_digs);
      const existing = bucket.sourceScores.get(source.slug) ?? 0;
      if (score > existing) {
        bucket.sourceScores.set(source.slug, score);
      }
      if (row.latest_update > bucket.updatedAt) {
        bucket.updatedAt = row.latest_update;
      }
      if (!bucket.username) {
        bucket.username = player?.username ?? username;
      }

      byIdentity.set(identityKey, bucket);
    }
  }

  const ranked = buildRankedLeaderboardRows(
    [...byIdentity.values()].map((entry) => ({
      playerId: entry.playerId,
      username: entry.username,
      blocksMined: [...entry.sourceScores.values()].reduce((sum, value) => sum + value, 0),
      lastUpdated: entry.updatedAt,
      sourceId: null,
      sourceSlug: null,
      sourceServer: "Main Leaderboard",
      viewKind: "global" as const,
      sourceCount: entry.sourceScores.size,
    })),
  );

  return {
    rows: ranked,
    totalBlocks: canonicalTotals.globalTotalBlocks || ranked.reduce((sum, row) => sum + row.blocksMined, 0),
    playerCount: ranked.length,
  };
}

export function findLeaderboardRow(
  rows: LeaderboardRowSummary[],
  options: {
    playerIds?: string[];
    username?: string | null;
  },
) {
  const playerIds = new Set((options.playerIds ?? []).filter(Boolean));
  const normalizedUsername = (options.username ?? "").trim().toLowerCase();

  return rows.find((row) => {
    if (row.playerId && playerIds.has(row.playerId)) {
      return true;
    }

    return normalizedUsername !== "" && normalizeUsername(row.username) === normalizedUsername;
  }) ?? null;
}

export async function buildLeaderboardResponse(options: {
  sourceSlug?: string | null;
  page?: number;
  pageSize?: number;
  query?: string | null;
  minBlocks?: number;
  highlightedPlayer?: string | null;
}): Promise<LeaderboardPageResult> {
  const resolvedMinBlocks = Math.max(0, Number(options.minBlocks ?? 1_000_000));

  const [publicSources, mainDataset, sourceDataset] = await Promise.all([
    getPublicSources(),
    options.sourceSlug ? Promise.resolve(null) : getMainLeaderboardRows(),
    options.sourceSlug ? getSourceLeaderboardRows(options.sourceSlug) : Promise.resolve(null),
  ]);

  const dataset = options.sourceSlug ? sourceDataset : mainDataset;
  if (!dataset) {
    throw new Error("NOT_FOUND");
  }

  const filteredRows = filterRows(dataset.rows, options.query, resolvedMinBlocks);
  const paginated = paginateRows(filteredRows, options.page ?? 1, options.pageSize ?? 50);
  const scope = options.sourceSlug ? "source" : "main";
  const source = options.sourceSlug ? sourceDataset?.source ?? null : null;

  return {
    scope,
    title: scope === "main" ? "Main Leaderboard" : source?.displayName ?? "Leaderboard",
    description: scope === "main"
      ? "Combined totals across all approved sources."
      : `Blocks mined on ${source?.displayName ?? "this source"} only.`,
    scoreLabel: "Blocks Mined",
    source,
    featuredRows: dataset.rows.slice(0, 3),
    rows: paginated.rows,
    page: paginated.page,
    pageSize: paginated.pageSize,
    totalRows: paginated.totalRows,
    totalPages: paginated.totalPages,
    totalBlocks: dataset.totalBlocks,
    playerCount: dataset.playerCount,
    highlightedPlayer: options.highlightedPlayer ?? null,
    publicSources,
  };
}

export async function submitSourceScore(input: {
  playerId: string;
  sourceSlug: string;
  sourceDisplayName: string;
  sourceType: string;
  score: number;
  isPublic: boolean;
}) {
  const { error } = await supabaseAdmin.rpc("submit_source_score", {
    p_player_id: input.playerId,
    p_source_slug: input.sourceSlug,
    p_source_display_name: input.sourceDisplayName,
    p_source_type: input.sourceType,
    p_score: input.score,
    p_is_public: input.isPublic,
  });

  if (error) throw error;
}

export { buildRankedLeaderboardRows };
