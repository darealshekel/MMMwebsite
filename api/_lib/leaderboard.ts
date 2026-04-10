import {
  aggregateLeaderboardViews,
  filterLeaderboardRows,
  paginateLeaderboardRows,
  type AggregatedLeaderboardRow,
  type AggregatedLeaderboardView,
  type LeaderboardContribution,
  type LeaderboardSourceTotals,
} from "../../src/lib/leaderboard-aggregation.js";
import type { LeaderboardRowSummary } from "../../src/lib/types.js";
import {
  buildSourceRollups,
  selectLeaderboardWorldRollups,
  type ConnectedAccountRow,
  type PlayerRow,
  type PlayerWorldStatRow,
  type WorldSourceRow,
} from "./source-approval.js";
import { supabaseAdmin } from "./server.js";

type AeternumPlayerStatRow = {
  source_world_id?: string | null;
  player_id?: string | null;
  minecraft_uuid_hash?: string | null;
  username: string;
  username_lower?: string | null;
  player_digs?: number | null;
  total_digs?: number | null;
  server_name?: string | null;
  latest_update: string;
};

type AeternumSnapshotRow = AeternumPlayerStatRow & {
  source_total_digs?: number | null;
};

export interface LeaderboardApiResponse {
  selectedView: string;
  selectedViewLabel: string;
  selectedViewDescription: string;
  selectedViewKind: "global" | "source";
  featuredRows: LeaderboardRowSummary[];
  rows: LeaderboardRowSummary[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  totalBlocks: number;
  playerCount: number;
  highlightedPlayer: string | null;
  views: Array<{
    key: string;
    label: string;
    description: string;
    kind: "global" | "source";
    playerCount: number;
    totalBlocks: number;
  }>;
}

export interface LeaderboardDataset {
  views: AggregatedLeaderboardView[];
  featuredRows: LeaderboardRowSummary[];
}

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUsername(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function resolveAuthoritativeSourceTotal(rows: AeternumSnapshotRow[]) {
  const authoritative = rows.reduce((sum, row) => sum + toNumber(row.total_digs), 0);
  if (authoritative > 0) {
    return authoritative;
  }
  return rows.reduce((sum, row) => sum + toNumber(row.player_digs), 0);
}

function isCanonicalAeternumSource(
  world: WorldSourceRow | null | undefined,
  serverName: string | null | undefined,
) {
  if (world) {
    const displayName = normalizeUsername(world.display_name);
    const worldKey = normalizeUsername(world.world_key);
    const host = normalizeUsername(world.host);
    return (
      displayName === "aeternum" ||
      worldKey === "aeternum" ||
      worldKey === "mc.aeternumsmp.net" ||
      worldKey === "play.aeternum.net" ||
      host === "mc.aeternumsmp.net" ||
      host === "play.aeternum.net"
    );
  }

  const normalizedServer = normalizeUsername(serverName);
  return normalizedServer === "aeternum";
}

function resolveScoreboardSourceMeta(
  row: AeternumPlayerStatRow,
  worldById: ReadonlyMap<string, WorldSourceRow>,
  publicWorldIds: ReadonlySet<string>,
  globalWorldIds: ReadonlySet<string>,
) {
  const sourceWorldId = row.source_world_id ?? null;
  const world = sourceWorldId ? worldById.get(sourceWorldId) ?? null : null;
  const serverName = row.server_name?.trim() || world?.display_name || "Unknown Source";
  const canonicalAeternum = isCanonicalAeternumSource(world, serverName);

  // No approval bypass. A source must exist in the visible world sets to count.
  const visibleInGlobal = sourceWorldId ? globalWorldIds.has(sourceWorldId) : false;
  const visibleInSource = sourceWorldId ? publicWorldIds.has(sourceWorldId) : false;

  return {
    sourceWorldId,
    world,
    serverName,
    sourceKey: canonicalAeternum
      ? "aeternum"
      : sourceWorldId
        ? `world:${sourceWorldId}`
        : `scoreboard:${serverName.toLowerCase()}`,
    sourceLabel: world?.display_name || serverName,
    visibleInGlobal,
    visibleInSource,
  };
}

function mapRowSummary(row: AggregatedLeaderboardRow): LeaderboardRowSummary {
  return {
    playerId: row.playerId,
    username: row.username,
    skinFaceUrl: row.skinFaceUrl,
    lastUpdated: row.lastUpdated,
    blocksMined: row.blocksMined,
    totalDigs: row.totalDigs,
    rank: row.rank,
    sourceServer: row.sourceServer,
    sourceKey: row.sourceKey,
    sourceCount: row.sourceCount,
    viewKind: row.viewKind,
  };
}

export function buildLatestAeternumSnapshot(rows: AeternumPlayerStatRow[]) {
  const rowsBySource = new Map<string, AeternumPlayerStatRow[]>();

  for (const row of rows) {
    const sourceKey = row.source_world_id
      ? `world:${row.source_world_id}`
      : "aeternum";

    const bucket = rowsBySource.get(sourceKey) ?? [];
    bucket.push(row);
    rowsBySource.set(sourceKey, bucket);
  }

  const latestRows: AeternumSnapshotRow[] = [];
  const sourceTotals = new Map<string, LeaderboardSourceTotals>();

  for (const [sourceKey, sourceRows] of rowsBySource) {
    const mergedByPlayer = new Map<string, AeternumPlayerStatRow>();

    for (const row of sourceRows) {
      const usernameKey = row.username_lower?.trim() || normalizeUsername(row.username);
      if (!usernameKey) continue;

      const existing = mergedByPlayer.get(usernameKey);
      if (!existing) {
        mergedByPlayer.set(usernameKey, row);
        continue;
      }

      const existingDigs = toNumber(existing.player_digs);
      const nextDigs = toNumber(row.player_digs);
      const existingUpdatedAt = new Date(existing.latest_update).getTime();
      const nextUpdatedAt = new Date(row.latest_update).getTime();

      if (
        nextDigs > existingDigs ||
        (nextDigs === existingDigs && nextUpdatedAt > existingUpdatedAt)
      ) {
        mergedByPlayer.set(usernameKey, row);
      }
    }

    const sourceLatestRows = Array.from(mergedByPlayer.values()) as AeternumSnapshotRow[];
    const sourceTotal = resolveAuthoritativeSourceTotal(sourceLatestRows);

    sourceTotals.set(sourceKey, { totalBlocks: sourceTotal });

    for (const row of sourceLatestRows) {
      row.source_total_digs = sourceTotal;
      latestRows.push(row);
    }
  }

  return {
    latestRows,
    sourceTotals,
  };
}

export async function loadLeaderboardDataset(): Promise<LeaderboardDataset> {
  const [
    playersResult,
    accountsResult,
    worldStatsResult,
    worldsResult,
    aeternumResult,
  ] = await Promise.all([
    supabaseAdmin.from("players").select("id,username,username_lower,minecraft_uuid_hash,last_seen_at"),
    supabaseAdmin.from("connected_accounts").select("user_id,minecraft_uuid_hash,minecraft_username"),
    supabaseAdmin.from("player_world_stats").select("player_id,world_id,total_blocks,last_seen_at"),
    supabaseAdmin.from("worlds_or_servers").select(
      "id,world_key,display_name,kind,host,source_scope,first_seen_at,last_seen_at,approval_status,submitted_by_player_id,submitted_at,reviewed_by_user_id,reviewed_at,icon_url,scoreboard_title,sample_sidebar_lines,detected_stat_fields,scan_confidence,raw_scan_evidence,scan_fingerprint,last_scan_at,last_scan_submitted_by_player_id",
    ),
    supabaseAdmin
      .from("aeternum_player_stats")
      .select("source_world_id,player_id,minecraft_uuid_hash,username,username_lower,player_digs,total_digs,server_name,latest_update")
      .eq("is_fake_player", false),
  ]);

  for (const result of [playersResult, accountsResult, worldStatsResult, worldsResult, aeternumResult]) {
    if (result.error) throw result.error;
  }

  const players = (playersResult.data ?? []) as PlayerRow[];
  const accounts = (accountsResult.data ?? []) as ConnectedAccountRow[];
  const worldStats = (worldStatsResult.data ?? []) as PlayerWorldStatRow[];
  const worlds = (worldsResult.data ?? []) as WorldSourceRow[];
  const aeternumRows = (aeternumResult.data ?? []) as AeternumPlayerStatRow[];

  const playerById = new Map(players.map((row) => [row.id, row]));
  const accountByUuidHash = new Map(accounts.map((row) => [row.minecraft_uuid_hash, row]));
  const accountByUsername = new Map(
    accounts.map((row) => [normalizeUsername(row.minecraft_username), row]),
  );
  const worldById = new Map(worlds.map((row) => [row.id, row]));

  const sourceRollups = buildSourceRollups(worlds, worldStats);
  const { globalVisible: globalVisibleWorlds, publicVisible: publicWorlds } =
    selectLeaderboardWorldRollups(sourceRollups);

  const publicWorldIds = new Set(publicWorlds.map((rollup) => rollup.id));
  const globalWorldIds = new Set(globalVisibleWorlds.map((rollup) => rollup.id));

  const sourceTotals = new Map<string, LeaderboardSourceTotals>(
    globalVisibleWorlds.map(
      (rollup) => [`world:${rollup.id}`, { totalBlocks: rollup.totalBlocks }] as const,
    ),
  );

  const scoreboardBackedWorldIds = new Set(
    aeternumRows
      .map((row) => row.source_world_id ?? null)
      .filter((value): value is string => Boolean(value)),
  );

  const contributions: LeaderboardContribution[] = [];

  // Non-scoreboard-backed world stats
  for (const row of worldStats) {
    const blocksMined = toNumber(row.total_blocks);
    if (blocksMined <= 0) continue;
    if (scoreboardBackedWorldIds.has(row.world_id)) continue;

    const player = playerById.get(row.player_id);
    const world = worldById.get(row.world_id);
    if (!player || !world || !globalWorldIds.has(world.id)) continue;

    const account = player.minecraft_uuid_hash
      ? accountByUuidHash.get(player.minecraft_uuid_hash) ?? null
      : accountByUsername.get(normalizeUsername(player.username)) ?? null;

    contributions.push({
      username: player.username,
      usernameLower: player.username_lower ?? normalizeUsername(player.username),
      playerId: player.id,
      minecraftUuidHash: player.minecraft_uuid_hash ?? null,
      internalUserId: account?.user_id ?? null,
      verifiedLinkedUsername: account?.minecraft_username ?? null,
      sourceKey: `world:${world.id}`,
      sourceLabel: world.display_name,
      sourceKind: "world",
      blocksMined,
      lastUpdated: row.last_seen_at || player.last_seen_at,
      includeSourceView: publicWorldIds.has(world.id),
    });
  }

  // Scoreboard-backed rows
  const latestAeternum = buildLatestAeternumSnapshot(aeternumRows);

  // Seed authoritative scoreboard totals once per source
  for (const [sourceKey, totals] of latestAeternum.sourceTotals.entries()) {
    if (!sourceTotals.has(sourceKey)) {
      sourceTotals.set(sourceKey, totals);
    }
  }

  for (const row of latestAeternum.latestRows) {
    const blocksMined = toNumber(row.player_digs);
    if (blocksMined <= 0) continue;

    const sourceMeta = resolveScoreboardSourceMeta(row, worldById, publicWorldIds, globalWorldIds);
    if (!sourceMeta.visibleInGlobal) continue;

    const player = row.player_id ? playerById.get(row.player_id) ?? null : null;
    const account = row.minecraft_uuid_hash
      ? accountByUuidHash.get(row.minecraft_uuid_hash) ?? null
      : accountByUsername.get(normalizeUsername(row.username)) ?? null;

    contributions.push({
      username: player?.username ?? row.username,
      usernameLower:
        player?.username_lower ?? row.username_lower ?? normalizeUsername(row.username),
      playerId: player?.id ?? row.player_id ?? null,
      minecraftUuidHash: row.minecraft_uuid_hash ?? player?.minecraft_uuid_hash ?? null,
      internalUserId: account?.user_id ?? null,
      verifiedLinkedUsername: account?.minecraft_username ?? null,
      sourceKey: sourceMeta.sourceKey,
      sourceLabel: sourceMeta.sourceLabel,
      sourceKind: "world",
      blocksMined,
      lastUpdated: row.latest_update,
      includeSourceView: sourceMeta.visibleInSource,
    });
  }

  const views = aggregateLeaderboardViews(contributions, sourceTotals);
  const existingViewKeys = new Set(views.map((view) => view.key));

  const missingApprovedWorldViews = publicWorlds
    .filter((rollup) => !existingViewKeys.has(`world:${rollup.id}`))
    .map((rollup) => ({
      key: `world:${rollup.id}`,
      label: rollup.displayName,
      description: `Totals from ${rollup.displayName}.`,
      kind: "source" as const,
      playerCount: 0,
      totalBlocks: rollup.totalBlocks,
      rows: [],
    }));

  const mergedViews = [...views, ...missingApprovedWorldViews].sort((a, b) => {
    if (a.key === "global") return -1;
    if (b.key === "global") return 1;
    return b.totalBlocks - a.totalBlocks || a.label.localeCompare(b.label);
  });

  const globalView =
    mergedViews.find((view) => view.key === "global") ?? mergedViews[0];

  return {
    views: mergedViews,
    featuredRows: (globalView?.rows ?? []).slice(0, 3).map(mapRowSummary),
  };
}

export function findLeaderboardRow(
  rows: AggregatedLeaderboardRow[],
  options: {
    playerIds?: string[];
    username?: string | null;
  },
) {
  const playerIds = new Set((options.playerIds ?? []).filter(Boolean));
  const usernameLower = normalizeUsername(options.username);

  return (
    rows.find((row) => {
      if (row.playerId && playerIds.has(row.playerId)) {
        return true;
      }
      return usernameLower !== "" && normalizeUsername(row.username) === usernameLower;
    }) ?? null
  );
}

export async function buildLeaderboardResponse(options: {
  view?: string | null;
  page?: number;
  pageSize?: number;
  query?: string | null;
  minBlocks?: number;
  highlightedPlayer?: string | null;
}): Promise<LeaderboardApiResponse> {
  const dataset = await loadLeaderboardDataset();

  const selected =
    dataset.views.find((view) => view.key === (options.view ?? "global")) ||
    dataset.views.find((view) => view.key === "global") ||
    dataset.views[0];

  const filteredRows = filterLeaderboardRows(
    selected?.rows ?? [],
    options.query ?? "",
    Math.max(0, Number(options.minBlocks ?? 0)),
  );

  const paginated = paginateLeaderboardRows(
    filteredRows,
    options.page ?? 1,
    options.pageSize ?? 100,
  );

  return {
    selectedView: selected?.key ?? "global",
    selectedViewLabel: selected?.label ?? "Main Leaderboard",
    selectedViewDescription:
      selected?.description ?? "Totals across every approved server and world.",
    selectedViewKind: selected?.kind ?? "global",
    featuredRows: dataset.featuredRows,
    rows: paginated.rows.map(mapRowSummary),
    page: paginated.page,
    pageSize: paginated.pageSize,
    totalRows: paginated.totalRows,
    totalPages: paginated.totalPages,
    totalBlocks: selected?.totalBlocks ?? 0,
    playerCount: selected?.playerCount ?? 0,
    highlightedPlayer: options.highlightedPlayer ?? null,
    views: dataset.views.map((view) => ({
      key: view.key,
      label: view.label,
      description: view.description,
      kind: view.kind,
      playerCount: view.playerCount,
      totalBlocks: view.totalBlocks,
    })),
  };
}
