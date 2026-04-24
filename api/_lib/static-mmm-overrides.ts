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
const specialLeaderboards = snapshot.specialLeaderboards && typeof snapshot.specialLeaderboards === "object"
  ? (snapshot.specialLeaderboards as Record<string, JsonRecord>)
  : {};

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasOwn(record: JsonRecord | null | undefined, key: string) {
  return Boolean(record && Object.prototype.hasOwnProperty.call(record, key));
}

async function loadStaticManualOverrides(): Promise<OverrideMaps> {
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
  if (!override) return source;

  return {
    ...source,
    displayName: stringOrNull(override.displayName) ?? source.displayName,
    totalBlocks: toNumber(override.totalBlocks, toNumber(source.totalBlocks, 0)),
    logoUrl: stringOrNull(override.logoUrl) ?? source.logoUrl ?? null,
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

function getSsphspSplitEntries(username: string) {
  const slug = username.trim().toLowerCase();
  const dataset = specialLeaderboards["ssp-hsp"];
  const splitSources = dataset && Array.isArray(dataset.sources) ? dataset.sources as JsonRecord[] : [];
  return splitSources.flatMap((source) => {
    const rows = Array.isArray(source.rows) ? source.rows as JsonRecord[] : [];
    const row = rows.find((entry) => String(entry.username ?? "").toLowerCase() === slug);
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
    const blocksMined = entries.reduce((sum, entry) => {
      const sourceId = String(entry.source.id ?? "");
      const override = overrides.sourceRows.get(`${sourceId}:${playerId}`);
      return sum + toNumber(override?.blocksMined, toNumber(entry.row.blocksMined, 0));
    }, 0);

    const singlePlayerOverride = overrides.singlePlayers.get(String(record.playerId ?? ""))
      ?? overrides.singlePlayers.get(`sheet:${username.toLowerCase()}`)
      ?? overrides.singlePlayers.get(playerId);

    return {
      ...record,
      blocksMined,
      totalDigs: blocksMined,
      sourceCount: entries.length,
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

  const mapped = rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const record = row as JsonRecord;
    const playerId = String(record.playerId ?? "");
    const username = String(record.username ?? "").toLowerCase();
    const sourceRowId = `${sourceId ?? record.sourceId ?? ""}:${playerId}`;
    const sourceRowOverride = sourceId ? overrides.sourceRows.get(sourceRowId) : null;
    const singlePlayerOverride = overrides.singlePlayers.get(playerId)
      ?? (username ? overrides.singlePlayers.get(`sheet:${username}`) ?? overrides.singlePlayers.get(`local-player:${username}`) : undefined);
    const blocksOverride = sourceRowOverride ?? (sourceId ? null : singlePlayerOverride);
    const flagOverride = hasOwn(sourceRowOverride, "flagUrl") ? sourceRowOverride : singlePlayerOverride;
    if (!blocksOverride && !flagOverride) return record;

    return {
      ...record,
      blocksMined: blocksOverride ? toNumber(blocksOverride.blocksMined, toNumber(record.blocksMined, 0)) : record.blocksMined,
      totalDigs: blocksOverride ? toNumber(blocksOverride.blocksMined, toNumber(record.totalDigs, toNumber(record.blocksMined, 0))) : record.totalDigs,
      playerFlagUrl: hasOwn(flagOverride, "flagUrl") ? stringOrNull(flagOverride?.flagUrl) : record.playerFlagUrl ?? null,
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
  const rows = (isSsphspLeaderboard
    ? applySsphspAggregateOverrides(payload.rows, overrides)
    : applyRowOverrides(payload.rows, sourceId, overrides)) as JsonRecord[];
  const featuredRows = (isSsphspLeaderboard
    ? applySsphspAggregateOverrides(payload.featuredRows, overrides)
    : applyRowOverrides(payload.featuredRows, sourceId, overrides)).slice(0, 3);
  const totalBlocks = sourceId
    ? toNumber((source as JsonRecord | null)?.totalBlocks, rows.reduce((sum, row) => sum + toNumber(row.blocksMined, 0), 0))
    : rows.reduce((sum, row) => sum + toNumber(row.blocksMined, 0), 0);

  return {
    ...payload,
    source,
    rows,
    featuredRows,
    publicSources: Array.isArray(payload.publicSources)
      ? payload.publicSources.map((item) => applySourceOverride(item as JsonRecord, overrides))
      : payload.publicSources,
    totalBlocks,
  };
}

export async function applyStaticManualOverridesToPlayerDetail<T extends JsonRecord | null>(payload: T): Promise<T> {
  if (!payload) return payload;
  const overrides = await loadStaticManualOverrides();
  const playerId = `sheet:${String(payload.name ?? "").toLowerCase()}`;
  const override = overrides.singlePlayers.get(playerId);
  let hasServerOverride = false;
  const servers = Array.isArray(payload.servers)
    ? payload.servers.map((server) => {
        const record = server as JsonRecord;
        const sourceId = String(record.sourceId ?? "");
        const rowPlayerId = String(record.playerId ?? "");
        const sourceOverride = sourceId ? overrides.sources.get(sourceId) : null;
        const sourceRowOverride = sourceId && rowPlayerId ? overrides.sourceRows.get(`${sourceId}:${rowPlayerId}`) : null;
        if (sourceRowOverride) {
          hasServerOverride = true;
        }
        return {
          ...record,
          server: stringOrNull(sourceOverride?.displayName) ?? record.server,
          blocks: sourceRowOverride ? toNumber(sourceRowOverride.blocksMined, toNumber(record.blocks, 0)) : record.blocks,
        };
      })
    : payload.servers;
  const serverTotal = Array.isArray(servers)
    ? servers.reduce((sum, server) => sum + toNumber((server as JsonRecord).blocks, 0), 0)
    : toNumber(payload.blocksNum, 0);

  return {
    ...payload,
    blocksNum: override
      ? toNumber(override.blocksMined, toNumber(payload.blocksNum, 0))
      : hasServerOverride
        ? serverTotal
        : payload.blocksNum,
    servers,
  };
}
