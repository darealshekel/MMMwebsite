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
  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select("player_id,score,updated_at,source_id,sources!inner(id,is_approved)")
    .not("source_id", "is", null)
    .eq("sources.is_approved", true);

  if (error) throw error;

  const sourceEntries = ((data ?? []) as Array<LeaderboardEntryRow & { sources?: { is_approved?: boolean } | null }>)
    .filter((row) => Boolean(row.player_id));

  const aggregatedByPlayer = new Map<
    string,
    { totalBlocks: number; updatedAt: string; sourceIds: Set<string> }
  >();

  for (const entry of sourceEntries) {
    const playerId = entry.player_id;
    const bucket = aggregatedByPlayer.get(playerId) ?? {
      totalBlocks: 0,
      updatedAt: entry.updated_at,
      sourceIds: new Set<string>(),
    };
    bucket.totalBlocks += toNumber(entry.score);
    if (entry.updated_at > bucket.updatedAt) {
      bucket.updatedAt = entry.updated_at;
    }
    if (entry.source_id) {
      bucket.sourceIds.add(entry.source_id);
    }
    aggregatedByPlayer.set(playerId, bucket);
  }

  const playerIds = [...aggregatedByPlayer.keys()];
  const playersById = await loadPlayers(playerIds);

  const ranked = buildRankedRows(
    playerIds.flatMap((playerId) => {
      const player = playersById.get(playerId);
      const aggregate = aggregatedByPlayer.get(playerId);
      if (!player || !aggregate) return [];

      return [{
        playerId,
        username: player.username,
        blocksMined: aggregate.totalBlocks,
        lastUpdated: aggregate.updatedAt,
        sourceId: null,
        sourceSlug: null,
        sourceServer: "Main Leaderboard",
        viewKind: "global" as const,
        sourceCount: aggregate.sourceIds.size,
      }];
    }),
  );

  console.info("[leaderboard] mode=main");
  console.info("[leaderboard] source filter=approved-only");
  console.info("[leaderboard] rows returned=" + sourceEntries.length);
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
  const source = await resolvePublicSourceBySlug(sourceSlug);
  if (!source) {
    console.info("[leaderboard] mode=source");
    console.info("[leaderboard] source filter=" + sourceSlug);
    console.info("[leaderboard] rows returned=0");
    console.info("[leaderboard] final dataset size=0");
    return null;
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select("player_id,score,updated_at,source_id")
    .eq("source_id", source.id)
    .order("score", { ascending: false });

  if (error) throw error;

  const entries = (data ?? []) as LeaderboardEntryRow[];
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
  publicSources,
  options,
}: {
  scope: "main" | "source";
  source: PublicSourceSummary | null;
  rows: LeaderboardRowSummary[];
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
    totalBlocks: filteredTotalBlocks,
    playerCount: filteredPlayerCount,
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
