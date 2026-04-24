import { supabaseAdmin } from "./server.js";
import { normalizePlayerFlagCode } from "../../shared/admin-management.js";
import spreadsheetSnapshot from "./static-mmm-snapshot.js";

type JsonRecord = Record<string, unknown>;
type OverrideKind = "source" | "source-row" | "single-player";

type OverrideRow = {
  id: string;
  kind: OverrideKind;
  data: JsonRecord;
};

type PlayerMetadataFlagRow = {
  player_id: string | null;
  flag_code: string | null;
};

type OverrideMaps = {
  sources: Map<string, JsonRecord>;
  sourceRows: Map<string, JsonRecord>;
  singlePlayers: Map<string, JsonRecord>;
};

const snapshot = spreadsheetSnapshot as JsonRecord;
const sources = Array.isArray(snapshot.sources) ? (snapshot.sources as JsonRecord[]) : [];
const specialLeaderboards = snapshot.specialLeaderboards && typeof snapshot.specialLeaderboards === "object"
  ? (snapshot.specialLeaderboards as Record<string, JsonRecord>)
  : {};
function getStaticSpecialSources(kind: string) {
  const dataset = specialLeaderboards[kind];
  return dataset && Array.isArray(dataset.sources) ? (dataset.sources as JsonRecord[]) : [];
}

const allSnapshotSources = [...sources, ...getStaticSpecialSources("ssp-hsp")];
const snapshotSourceById = new Map(
  allSnapshotSources.map((source) => [String(source.id ?? source.slug ?? ""), source]),
);

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function hasOwn(record: JsonRecord | null | undefined, key: string) {
  return Boolean(record && Object.prototype.hasOwnProperty.call(record, key));
}

export async function loadStaticManualOverrides(): Promise<OverrideMaps> {
  const empty: OverrideMaps = {
    sources: new Map(),
    sourceRows: new Map(),
    singlePlayers: new Map(),
  };

  const { data, error } = await supabaseAdmin
    .from("mmm_manual_overrides")
    .select("id,kind,data");

  if (error) {
    return empty;
  }

  for (const row of (data ?? []) as OverrideRow[]) {
    const payload = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {};
    if (row.kind === "source") {
      empty.sources.set(row.id, payload);
    } else if (row.kind === "source-row") {
      empty.sourceRows.set(row.id, payload);
    } else if (row.kind === "single-player") {
      empty.singlePlayers.set(row.id, payload);
    }
  }

  const metadataLookup = await supabaseAdmin
    .from("player_metadata")
    .select("player_id,flag_code")
    .not("flag_code", "is", null);
  const metadataRows = (metadataLookup.error ? [] : metadataLookup.data ?? []) as PlayerMetadataFlagRow[];
  const playerIds = [...new Set(metadataRows.map((row) => row.player_id).filter((value): value is string => Boolean(value)))];
  if (playerIds.length > 0) {
    const playerLookup = await supabaseAdmin
      .from("players")
      .select("id,username")
      .in("id", playerIds);
    const playersById = new Map(
      ((playerLookup.error ? [] : playerLookup.data ?? []) as Array<{ id: string; username: string | null }>)
        .map((row) => [row.id, row.username]),
    );

    for (const row of metadataRows) {
      const username = row.player_id ? playersById.get(row.player_id) : null;
      const flagCode = normalizePlayerFlagCode(row.flag_code);
      if (!username || !flagCode) continue;
      const key = `sheet:${username.toLowerCase()}`;
      const existing = empty.singlePlayers.get(key) ?? {};
      if (!hasOwn(existing, "flagUrl")) {
        empty.singlePlayers.set(key, {
          ...existing,
          flagUrl: `/generated/world-flags/${flagCode}.png`,
        });
      }
    }
  }

  return empty;
}

function applySourceOverride<T extends JsonRecord>(source: T | null | undefined, overrides: OverrideMaps) {
  if (!source) return source;
  const sourceId = String(source.id ?? "");
  const override = overrides.sources.get(sourceId);
  const totalBlocks = getEffectiveSourceTotal(sourceId, source, overrides);

  return {
    ...source,
    displayName: stringOrNull(override?.displayName) ?? source.displayName,
    totalBlocks,
    logoUrl: stringOrNull(override?.logoUrl) ?? source.logoUrl ?? null,
  };
}

function rerankRows(rows: JsonRecord[]) {
  const sorted = [...rows].sort((left, right) => {
    const delta = toNumber(right.blocksMined, 0) - toNumber(left.blocksMined, 0);
    if (delta !== 0) return delta;
    return String(left.username ?? "").localeCompare(String(right.username ?? ""));
  });

  return sorted.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

function localPlayerId(username: string) {
  return username.toLowerCase() === "5hekel" ? "local-owner-player" : `local-player:${username.toLowerCase()}`;
}

function sourceRows(source: JsonRecord | null | undefined) {
  return source && Array.isArray(source.rows) ? (source.rows as JsonRecord[]) : [];
}

function getSourceRowOverride(overrides: OverrideMaps, sourceId: string, playerId: string, username?: string) {
  const normalizedUsername = String(username ?? "").trim().toLowerCase();
  return overrides.sourceRows.get(`${sourceId}:${playerId}`)
    ?? (normalizedUsername ? overrides.sourceRows.get(`${sourceId}:${localPlayerId(normalizedUsername)}`) : undefined);
}

function getSinglePlayerOverride(overrides: OverrideMaps, playerId: string, username?: string) {
  const normalizedUsername = String(username ?? "").trim().toLowerCase();
  return overrides.singlePlayers.get(playerId)
    ?? (normalizedUsername ? overrides.singlePlayers.get(`sheet:${normalizedUsername}`) ?? overrides.singlePlayers.get(localPlayerId(normalizedUsername)) : undefined);
}

function isSourceRowHidden(override: JsonRecord | null | undefined) {
  return override?.hidden === true || Boolean(stringOrNull(override?.mergedIntoSourceId));
}

function getEffectiveRowSourceName(source: JsonRecord | null | undefined, sourceId: string, rowOverride: JsonRecord | null | undefined, overrides: OverrideMaps, fallback: unknown) {
  const sourceOverride = sourceId ? overrides.sources.get(sourceId) : null;
  return stringOrNull(rowOverride?.sourceName)
    ?? stringOrNull(sourceOverride?.displayName)
    ?? String(source?.displayName ?? fallback ?? "Unknown Source");
}

function getEffectiveSourceTotal(sourceId: string, source: JsonRecord, overrides: OverrideMaps) {
  const snapshotSource = snapshotSourceById.get(sourceId) ?? source;
  const rows = sourceRows(snapshotSource);
  const hasRowOverride = rows.some((row) =>
    Boolean(getSourceRowOverride(overrides, sourceId, localPlayerId(String(row.username ?? "")), String(row.username ?? ""))),
  );
  if (rows.length > 0 && hasRowOverride) {
    return rows.reduce((sum, row) => {
      const username = String(row.username ?? "");
      const playerId = localPlayerId(username);
      const override = getSourceRowOverride(overrides, sourceId, playerId, username);
      if (isSourceRowHidden(override)) return sum;
      return sum + toNumber(override?.blocksMined, toNumber(row.blocksMined, 0));
    }, 0);
  }

  const sourceOverride = overrides.sources.get(sourceId);
  if (hasOwn(sourceOverride, "totalBlocks")) {
    return toNumber(sourceOverride?.totalBlocks, toNumber(source.totalBlocks, 0));
  }
  return toNumber(source.totalBlocks, toNumber(snapshotSource.totalBlocks, 0));
}

function buildPlayerAggregates(overrides: OverrideMaps) {
  const aggregates = new Map<string, {
    username: string;
    playerId: string;
    totalBlocks: number;
    sourceCount: number;
    hasSourceRowOverride: boolean;
    sourceServer: string;
    lastUpdated: string;
  }>();

  for (const source of allSnapshotSources) {
    const sourceId = String(source.id ?? source.slug ?? "");
    const sourceOverride = overrides.sources.get(sourceId);
    const sourceName = stringOrNull(sourceOverride?.displayName) ?? String(source.displayName ?? "");
    for (const row of sourceRows(source)) {
      const username = String(row.username ?? "").trim();
      if (!username) continue;
      const key = username.toLowerCase();
      const playerId = localPlayerId(username);
      const override = getSourceRowOverride(overrides, sourceId, playerId, username);
      if (isSourceRowHidden(override)) continue;
      const existing = aggregates.get(key);
      const lastUpdated = String(row.lastUpdated ?? snapshot.generatedAt ?? "");
      const rowSourceName = getEffectiveRowSourceName(source, sourceId, override, overrides, sourceName);
      aggregates.set(key, {
        username,
        playerId,
        totalBlocks: (existing?.totalBlocks ?? 0) + toNumber(override?.blocksMined, toNumber(row.blocksMined, 0)),
        sourceCount: (existing?.sourceCount ?? 0) + 1,
        hasSourceRowOverride: Boolean(existing?.hasSourceRowOverride || override),
        sourceServer: existing?.sourceServer || rowSourceName,
        lastUpdated: existing?.lastUpdated || lastUpdated,
      });
    }
  }

  return aggregates;
}

function rankForSourcePlayer(sourceId: string, playerId: string, username: string, overrides: OverrideMaps) {
  const source = snapshotSourceById.get(sourceId);
  if (!source) return null;
  const rows = sourceRows(source).flatMap((row) => {
    const rowUsername = String(row.username ?? "");
    const rowPlayerId = localPlayerId(rowUsername);
    const override = getSourceRowOverride(overrides, sourceId, rowPlayerId, rowUsername);
    if (isSourceRowHidden(override)) return [];
    return [{
      username: rowUsername,
      playerId: rowPlayerId,
      blocksMined: toNumber(override?.blocksMined, toNumber(row.blocksMined, 0)),
    }];
  });
  const ranked = rerankRows(rows as JsonRecord[]) as JsonRecord[];
  const normalizedUsername = username.trim().toLowerCase();
  const match = ranked.find((row) =>
    String(row.playerId ?? "") === playerId || String(row.username ?? "").toLowerCase() === normalizedUsername,
  );
  return match ? Number(match.rank ?? 0) : null;
}

function getSsphspSplitEntries(username: string) {
  const slug = username.trim().toLowerCase();
  return getStaticSpecialSources("ssp-hsp").flatMap((source) => {
    const row = sourceRows(source).find((entry) => String(entry.username ?? "").toLowerCase() === slug);
    return row ? [{ source, row }] : [];
  });
}

function applySsphspAggregateOverrides(rows: unknown, overrides: OverrideMaps) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const mapped = rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const record = row as JsonRecord;
    const username = String(record.username ?? "");
    const entries = getSsphspSplitEntries(username);
    if (entries.length === 0) return record;

    const playerId = localPlayerId(username);
    const effectiveEntries = entries.filter((entry) => {
      const sourceId = String(entry.source.id ?? "");
      const override = getSourceRowOverride(overrides, sourceId, playerId, username);
      return !isSourceRowHidden(override);
    });
    const blocksMined = effectiveEntries.reduce((sum, entry) => {
      const sourceId = String(entry.source.id ?? "");
      const override = getSourceRowOverride(overrides, sourceId, playerId, username);
      return sum + toNumber(override?.blocksMined, toNumber(entry.row.blocksMined, 0));
    }, 0);

    const singlePlayerOverride = overrides.singlePlayers.get(String(record.playerId ?? ""))
      ?? overrides.singlePlayers.get(`sheet:${username.toLowerCase()}`)
      ?? overrides.singlePlayers.get(playerId);

    return {
      ...record,
      blocksMined,
      totalDigs: blocksMined,
      sourceCount: effectiveEntries.length,
      playerFlagUrl: hasOwn(singlePlayerOverride, "flagUrl")
        ? stringOrNull(singlePlayerOverride?.flagUrl)
        : record.playerFlagUrl ?? null,
    };
  }) as JsonRecord[];

  return rerankRows(mapped);
}

function applyRowOverrides(rows: unknown, sourceId: string | null, overrides: OverrideMaps) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const mapped = rows.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const record = row as JsonRecord;
    const playerId = String(record.playerId ?? "");
    const username = String(record.username ?? "").toLowerCase();
    const effectiveSourceId = sourceId ?? String(record.sourceId ?? "");
    const source = snapshotSourceById.get(effectiveSourceId);
    const sourceOverride = effectiveSourceId ? overrides.sources.get(effectiveSourceId) : null;
    const sourceRowOverride = sourceId ? getSourceRowOverride(overrides, effectiveSourceId, playerId, username) : null;
    if (isSourceRowHidden(sourceRowOverride)) return [];
    const playerOverride = getSinglePlayerOverride(overrides, playerId, username);
    const blocksOverride = sourceRowOverride ?? (sourceId ? null : playerOverride);
    const flagOverride = hasOwn(sourceRowOverride, "flagUrl") ? sourceRowOverride : playerOverride;
    const nextRank = sourceId && sourceRowOverride ? rankForSourcePlayer(effectiveSourceId, playerId, username, overrides) : null;
    if (!blocksOverride && !flagOverride && !sourceOverride) return record;

    return [{
      ...record,
      sourceServer: getEffectiveRowSourceName(source, effectiveSourceId, sourceRowOverride, overrides, record.sourceServer),
      blocksMined: blocksOverride ? toNumber(blocksOverride.blocksMined, toNumber(record.blocksMined, 0)) : record.blocksMined,
      totalDigs: blocksOverride ? toNumber(blocksOverride.blocksMined, toNumber(record.totalDigs, toNumber(record.blocksMined, 0))) : record.totalDigs,
      rank: nextRank ?? record.rank,
      playerFlagUrl: hasOwn(flagOverride, "flagUrl") ? stringOrNull(flagOverride?.flagUrl) : record.playerFlagUrl ?? null,
    }];
  }) as JsonRecord[];

  return rerankRows(mapped);
}

function applyMainRowOverrides(rows: unknown, overrides: OverrideMaps) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const aggregates = buildPlayerAggregates(overrides);
  const mapped = rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const record = row as JsonRecord;
    const playerId = String(record.playerId ?? "");
    const username = String(record.username ?? "");
    const aggregate = aggregates.get(username.toLowerCase());
    const playerOverride = getSinglePlayerOverride(overrides, playerId, username);
    const useAggregate = Boolean(aggregate?.hasSourceRowOverride);
    const blocksMined = useAggregate
      ? toNumber(aggregate?.totalBlocks, toNumber(record.blocksMined, 0))
      : playerOverride
        ? toNumber(playerOverride.blocksMined, toNumber(record.blocksMined, 0))
        : toNumber(record.blocksMined, 0);

    return {
      ...record,
      blocksMined,
      totalDigs: blocksMined,
      sourceCount: useAggregate ? aggregate?.sourceCount ?? record.sourceCount : record.sourceCount,
      sourceServer: useAggregate ? aggregate?.sourceServer ?? record.sourceServer : record.sourceServer,
      playerFlagUrl: hasOwn(playerOverride, "flagUrl") ? stringOrNull(playerOverride?.flagUrl) : record.playerFlagUrl ?? null,
    };
  }) as JsonRecord[];

  return rerankRows(mapped);
}

export async function applyStaticManualOverridesToSources<T extends JsonRecord>(sources: T[]) {
  const overrides = await loadStaticManualOverrides();
  return sources.map((source) => applySourceOverride(source, overrides) as T);
}

export async function applyStaticManualOverridesToLeaderboardResponse<T extends JsonRecord | null>(payload: T): Promise<T> {
  if (!payload) return payload;
  const overrides = await loadStaticManualOverrides();
  const source = applySourceOverride(payload.source as JsonRecord | null, overrides);
  const sourceId = source ? String(source.id ?? "") : null;
  const isSsphspLeaderboard = String(payload.kind ?? "") === "ssp-hsp";
  const isMainLeaderboard = !sourceId && !isSsphspLeaderboard;
  const rows = (isSsphspLeaderboard
    ? applySsphspAggregateOverrides(payload.rows, overrides)
    : isMainLeaderboard
      ? applyMainRowOverrides(payload.rows, overrides)
    : applyRowOverrides(payload.rows, sourceId, overrides)) as JsonRecord[];
  const featuredRows = (isSsphspLeaderboard
    ? applySsphspAggregateOverrides(payload.featuredRows, overrides)
    : isMainLeaderboard
      ? applyMainRowOverrides(payload.featuredRows, overrides)
    : applyRowOverrides(payload.featuredRows, sourceId, overrides)).slice(0, 3);
  const totalBlocks = sourceId
    ? getEffectiveSourceTotal(sourceId, source as JsonRecord, overrides)
    : rows.reduce((sum, row) => sum + toNumber(row.blocksMined, 0), 0);

  return {
    ...payload,
    title: source ? source.displayName ?? payload.title : payload.title,
    source,
    rows,
    featuredRows,
    publicSources: Array.isArray(payload.publicSources)
      ? payload.publicSources.map((item) => applySourceOverride(item as JsonRecord, overrides))
      : payload.publicSources,
    totalBlocks,
  };
}

function mergeServerRows(rows: JsonRecord[], nameKey: string, blocksKey: string) {
  const merged = new Map<string, JsonRecord>();
  for (const row of rows) {
    const normalized = normalizeName(row[nameKey]);
    if (!normalized) continue;
    const existing = merged.get(normalized);
    if (!existing) {
      merged.set(normalized, row);
      continue;
    }
    merged.set(normalized, {
      ...existing,
      [blocksKey]: toNumber(existing[blocksKey], 0) + toNumber(row[blocksKey], 0),
      rank: Math.min(toNumber(existing.rank, Number.MAX_SAFE_INTEGER), toNumber(row.rank, Number.MAX_SAFE_INTEGER)),
    });
  }
  return [...merged.values()].sort((left, right) => toNumber(right[blocksKey], 0) - toNumber(left[blocksKey], 0));
}

export async function applyStaticManualOverridesToPlayerDetail<T extends JsonRecord | null>(payload: T): Promise<T> {
  if (!payload) return payload;
  const overrides = await loadStaticManualOverrides();
  const playerId = `sheet:${String(payload.name ?? "").toLowerCase()}`;
  const override = overrides.singlePlayers.get(playerId);
  let hasServerOverride = false;
  const servers = Array.isArray(payload.servers)
    ? payload.servers.flatMap((server) => {
        const record = server as JsonRecord;
        const sourceId = String(record.sourceId ?? "");
        const rowPlayerId = String(record.playerId ?? "");
        const source = snapshotSourceById.get(sourceId);
        const sourceRowOverride = sourceId && rowPlayerId ? getSourceRowOverride(overrides, sourceId, rowPlayerId, String(payload.name ?? "")) : null;
        if (isSourceRowHidden(sourceRowOverride)) return [];
        if (sourceRowOverride) {
          hasServerOverride = true;
        }
        const blocks = sourceRowOverride ? toNumber(sourceRowOverride.blocksMined, toNumber(record.blocks, 0)) : record.blocks;
        return [{
          ...record,
          server: getEffectiveRowSourceName(source, sourceId, sourceRowOverride, overrides, record.server),
          blocks,
          rank: sourceRowOverride ? rankForSourcePlayer(sourceId, rowPlayerId, String(payload.name ?? ""), overrides) ?? record.rank : record.rank,
        }];
      })
    : payload.servers;
  const mergedServers = Array.isArray(servers) ? mergeServerRows(servers, "server", "blocks") : servers;
  const serverTotal = Array.isArray(mergedServers)
    ? mergedServers.reduce((sum, server) => sum + toNumber((server as JsonRecord).blocks, 0), 0)
    : toNumber(payload.blocksNum, 0);

  return {
    ...payload,
    blocksNum: hasServerOverride
      ? serverTotal
      : override
        ? toNumber(override.blocksMined, toNumber(payload.blocksNum, 0))
        : payload.blocksNum,
    servers: mergedServers,
  };
}

export async function applyStaticManualOverridesToDashboardPlayerData<T extends JsonRecord | null>(payload: T): Promise<T> {
  if (!payload) return payload;
  const overrides = await loadStaticManualOverrides();
  const username = String(payload.username ?? "");
  const playerId = String(payload.playerId ?? localPlayerId(username));
  const override = getSinglePlayerOverride(overrides, playerId, username);
  let hasServerOverride = false;
  const servers = Array.isArray(payload.servers)
    ? payload.servers.flatMap((server) => {
        const record = server as JsonRecord;
        const sourceId = String(record.id ?? "");
        const source = snapshotSourceById.get(sourceId);
        const rowOverride = sourceId ? getSourceRowOverride(overrides, sourceId, playerId, username) : null;
        if (isSourceRowHidden(rowOverride)) return [];
        if (rowOverride) {
          hasServerOverride = true;
        }
        const totalBlocks = rowOverride ? toNumber(rowOverride.blocksMined, toNumber(record.totalBlocks, 0)) : record.totalBlocks;
        return [{
          ...record,
          displayName: getEffectiveRowSourceName(source, sourceId, rowOverride, overrides, record.displayName),
          totalBlocks,
          rank: rowOverride ? rankForSourcePlayer(sourceId, playerId, username, overrides) ?? record.rank : record.rank,
        }];
      })
    : payload.servers;
  const mergedServers = Array.isArray(servers) ? mergeServerRows(servers, "displayName", "totalBlocks") : servers;
  const serverTotal = Array.isArray(mergedServers)
    ? mergedServers.reduce((sum, server) => sum + toNumber((server as JsonRecord).totalBlocks, 0), 0)
    : toNumber(payload.totalBlocks, 0);

  const aggregate = buildPlayerAggregates(overrides).get(username.toLowerCase());
  const totalBlocks = hasServerOverride
    ? serverTotal
    : aggregate?.hasSourceRowOverride
      ? aggregate.totalBlocks
      : override
        ? toNumber(override.blocksMined, toNumber(payload.totalBlocks, 0))
        : payload.totalBlocks;

  return {
    ...payload,
    totalBlocks,
    sourceCount: Array.isArray(mergedServers) ? mergedServers.length : payload.sourceCount,
    sourceServer: Array.isArray(mergedServers) && mergedServers[0] ? String((mergedServers[0] as JsonRecord).displayName ?? payload.sourceServer ?? "") : payload.sourceServer,
    servers: mergedServers,
  };
}

export async function applyStaticManualOverridesToSubmitSources<T extends JsonRecord>(sources: T[], username: string) {
  const overrides = await loadStaticManualOverrides();
  const normalizedUsername = username.trim().toLowerCase();
  const playerId = localPlayerId(normalizedUsername);
  const mapped = sources.flatMap((source) => {
    const sourceId = String(source.sourceId ?? source.id ?? "");
    const snapshotSource = snapshotSourceById.get(sourceId);
    const sourceOverride = sourceId ? overrides.sources.get(sourceId) : null;
    const rowOverride = sourceId ? getSourceRowOverride(overrides, sourceId, playerId, normalizedUsername) : null;
    if (isSourceRowHidden(rowOverride)) return [];
    return [{
      ...source,
      sourceName: getEffectiveRowSourceName(snapshotSource, sourceId, rowOverride, overrides, source.sourceName),
      logoUrl: stringOrNull(sourceOverride?.logoUrl) ?? source.logoUrl ?? null,
      currentBlocks: rowOverride ? toNumber(rowOverride.blocksMined, toNumber(source.currentBlocks, 0)) : source.currentBlocks,
      rank: rowOverride ? rankForSourcePlayer(sourceId, playerId, normalizedUsername, overrides) ?? source.rank : source.rank,
    }];
  });

  return mapped.sort((left, right) => {
    const delta = toNumber(right.currentBlocks, 0) - toNumber(left.currentBlocks, 0);
    if (delta !== 0) return delta;
    return String(left.sourceName ?? "").localeCompare(String(right.sourceName ?? ""));
  });
}
