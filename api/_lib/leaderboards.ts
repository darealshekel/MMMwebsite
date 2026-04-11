import type { LeaderboardRowSummary, LeaderboardViewKind } from "../../src/lib/types.js";
import { supabaseAdmin } from "./server.js";

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
  source_id?: string | null;
};

type PlayerRow = {
  id: string;
  username: string;
};

type PlayerSourceCountRow = {
  player_id: string;
  source_id: string;
};

type MainFallbackRow = {
  player_id: string;
  score: number | null;
  updated_at: string;
  source_id: string | null;
  sources: Array<{
    is_approved: boolean;
  }> | null;
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

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function buildSkinFaceUrl(username: string) {
  const safeUsername = encodeURIComponent(username);
  return `https://minotar.net/avatar/${safeUsername}/64`;
}

export function buildRankedLeaderboardRows(rows: RankedRowInput[]): LeaderboardRowSummary[] {
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

function mapPublicSource(row: SourceRow): PublicSourceSummary {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    sourceType: row.source_type,
  };
}

async function loadPlayers(playerIds: string[]) {
  if (playerIds.length === 0) {
    return new Map<string, PlayerRow>();
  }

  const { data, error } = await supabaseAdmin
    .from("players")
    .select("id,username")
    .in("id", playerIds);

  if (error) throw error;

  return new Map(((data ?? []) as PlayerRow[]).map((row) => [row.id, row]));
}

async function loadSourceContributionCounts(playerIds: string[]) {
  if (playerIds.length === 0) {
    return new Map<string, number>();
  }

  const { data: publicSourcesData, error: publicSourcesError } = await supabaseAdmin
    .from("sources")
    .select("id")
    .eq("is_approved", true);

  if (publicSourcesError) throw publicSourcesError;

  const publicSourceIds = ((publicSourcesData ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (publicSourceIds.length === 0) {
    return new Map(playerIds.map((playerId) => [playerId, 0]));
  }

  const { data, error } = await supabaseAdmin
    .from("leaderboard_entries")
    .select("player_id,source_id")
    .in("player_id", playerIds)
    .in("source_id", publicSourceIds);

  if (error) throw error;

  const counts = new Map<string, Set<string>>();
  for (const row of (data ?? []) as PlayerSourceCountRow[]) {
    const bucket = counts.get(row.player_id) ?? new Set<string>();
    bucket.add(row.source_id);
    counts.set(row.player_id, bucket);
  }

  return new Map(playerIds.map((playerId) => [playerId, counts.get(playerId)?.size ?? 0]));
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

export async function getMainLeaderboardRows() {
  const { data, error } = await supabaseAdmin
    .from("leaderboard_entries")
    .select("player_id,score,updated_at")
    .is("source_id", null)
    .order("score", { ascending: false });

  if (error) throw error;

  let entries = (data ?? []) as LeaderboardEntryRow[];

  console.info("[leaderboard-debug] main-query-global-rows", {
    rowCount: entries.length,
  });

  if (entries.length === 0) {
    const { data: fallbackRows, error: fallbackError } = await supabaseAdmin
      .from("leaderboard_entries")
      .select("player_id,score,updated_at,source_id,sources!inner(is_approved)")
      .not("source_id", "is", null)
      .eq("sources.is_approved", true);

    if (fallbackError) throw fallbackError;

    const aggregatedByPlayer = new Map<
      string,
      { score: number; updatedAt: string; sourceIds: Set<string> }
    >();
    for (const row of (fallbackRows ?? []) as MainFallbackRow[]) {
      if (!row.player_id || !row.source_id || !row.sources?.[0]?.is_approved) {
        continue;
      }

      const bucket = aggregatedByPlayer.get(row.player_id) ?? {
        score: 0,
        updatedAt: row.updated_at,
        sourceIds: new Set<string>(),
      };
      bucket.score += toNumber(row.score);
      if (row.updated_at > bucket.updatedAt) {
        bucket.updatedAt = row.updated_at;
      }
      bucket.sourceIds.add(row.source_id);
      aggregatedByPlayer.set(row.player_id, bucket);
    }

    entries = [...aggregatedByPlayer.entries()].map(([playerId, value]) => ({
      player_id: playerId,
      score: value.score,
      updated_at: value.updatedAt,
      source_id: null,
    }));

    console.info("[leaderboard-debug] main-query-fallback-rows", {
      rowCount: entries.length,
    });
  }

  const playerIds = [...new Set(entries.map((row) => row.player_id))];
  const [playersById, sourceCountsByPlayerId] = await Promise.all([
    loadPlayers(playerIds),
    loadSourceContributionCounts(playerIds),
  ]);

  const ranked = buildRankedLeaderboardRows(
    entries.flatMap((entry) => {
      const player = playersById.get(entry.player_id);
      if (!player) return [];

      return [{
        playerId: player.id,
        username: player.username,
        blocksMined: toNumber(entry.score),
        lastUpdated: entry.updated_at,
        sourceId: null,
        sourceSlug: null,
        sourceServer: "Main Leaderboard",
        viewKind: "global" as const,
        sourceCount: sourceCountsByPlayerId.get(player.id) ?? 0,
      }];
    }),
  );

  return {
    rows: ranked,
    totalBlocks: ranked.reduce((sum, row) => sum + row.blocksMined, 0),
    playerCount: ranked.length,
  };
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

export async function getSourceLeaderboardRows(sourceSlug: string) {
  console.info("[leaderboard-debug] source-query-start", {
    sourceSlug,
  });
  const source = await resolvePublicSourceBySlug(sourceSlug);
  if (!source) {
    console.info("[leaderboard-debug] source-query-miss", {
      sourceSlug,
    });
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("leaderboard_entries")
    .select("player_id,score,updated_at,source_id")
    .eq("source_id", source.id)
    .order("score", { ascending: false });

  if (error) throw error;

  const entries = (data ?? []) as LeaderboardEntryRow[];
  console.info("[leaderboard-debug] source-query-rows", {
    sourceSlug,
    sourceId: source.id,
    rowCount: entries.length,
  });
  const playerIds = [...new Set(entries.map((row) => row.player_id))];
  const playersById = await loadPlayers(playerIds);

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
    totalBlocks: ranked.reduce((sum, row) => sum + row.blocksMined, 0),
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
  console.info("[leaderboard-debug] response-build-start", {
    sourceSlug: options.sourceSlug ?? null,
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 50,
    query: options.query ?? "",
    minBlocks: Math.max(0, Number(options.minBlocks ?? 0)),
  });

  const [publicSources, mainDataset, sourceDataset] = await Promise.all([
    getPublicSources(),
    options.sourceSlug ? Promise.resolve(null) : getMainLeaderboardRows(),
    options.sourceSlug ? getSourceLeaderboardRows(options.sourceSlug) : Promise.resolve(null),
  ]);

  const dataset = options.sourceSlug ? sourceDataset : mainDataset;
  if (!dataset) {
    throw new Error("NOT_FOUND");
  }

  const filteredRows = filterRows(dataset.rows, options.query, Math.max(0, Number(options.minBlocks ?? 0)));
  const paginated = paginateRows(filteredRows, options.page ?? 1, options.pageSize ?? 50);
  const scope = options.sourceSlug ? "source" : "main";
  const source = options.sourceSlug ? sourceDataset?.source ?? null : null;

  console.info("[leaderboard-debug] response-build-dataset", {
    scope,
    sourceSlug: source?.slug ?? null,
    totalRows: dataset.rows.length,
    filteredRows: filteredRows.length,
    pagedRows: paginated.rows.length,
    playerCount: dataset.playerCount,
    totalBlocks: dataset.totalBlocks,
    publicSourceCount: publicSources.length,
  });

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
  isApproved: boolean;
}) {
  const { error } = await supabaseAdmin.rpc("submit_source_score", {
    p_player_id: input.playerId,
    p_source_slug: input.sourceSlug,
    p_source_display_name: input.sourceDisplayName,
    p_source_type: input.sourceType,
    p_score: input.score,
    p_is_public: input.isPublic,
    p_is_approved: input.isApproved,
  });

  if (error) throw error;
}
