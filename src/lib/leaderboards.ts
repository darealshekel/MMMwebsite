import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { LeaderboardResponse, LeaderboardRowSummary, PublicSourceSummary } from "@/lib/types";

export interface LeaderboardRequestOptions {
  page?: number;
  pageSize?: number;
  query?: string;
  minBlocks?: number;
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
    is_approved: boolean;
  } | null;
};

type AeternumPlayerStatRow = {
  player_id: string | null;
  username: string;
  username_lower: string;
  player_digs: number | null;
  latest_update: string;
  is_fake_player: boolean | null;
  server_name: string | null;
};

type PlayerRow = {
  id: string;
  username: string;
};

type RankedInput = {
  playerId: string;
  username: string;
  blocksMined: number;
  lastUpdated: string;
  sourceId: string | null;
  sourceSlug: string | null;
  sourceServer: string;
  viewKind: "global" | "source";
  sourceCount: number;
};

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function buildSkinFaceUrl(username: string) {
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

function buildRankedRows(rows: RankedInput[]): LeaderboardRowSummary[] {
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

function filterRows(rows: LeaderboardRowSummary[], query: string | undefined, minBlocks: number) {
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

async function loadPlayers(playerIds: string[]) {
  if (playerIds.length === 0) {
    return new Map<string, PlayerRow>();
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("players")
    .select("id,username")
    .in("id", playerIds);

  if (error) throw error;

  return new Map(((data ?? []) as PlayerRow[]).map((row) => [row.id, row]));
}

async function loadPlayersByUsername(usernamesLower: string[]) {
  if (usernamesLower.length === 0) {
    return new Map<string, PlayerRow>();
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("players")
    .select("id,username,username_lower")
    .in("username_lower", usernamesLower);

  if (error) throw error;

  return new Map(
    ((data ?? []) as Array<PlayerRow & { username_lower?: string | null }>)
      .map((row) => [normalizeUsername(row.username), { id: row.id, username: row.username }]),
  );
}

export async function getPublicSources() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("sources")
    .select("id,slug,display_name,source_type,is_public,is_approved")
    .eq("is_public", true)
    .eq("is_approved", true)
    .order("display_name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as SourceRow[]).map(mapPublicSource);
}

async function getMainLeaderboardDataset() {
  const supabase = getSupabaseBrowserClient();
  const [{ data, error }, { data: aeternumData, error: aeternumError }] = await Promise.all([
    supabase
      .from("leaderboard_entries")
      .select("player_id,score,updated_at,source_id,sources!inner(id,slug,display_name,is_approved)")
      .not("source_id", "is", null)
      .eq("sources.is_approved", true),
    supabase
      .from("aeternum_player_stats")
      .select("player_id,username,username_lower,player_digs,total_digs,latest_update,is_fake_player,server_name")
      .eq("server_name", "Aeternum")
      .eq("is_fake_player", false),
  ]);

  if (error) throw error;
  if (aeternumError) throw aeternumError;

  const sourceEntries = ((data ?? []) as LeaderboardEntryRow[])
    .filter((row) => Boolean(row.player_id))
    .filter((row) => row.sources?.is_approved);

  const nonAeternumSourceEntries = sourceEntries.filter((row) => row.sources?.slug !== "aeternum");

  const aeternumRows = ((aeternumData ?? []) as Array<AeternumPlayerStatRow & { total_digs?: number | null }>)
    .filter((row) => !row.is_fake_player)
    .filter((row) => toNumber(row.player_digs) > 0)
    .filter((row) => Boolean((row.username_lower ?? row.username?.toLowerCase() ?? "").trim()));
  const latestAeternumByUsername = new Map<string, AeternumPlayerStatRow & { total_digs?: number | null }>();
  for (const row of aeternumRows) {
    const key = (row.username_lower ?? row.username.toLowerCase()).trim();
    const existing = latestAeternumByUsername.get(key);
    if (!existing || row.latest_update > existing.latest_update) {
      latestAeternumByUsername.set(key, row);
    }
  }
  const aeternumSnapshotRows = Array.from(latestAeternumByUsername.values());

  const usernamesLower = [...new Set(aeternumSnapshotRows.map((row) => (row.username_lower ?? row.username.toLowerCase()).trim()))];
  const playersByUsername = await loadPlayersByUsername(usernamesLower);

  type AggregateBucket = {
    totalBlocks: number;
    updatedAt: string;
    sourceScores: Map<string, number>;
    playerId: string | null;
    username: string;
  };

  const aggregatedByIdentity = new Map<string, AggregateBucket>();

  for (const entry of nonAeternumSourceEntries) {
    const playerId = entry.player_id;
    const identityKey = `pid:${playerId}`;
    const sourceSlug = entry.sources?.slug ?? "";
    const bucket = aggregatedByIdentity.get(identityKey) ?? {
      totalBlocks: 0,
      updatedAt: entry.updated_at,
      sourceScores: new Map<string, number>(),
      playerId,
      username: "",
    };
    const score = toNumber(entry.score);
    const existing = bucket.sourceScores.get(sourceSlug) ?? 0;
    if (score > existing) {
      bucket.sourceScores.set(sourceSlug, score);
    }
    if (entry.updated_at > bucket.updatedAt) {
      bucket.updatedAt = entry.updated_at;
    }
    aggregatedByIdentity.set(identityKey, bucket);
  }

  for (const row of aeternumSnapshotRows) {
    const username = row.username.trim();
    const usernameLower = (row.username_lower ?? username.toLowerCase()).trim();
    const resolvedPlayerId = row.player_id ?? playersByUsername.get(usernameLower)?.id ?? null;
    const identityKey = resolvedPlayerId ? `pid:${resolvedPlayerId}` : `uname:${usernameLower}`;
    const bucket = aggregatedByIdentity.get(identityKey) ?? {
      totalBlocks: 0,
      updatedAt: row.latest_update,
      sourceScores: new Map<string, number>(),
      playerId: resolvedPlayerId,
      username,
    };

    const aeternumScore = toNumber(row.player_digs);
    const existingAeternum = bucket.sourceScores.get("aeternum") ?? 0;
    if (aeternumScore > existingAeternum) {
      bucket.sourceScores.set("aeternum", aeternumScore);
    }
    if (row.latest_update > bucket.updatedAt) {
      bucket.updatedAt = row.latest_update;
    }
    if (!bucket.username) {
      bucket.username = username;
    }
    if (!bucket.playerId && resolvedPlayerId) {
      bucket.playerId = resolvedPlayerId;
    }
    aggregatedByIdentity.set(identityKey, bucket);
  }

  const playerIds = [...new Set(
    Array.from(aggregatedByIdentity.values())
      .map((bucket) => bucket.playerId)
      .filter((value): value is string => Boolean(value)),
  )];
  const playersById = await loadPlayers(playerIds);

  for (const [key, bucket] of aggregatedByIdentity.entries()) {
    if (bucket.playerId) {
      const player = playersById.get(bucket.playerId);
      if (player) {
        bucket.username = player.username;
      }
    }
    if (!bucket.username) {
      aggregatedByIdentity.delete(key);
      continue;
    }
    bucket.totalBlocks = Array.from(bucket.sourceScores.values()).reduce((sum, value) => sum + value, 0);
  }

  const ranked = buildRankedRows(
    Array.from(aggregatedByIdentity.values()).map((aggregate) => ({
      playerId: aggregate.playerId ?? `anon:${normalizeUsername(aggregate.username)}`,
      username: aggregate.username,
      blocksMined: aggregate.totalBlocks,
      lastUpdated: aggregate.updatedAt,
      sourceId: null,
      sourceSlug: null,
      sourceServer: "Main Leaderboard",
      viewKind: "global" as const,
      sourceCount: aggregate.sourceScores.size,
    })),
  );

  console.info("[leaderboard] mode=main");
  console.info("[leaderboard] source filter=approved-only");
  console.info("[leaderboard] rows returned=" + (sourceEntries.length + aeternumSnapshotRows.length));
  console.info("[leaderboard] final dataset size=" + ranked.length);

  return {
    rows: ranked,
    totalBlocks: ranked.reduce((sum, row) => sum + row.blocksMined, 0),
    playerCount: ranked.length,
  };
}

async function resolvePublicSourceBySlug(sourceSlug: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("sources")
    .select("id,slug,display_name,source_type,is_public,is_approved")
    .eq("slug", sourceSlug)
    .eq("is_public", true)
    .eq("is_approved", true)
    .maybeSingle();

  if (error) throw error;
  return data ? mapPublicSource(data as SourceRow) : null;
}

async function getSourceLeaderboardDataset(sourceSlug: string) {
  const supabase = getSupabaseBrowserClient();
  const source = await resolvePublicSourceBySlug(sourceSlug);
  if (!source) {
    console.info("[leaderboard] mode=source");
    console.info("[leaderboard] source filter=" + sourceSlug);
    console.info("[leaderboard] rows returned=0");
    console.info("[leaderboard] final dataset size=0");
    return null;
  }

  if (source.slug === "aeternum") {
    const [aeternumStatsResult] = await Promise.all([
      supabase
        .from("aeternum_player_stats")
        .select("player_id,username,username_lower,player_digs,total_digs,latest_update,is_fake_player,server_name")
        .eq("server_name", "Aeternum")
        .eq("is_fake_player", false)
        .order("latest_update", { ascending: false })
        .limit(500),
    ]);

    if (aeternumStatsResult.error) throw aeternumStatsResult.error;
    const data = aeternumStatsResult.data ?? [];

    const byUsername = new Map<string, AeternumPlayerStatRow & { total_digs?: number | null }>();
    for (const row of ((data ?? []) as Array<AeternumPlayerStatRow & { total_digs?: number | null }>)) {
      const username = row.username?.trim();
      const usernameLower = (row.username_lower ?? username?.toLowerCase() ?? "").trim();
      const blocks = toNumber(row.player_digs);
      if (!username || !usernameLower || blocks <= 0) continue;
      if (row.is_fake_player) continue;

      const existing = byUsername.get(usernameLower);
      if (!existing) {
        byUsername.set(usernameLower, row);
        continue;
      }
      if (row.latest_update > existing.latest_update) {
        byUsername.set(usernameLower, row);
      }
    }

    const ranked = buildRankedRows(
      Array.from(byUsername.values()).map((row) => {
        const username = row.username.trim();
        const usernameLower = row.username_lower?.trim() || username.toLowerCase();
        const fallbackPlayerId = `anon:${source.slug}:${usernameLower}`;
        return {
          playerId: row.player_id ?? fallbackPlayerId,
          username,
          blocksMined: toNumber(row.player_digs),
          lastUpdated: row.latest_update,
          sourceId: source.id,
          sourceSlug: source.slug,
          sourceServer: source.displayName,
          viewKind: "source" as const,
          sourceCount: 1,
        };
      }),
    );

    const uniqueRows = Array.from(byUsername.values());
    const latestSnapshotRow = uniqueRows.reduce<Array<AeternumPlayerStatRow & { total_digs?: number | null }>>(
      (best, row) => {
        if (best.length === 0) return [row];
        return row.latest_update > best[0].latest_update ? [row] : best;
      },
      [],
    )[0];
    const latestSnapshotTotal = latestSnapshotRow
      ? toNumber((latestSnapshotRow as { total_digs?: number | null }).total_digs)
      : 0;
    const maxSnapshotTotal = uniqueRows.reduce((maxValue, row) => {
      return Math.max(maxValue, toNumber((row as { total_digs?: number | null }).total_digs));
    }, 0);
    const serverTotal = latestSnapshotTotal > 0 ? latestSnapshotTotal : maxSnapshotTotal;

    console.info("[leaderboard] mode=source");
    console.info("[leaderboard] source filter=" + source.slug);
    console.info("[leaderboard] rows returned=" + (data?.length ?? 0));
    console.info("[leaderboard] final dataset size=" + ranked.length);

    return {
      source,
      rows: ranked,
      totalBlocks: serverTotal > 0 ? serverTotal : ranked.reduce((sum, row) => sum + row.blocksMined, 0),
      playerCount: ranked.length,
    };
  }

  const { data: sourceRows, error: sourceRowsError } = await supabase
    .from("leaderboard_entries")
    .select("player_id,score,updated_at,source_id")
    .eq("source_id", source.id)
    .order("score", { ascending: false });

  if (sourceRowsError) throw sourceRowsError;

  const entries = (sourceRows ?? []) as LeaderboardEntryRow[];
  const playerIds = [...new Set(entries.map((entry) => entry.player_id).filter(Boolean))];
  const playersById = await loadPlayers(playerIds);

  const ranked = buildRankedRows(
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

  console.info("[leaderboard] mode=source");
  console.info("[leaderboard] source filter=" + source.slug);
  console.info("[leaderboard] rows returned=" + entries.length);
  console.info("[leaderboard] final dataset size=" + ranked.length);

  return {
    source,
    rows: ranked,
    totalBlocks: ranked.reduce((sum, row) => sum + row.blocksMined, 0),
    playerCount: ranked.length,
  };
}

function buildResponse({
  scope,
  source,
  rows,
  totalBlocks,
  playerCount,
  publicSources,
  options,
}: {
  scope: "main" | "source";
  source: PublicSourceSummary | null;
  rows: LeaderboardRowSummary[];
  totalBlocks: number;
  playerCount: number;
  publicSources: PublicSourceSummary[];
  options: LeaderboardRequestOptions & { highlightedPlayer?: string | null };
}): LeaderboardResponse {
  const filteredRows = filterRows(rows, options.query, Math.max(0, Number(options.minBlocks ?? 0)));
  const filteredTotalBlocks = filteredRows.reduce((sum, row) => sum + row.blocksMined, 0);
  const filteredPlayerCount = filteredRows.length;
  const sourceTopMiner = filteredRows[0]?.username ?? "";
  console.info("[leaderboard] selected mode=" + scope);
  console.info("[leaderboard] selected source slug=" + (source?.slug ?? "main"));
  console.info("[leaderboard] source rows returned=" + rows.length);
  console.info("[leaderboard] source top miner=" + sourceTopMiner);
  console.info("[leaderboard] source total blocks=" + filteredTotalBlocks);
  console.info("[leaderboard] source ranked players=" + filteredPlayerCount);
  console.info("[leaderboard] source podium size=" + Math.min(3, filteredRows.length));
  const paginated = paginateRows(filteredRows, options.page ?? 1, options.pageSize ?? 50);

  return {
    scope,
    title: scope === "main" ? "Main Leaderboard" : source?.displayName ?? "Leaderboard",
    description: scope === "main"
      ? "Combined totals across all approved sources."
      : `Blocks mined on ${source?.displayName ?? "this source"} only.`,
    scoreLabel: "Blocks Mined",
    source,
    featuredRows: filteredRows.slice(0, 3),
    rows: paginated.rows,
    page: paginated.page,
    pageSize: paginated.pageSize,
    totalRows: paginated.totalRows,
    totalPages: paginated.totalPages,
    totalBlocks,
    playerCount,
    highlightedPlayer: options.highlightedPlayer ?? null,
    publicSources,
  };
}

export async function getMainLeaderboard(limit = 100, options: LeaderboardRequestOptions = {}) {
  const [publicSources, dataset] = await Promise.all([
    getPublicSources(),
    getMainLeaderboardDataset(),
  ]);

  return buildResponse({
    scope: "main",
    source: null,
    rows: dataset.rows,
    totalBlocks: dataset.totalBlocks,
    playerCount: dataset.playerCount,
    publicSources,
    options: {
      ...options,
      pageSize: options.pageSize ?? limit,
    },
  });
}

export async function getSourceLeaderboard(sourceSlug: string, limit = 100, options: LeaderboardRequestOptions = {}) {
  const [publicSources, dataset] = await Promise.all([
    getPublicSources(),
    getSourceLeaderboardDataset(sourceSlug),
  ]);

  if (!dataset) {
    throw new Error("Leaderboard not found.");
  }

  return buildResponse({
    scope: "source",
    source: dataset.source,
    rows: dataset.rows,
    totalBlocks: dataset.totalBlocks,
    playerCount: dataset.playerCount,
    publicSources,
    options: {
      ...options,
      pageSize: options.pageSize ?? limit,
    },
  });
}

export async function submitSourceScore(input: {
  playerId: string;
  sourceSlug: string;
  sourceDisplayName: string;
  sourceType: string;
  score: number;
  isPublic: boolean;
  isApproved: boolean;
}) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("submit_source_score", {
    p_player_id: input.playerId,
    p_source_slug: input.sourceSlug,
    p_source_display_name: input.sourceDisplayName,
    p_source_type: input.sourceType,
    p_score: input.score,
    p_is_public: input.isPublic,
    p_is_approved: input.isApproved,
  });

  if (error) {
    throw error;
  }
}
