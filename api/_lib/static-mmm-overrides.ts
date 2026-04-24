import { supabaseAdmin } from "./server.js";
import { normalizePlayerFlagCode } from "../../shared/admin-management.js";
import { buildSourceSlug } from "../../shared/source-slug.js";
import spreadsheetSnapshot from "./static-mmm-snapshot.js";

type JsonRecord = Record<string, unknown>;
type OverrideKind = "source" | "source-row" | "single-player";

type OverrideRow = {
  id: string;
  kind: OverrideKind;
  data: JsonRecord;
};

type SubmissionRow = {
  id: string;
  user_id: string;
  minecraft_username: string;
  submission_type: "edit-existing-source" | "add-new-source";
  target_source_id: string | null;
  target_source_slug: string | null;
  source_name: string;
  source_type: string;
  submitted_blocks_mined: number;
  proof_image_ref?: string | null;
  logo_url?: string | null;
  payload?: JsonRecord | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

type PlayerMetadataFlagRow = {
  player_id: string | null;
  flag_code: string | null;
};

type OverrideMaps = {
  sources: Map<string, JsonRecord>;
  sourceRows: Map<string, JsonRecord>;
  singlePlayers: Map<string, JsonRecord>;
  submissionSources: JsonRecord[];
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
    submissionSources: [],
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

  const submissions = await loadApprovedSubmissions();
  for (const submission of submissions) {
    if (submission.submission_type === "edit-existing-source" && submission.target_source_id) {
      const username = String(submission.minecraft_username ?? "").trim();
      if (!username) continue;
      empty.sourceRows.set(`${submission.target_source_id}:${localPlayerId(username)}`, {
        blocksMined: toNumber(submission.submitted_blocks_mined, 0),
        sourceName: stringOrNull(submission.source_name) ?? undefined,
      });
    }
  }
  empty.submissionSources.push(...buildSubmissionSources(submissions));

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

function isMissingSupabaseTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  return record.code === "PGRST205" && String(record.message ?? "").includes("Could not find the table");
}

async function loadApprovedSubmissions() {
  const { data, error } = await supabaseAdmin
    .from("mmm_submissions")
    .select("*")
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .limit(250);
  if (error) {
    if (isMissingSupabaseTableError(error)) return [];
    return [];
  }
  return (data ?? []) as SubmissionRow[];
}

function submissionPlayerRows(submission: Pick<SubmissionRow, "payload" | "minecraft_username" | "submitted_blocks_mined">) {
  const payload = submission.payload && typeof submission.payload === "object" && !Array.isArray(submission.payload)
    ? submission.payload
    : {};
  const rawRows = Array.isArray(payload.playerRows) ? payload.playerRows : [];
  const rows = rawRows.flatMap((entry): Array<{ username: string; blocksMined: number }> => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as JsonRecord;
    const username = stringOrNull(record.username);
    const blocksMined = toNumber(record.blocksMined, 0);
    return username && blocksMined > 0 ? [{ username, blocksMined }] : [];
  });
  if (rows.length > 0) return rerankSubmissionRows(rows);
  const username = stringOrNull(submission.minecraft_username);
  const blocksMined = toNumber(submission.submitted_blocks_mined, 0);
  return username && blocksMined > 0 ? [{ username, blocksMined }] : [];
}

function rerankSubmissionRows<T extends { username: string; blocksMined: number }>(rows: T[]) {
  return [...rows].sort((left, right) => right.blocksMined - left.blocksMined || left.username.localeCompare(right.username));
}

function submissionSourceScope(sourceType: string) {
  const normalized = sourceType.trim().toLowerCase();
  if (normalized === "private-server" || normalized === "server") return "private_server_digs";
  if (normalized === "ssp" || normalized === "hsp" || normalized === "singleplayer" || normalized === "hardcore") return "private_singleplayer";
  return "submitted_source";
}

function isServerSubmissionType(sourceType: string) {
  const normalized = sourceType.trim().toLowerCase();
  return normalized === "private-server" || normalized === "server";
}

function submissionSourceSlug(submission: Pick<SubmissionRow, "id" | "source_name" | "source_type">) {
  const sourceName = stringOrNull(submission.source_name) ?? submission.id;
  return isServerSubmissionType(submission.source_type)
    ? buildSourceSlug({ displayName: sourceName })
    : buildSourceSlug({ displayName: sourceName, worldKey: submission.id });
}

function buildSubmissionSources(submissions: SubmissionRow[]) {
  const buckets = new Map<string, {
    sourceName: string;
    sourceType: string;
    logoUrl: string | null;
    createdAt: string;
    rows: Map<string, { username: string; blocksMined: number; lastUpdated: string }>;
  }>();

  for (const submission of submissions) {
    if (submission.submission_type !== "add-new-source") continue;
    const sourceName = stringOrNull(submission.source_name);
    if (!sourceName) continue;
    const rows = submissionPlayerRows(submission);
    if (rows.length === 0) continue;

    const slug = submissionSourceSlug(submission);
    const bucket = buckets.get(slug) ?? {
      sourceName,
      sourceType: submission.source_type || "server",
      logoUrl: stringOrNull(submission.logo_url),
      createdAt: submission.created_at,
      rows: new Map<string, { username: string; blocksMined: number; lastUpdated: string }>(),
    };

    bucket.logoUrl = bucket.logoUrl ?? stringOrNull(submission.logo_url);
    if (submission.created_at > bucket.createdAt) {
      bucket.createdAt = submission.created_at;
    }

    for (const row of rows) {
      const username = row.username.trim();
      const key = username.toLowerCase();
      const existing = bucket.rows.get(key);
      if (!existing || row.blocksMined > existing.blocksMined || submission.created_at > existing.lastUpdated) {
        bucket.rows.set(key, {
          username,
          blocksMined: Math.max(row.blocksMined, existing?.blocksMined ?? 0),
          lastUpdated: submission.created_at,
        });
      }
    }

    buckets.set(slug, bucket);
  }

  return [...buckets.entries()].map(([slug, bucket]) => {
    const rows = rerankSubmissionRows([...bucket.rows.values()]);
    return {
      id: `submission:${slug}`,
      slug,
      displayName: bucket.sourceName,
      sourceType: bucket.sourceType,
      logoUrl: bucket.logoUrl,
      totalBlocks: rows.reduce((sum, row) => sum + toNumber(row.blocksMined, 0), 0),
      isDead: false,
      playerCount: rows.length,
      sourceScope: submissionSourceScope(bucket.sourceType),
      hasSpreadsheetTotal: false,
      createdAt: bucket.createdAt,
      rows: rows.map((row, index) => ({
        username: row.username,
        blocksMined: row.blocksMined,
        lastUpdated: row.lastUpdated,
        rank: index + 1,
        playerId: localPlayerId(row.username),
      })),
    };
  });
}

function allEffectiveSources(overrides: OverrideMaps) {
  return [...allSnapshotSources, ...overrides.submissionSources];
}

function effectiveSourceById(overrides: OverrideMaps, sourceId: string) {
  return snapshotSourceById.get(sourceId)
    ?? overrides.submissionSources.find((source) => String(source.id ?? source.slug ?? "") === sourceId)
    ?? null;
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
  const snapshotSource = effectiveSourceById(overrides, sourceId) ?? source;
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

  for (const source of allEffectiveSources(overrides)) {
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
        hasSourceRowOverride: Boolean(existing?.hasSourceRowOverride || override || String(sourceId).startsWith("submission:")),
        sourceServer: existing?.sourceServer || rowSourceName,
        lastUpdated: existing?.lastUpdated || lastUpdated,
      });
    }
  }

  return aggregates;
}

function rankForSourcePlayer(sourceId: string, playerId: string, username: string, overrides: OverrideMaps) {
  const source = effectiveSourceById(overrides, sourceId);
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

function getSsphspSplitEntries(username: string, overrides?: OverrideMaps) {
  const slug = username.trim().toLowerCase();
  const submittedSources = overrides?.submissionSources.filter((source) => {
    const type = String(source.sourceType ?? "").toLowerCase();
    return type === "ssp" || type === "hsp" || type === "singleplayer" || type === "hardcore";
  }) ?? [];
  return [...getStaticSpecialSources("ssp-hsp"), ...submittedSources].flatMap((source) => {
    const row = sourceRows(source).find((entry) => String(entry.username ?? "").toLowerCase() === slug);
    return row ? [{ source, row }] : [];
  });
}

function applySsphspAggregateOverrides(rows: unknown, overrides: OverrideMaps) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const seenUsernames = new Set<string>();
  const mapped = rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const record = row as JsonRecord;
    const username = String(record.username ?? "");
    if (username) seenUsernames.add(username.toLowerCase());
    const entries = getSsphspSplitEntries(username, overrides);
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

  for (const source of overrides.submissionSources) {
    const type = String(source.sourceType ?? "").toLowerCase();
    if (type !== "ssp" && type !== "hsp" && type !== "singleplayer" && type !== "hardcore") continue;
    for (const row of sourceRows(source)) {
      const username = String(row.username ?? "");
      if (!username || seenUsernames.has(username.toLowerCase())) continue;
      const entries = getSsphspSplitEntries(username, overrides);
      const blocksMined = entries.reduce((sum, entry) => sum + toNumber(entry.row.blocksMined, 0), 0);
      mapped.push({
        playerId: localPlayerId(username),
        username,
        skinFaceUrl: `https://minotar.net/avatar/${encodeURIComponent(username)}/32`,
        playerFlagUrl: null,
        lastUpdated: String(row.lastUpdated ?? source.createdAt ?? snapshot.generatedAt ?? ""),
        blocksMined,
        totalDigs: blocksMined,
        rank: 0,
        sourceServer: String(source.displayName ?? ""),
        sourceKey: `submitted:ssp-hsp:${username.toLowerCase()}`,
        sourceCount: entries.length,
        viewKind: "global",
        sourceId: String(source.id ?? ""),
        sourceSlug: String(source.slug ?? ""),
        rowKey: `submitted:ssp-hsp:${username.toLowerCase()}`,
      });
      seenUsernames.add(username.toLowerCase());
    }
  }

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
    const source = effectiveSourceById(overrides, effectiveSourceId);
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
  const seenUsernames = new Set<string>();
  const mapped = rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const record = row as JsonRecord;
    const playerId = String(record.playerId ?? "");
    const username = String(record.username ?? "");
    if (username) seenUsernames.add(username.toLowerCase());
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

  for (const aggregate of aggregates.values()) {
    if (seenUsernames.has(aggregate.username.toLowerCase())) continue;
    mapped.push({
      playerId: aggregate.playerId,
      username: aggregate.username,
      skinFaceUrl: `https://minotar.net/avatar/${encodeURIComponent(aggregate.username)}/32`,
      playerFlagUrl: null,
      lastUpdated: aggregate.lastUpdated,
      blocksMined: aggregate.totalBlocks,
      totalDigs: aggregate.totalBlocks,
      rank: 0,
      sourceServer: aggregate.sourceServer,
      sourceKey: `submitted:${aggregate.username.toLowerCase()}`,
      sourceCount: aggregate.sourceCount,
      viewKind: "global",
      rowKey: `submitted:${aggregate.username.toLowerCase()}`,
    });
  }

  return rerankRows(mapped);
}

export async function applyStaticManualOverridesToSources<T extends JsonRecord>(sources: T[]) {
  const overrides = await loadStaticManualOverrides();
  const mapped = sources.map((source) => applySourceOverride(source, overrides) as T);
  const existingIds = new Set(mapped.map((source) => String(source.id ?? "")));
  const submitted = overrides.submissionSources
    .filter((source) => !existingIds.has(String(source.id ?? "")))
    .map((source) => applySourceOverride(source, overrides) as T);
  return [...mapped, ...submitted]
    .sort((left, right) => String(left.displayName ?? "").localeCompare(String(right.displayName ?? "")));
}

function getActiveLeaderboardRequestFilters(url?: URL) {
  if (!url) return null;
  const query = String(url.searchParams.get("query") ?? "").trim().toLowerCase();
  const minBlocks = Math.max(0, Number(url.searchParams.get("minBlocks") ?? "0"));
  if (!query && minBlocks <= 0) return null;

  return {
    query,
    minBlocks,
    page: Math.max(1, Math.floor(Number(url.searchParams.get("page") ?? "1")) || 1),
    pageSize: Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get("pageSize") ?? "30")) || 30)),
  };
}

function applyLeaderboardRequestFilters(rows: JsonRecord[], filters: NonNullable<ReturnType<typeof getActiveLeaderboardRequestFilters>>) {
  return rows.filter((row) =>
    toNumber(row.blocksMined, 0) >= filters.minBlocks
    && (!filters.query || String(row.username ?? "").toLowerCase().includes(filters.query)),
  );
}

export async function applyStaticManualOverridesToLeaderboardResponse<T extends JsonRecord | null>(payload: T, url?: URL): Promise<T> {
  if (!payload) return payload;
  const overrides = await loadStaticManualOverrides();
  const source = applySourceOverride(payload.source as JsonRecord | null, overrides);
  const sourceId = source ? String(source.id ?? "") : null;
  const isSsphspLeaderboard = String(payload.kind ?? "") === "ssp-hsp";
  const isMainLeaderboard = !sourceId && !isSsphspLeaderboard;
  let rows = (isSsphspLeaderboard
    ? applySsphspAggregateOverrides(payload.rows, overrides)
    : isMainLeaderboard
      ? applyMainRowOverrides(payload.rows, overrides)
    : applyRowOverrides(payload.rows, sourceId, overrides)) as JsonRecord[];
  const requestFilters = getActiveLeaderboardRequestFilters(url);
  const filteredRows = requestFilters ? applyLeaderboardRequestFilters(rows, requestFilters) : rows;
  const resolvedPageSize = requestFilters
    ? requestFilters.pageSize
    : Math.min(100, Math.max(1, Math.floor(Number(payload.pageSize ?? (rows.length || 30))) || 30));
  const unpaginatedTotalRows = requestFilters
    ? filteredRows.length
    : Math.max(toNumber(payload.totalRows, filteredRows.length), filteredRows.length);
  const resolvedTotalPages = Math.max(1, Math.ceil(unpaginatedTotalRows / resolvedPageSize));
  const resolvedPage = requestFilters
    ? Math.min(requestFilters.page, resolvedTotalPages)
    : Math.min(Math.max(1, Math.floor(Number(payload.page ?? 1)) || 1), resolvedTotalPages);
  rows = filteredRows.slice((resolvedPage - 1) * resolvedPageSize, resolvedPage * resolvedPageSize);
  const featuredRows = (isSsphspLeaderboard
    ? applySsphspAggregateOverrides(payload.featuredRows, overrides)
    : isMainLeaderboard
      ? applyMainRowOverrides(payload.featuredRows, overrides)
    : applyRowOverrides(payload.featuredRows, sourceId, overrides)).slice(0, 3);
  const totalBlocks = sourceId
    ? requestFilters ? filteredRows.reduce((sum, row) => sum + toNumber(row.blocksMined, 0), 0) : getEffectiveSourceTotal(sourceId, source as JsonRecord, overrides)
    : (requestFilters ? filteredRows : rows).reduce((sum, row) => sum + toNumber(row.blocksMined, 0), 0);
  const totalRows = unpaginatedTotalRows;
  const pageSize = resolvedPageSize;
  const totalPages = resolvedTotalPages;
  const page = resolvedPage;

  return {
    ...payload,
    title: source ? source.displayName ?? payload.title : payload.title,
    source,
    rows,
    featuredRows,
    publicSources: Array.isArray(payload.publicSources)
      ? await applyStaticManualOverridesToSources(payload.publicSources as JsonRecord[])
      : payload.publicSources,
    totalBlocks,
    totalRows,
    totalPages,
    page,
    pageSize,
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
        const source = effectiveSourceById(overrides, sourceId);
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
  const existingServerKeys = new Set(
    Array.isArray(servers)
      ? servers.map((server) => normalizeName((server as JsonRecord).server))
      : [],
  );
  if (Array.isArray(servers)) {
    for (const source of overrides.submissionSources) {
      for (const row of sourceRows(source)) {
        if (String(row.username ?? "").toLowerCase() !== String(payload.name ?? "").toLowerCase()) continue;
        const serverName = String(source.displayName ?? "");
        if (existingServerKeys.has(normalizeName(serverName))) continue;
        servers.push({
          sourceId: String(source.id ?? ""),
          playerId: localPlayerId(String(row.username ?? "")),
          server: serverName,
          blocks: toNumber(row.blocksMined, 0),
          rank: rankForSourcePlayer(String(source.id ?? ""), localPlayerId(String(row.username ?? "")), String(row.username ?? ""), overrides) ?? Number(row.rank ?? 0),
          joined: "2026",
        });
        hasServerOverride = true;
        existingServerKeys.add(normalizeName(serverName));
      }
    }
  }
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
        const source = effectiveSourceById(overrides, sourceId);
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
  const existingServerKeys = new Set(
    Array.isArray(servers)
      ? servers.map((server) => normalizeName((server as JsonRecord).displayName))
      : [],
  );
  if (Array.isArray(servers)) {
    for (const source of overrides.submissionSources) {
      for (const row of sourceRows(source)) {
        if (String(row.username ?? "").toLowerCase() !== username.toLowerCase()) continue;
        const displayName = String(source.displayName ?? "");
        if (existingServerKeys.has(normalizeName(displayName))) continue;
        servers.push({
          id: String(source.id ?? ""),
          displayName,
          totalBlocks: toNumber(row.blocksMined, 0),
          rank: rankForSourcePlayer(String(source.id ?? ""), playerId, username, overrides) ?? Number(row.rank ?? 0),
          lastUpdated: String(row.lastUpdated ?? source.createdAt ?? snapshot.generatedAt ?? ""),
        });
        hasServerOverride = true;
        existingServerKeys.add(normalizeName(displayName));
      }
    }
  }
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

function publicSourceSummaryFromSnapshot(source: JsonRecord) {
  const rows = sourceRows(source);
  return {
    id: source.id,
    slug: source.slug,
    displayName: source.displayName,
    sourceType: source.sourceType,
    logoUrl: source.logoUrl ?? null,
    totalBlocks: Number(source.totalBlocks ?? 0),
    isDead: Boolean(source.isDead),
    playerCount: Number(source.playerCount ?? rows.length ?? 0),
    sourceScope: source.sourceScope,
    hasSpreadsheetTotal: Boolean(source.hasSpreadsheetTotal),
  };
}

function submissionSourceLeaderboardRows(source: JsonRecord): JsonRecord[] {
  return rerankRows(sourceRows(source).map((row) => {
    const username = String(row.username ?? "");
    const blocksMined = toNumber(row.blocksMined, 0);
    return {
      playerId: localPlayerId(username),
      username,
      skinFaceUrl: `https://minotar.net/avatar/${encodeURIComponent(username)}/32`,
      playerFlagUrl: null,
      lastUpdated: String(row.lastUpdated ?? source.createdAt ?? snapshot.generatedAt ?? ""),
      blocksMined,
      totalDigs: blocksMined,
      rank: Number(row.rank ?? 0),
      sourceServer: String(source.displayName ?? ""),
      sourceKey: `${String(source.slug ?? "")}:${username.toLowerCase()}`,
      sourceCount: 1,
      viewKind: "source",
      sourceId: String(source.id ?? ""),
      sourceSlug: String(source.slug ?? ""),
      rowKey: `${String(source.slug ?? "")}:${username.toLowerCase()}`,
    };
  }) as JsonRecord[]);
}

export async function buildApprovedSubmissionSourceLeaderboardResponse(url: URL) {
  const sourceSlug = String(url.searchParams.get("source") ?? "");
  if (!sourceSlug) return null;
  const overrides = await loadStaticManualOverrides();
  const source = overrides.submissionSources.find((candidate) => String(candidate.slug ?? "") === sourceSlug);
  if (!source) return null;

  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page") ?? "1")) || 1);
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get("pageSize") ?? "30")) || 30));
  const minBlocks = Math.max(0, Number(url.searchParams.get("minBlocks") ?? "0"));
  const query = String(url.searchParams.get("query") ?? "").trim().toLowerCase();
  const baseRows = submissionSourceLeaderboardRows(source);
  const filteredRows = baseRows.filter((row) =>
    toNumber(row.blocksMined, 0) >= minBlocks
    && (!query || String(row.username ?? "").toLowerCase().includes(query)),
  );
  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const rows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const publicSources = await applyStaticManualOverridesToSources(sources.map(publicSourceSummaryFromSnapshot));

  return {
    scope: "source",
    title: source.displayName,
    description: `${source.displayName} approved from MMM owner moderation.`,
    scoreLabel: "Blocks Mined",
    source,
    featuredRows: baseRows.slice(0, 3),
    rows,
    page: safePage,
    pageSize,
    totalRows,
    totalPages,
    totalBlocks: filteredRows.reduce((sum, row) => sum + toNumber(row.blocksMined, 0), 0),
    playerCount: filteredRows.length,
    highlightedPlayer: "5hekel",
    publicSources,
  };
}

export async function buildApprovedSubmissionPlayerDetailResponse(url: URL) {
  const slug = String(url.searchParams.get("slug") ?? "").trim().toLowerCase();
  if (!slug) return null;
  const overrides = await loadStaticManualOverrides();
  const serverRows = overrides.submissionSources.flatMap((source) =>
    sourceRows(source)
      .filter((row) => String(row.username ?? "").toLowerCase() === slug)
      .map((row) => ({
        sourceId: String(source.id ?? ""),
        playerId: localPlayerId(String(row.username ?? slug)),
        server: String(source.displayName ?? ""),
        blocks: toNumber(row.blocksMined, 0),
        rank: rankForSourcePlayer(String(source.id ?? ""), localPlayerId(String(row.username ?? slug)), String(row.username ?? slug), overrides) ?? Number(row.rank ?? 0),
        joined: "2026",
      })),
  );
  if (serverRows.length === 0) return null;
  const username = String(sourceRows(overrides.submissionSources.find((source) => sourceRows(source).some((row) => String(row.username ?? "").toLowerCase() === slug)))?.find((row) => String(row.username ?? "").toLowerCase() === slug)?.username ?? slug);
  const blocksNum = serverRows.reduce((sum, row) => sum + row.blocks, 0);
  return {
    rank: 0,
    slug,
    name: username,
    blocksNum,
    avatarUrl: `https://nmsr.nickac.dev/fullbody/${encodeURIComponent(username)}`,
    bio: `${username} has approved MMM source submissions tracked through owner moderation.`,
    joined: "APR 2026",
    favoriteBlock: "DEEPSLATE",
    places: serverRows.length,
    servers: mergeServerRows(serverRows as JsonRecord[], "server", "blocks"),
    activity: [],
    sessions: [],
  };
}
