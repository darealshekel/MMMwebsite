import { supabaseAdmin } from "./server.js";
import { normalizePlayerFlagCode } from "../../shared/admin-management.js";
import { isPlaceholderLeaderboardUsername } from "../../shared/leaderboard-ingestion.js";
import { canonicalPlayerName } from "../../shared/player-identity.js";
import { buildPlayerRenameIndexes, resolveRenamedPlayerName } from "../../shared/player-rename.js";
import { buildSourceSlug } from "../../shared/source-slug.js";
import { isServerSourceType, normalizeSourceType, sourceScopeForType } from "../../shared/source-types.js";
import { HSP_SOURCE_LOGO_URL, isHspSource, isSspHspSource, isSspSource, shouldShowInPrivateServerDigs, SSP_SOURCE_LOGO_URL } from "../../shared/source-classification.js";
import { buildNmsrFaceUrl, buildNmsrFullBodyUrl } from "../../shared/player-avatar.js";
import spreadsheetSnapshot from "./static-mmm-snapshot.js";
import { buildStaticLeaderboardResponse, buildStaticSpecialLeaderboardResponse, findStaticMainLeaderboardRowForPlayer, getStaticMainLeaderboardRows, getStaticPublicSources, getStaticSourceLeaderboardRows, getStaticSpecialLeaderboardRows } from "./static-mmm-leaderboard.js";
import { landingSummaryResponseCacheKey, mainLeaderboardResponseCacheKey, publicSourcesResponseCacheKey, specialLeaderboardResponseCacheKey, writeCachedPublicResponse } from "./public-response-cache.js";
import { isValidAeternumPlayerStat } from "./source-approval.js";
import { getSourceStats } from "./source-stats.js";

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

type LiveSourceEntryRow = {
  player_id: string | null;
  score: number | string | null;
  updated_at: string;
  source_id: string | null;
  sources?: LiveSourceMeta | LiveSourceMeta[] | null;
};

type LiveSourceMeta = {
  id: string;
  slug: string;
  display_name: string;
  source_type: string;
  is_public: boolean;
  is_approved: boolean;
};

type ApprovedWorldRow = {
  id: string;
  world_key: string;
  display_name: string;
  kind: string;
  host?: string | null;
  source_scope?: string | null;
  approval_status?: string | null;
};

type AeternumLiveRow = {
  source_world_id: string | null;
  server_name?: string | null;
  player_id: string | null;
  username: string | null;
  username_lower: string | null;
  player_digs: number | string | null;
  total_digs: number | string | null;
  latest_update: string;
  is_fake_player: boolean | null;
};

type LiveSourcePlayerRow = { playerId: string; username: string; blocksMined: number; lastUpdated: string };
type LiveSourceEntryWithUserRow = {
  player_id: string | null;
  score: number | string | null;
  updated_at: string;
  users?: { id: string; username: string | null } | Array<{ id: string; username: string | null }> | null;
};
type LiveSourceSummaryEntryRow = {
  player_id: string | null;
  score: number | string | null;
  updated_at: string;
  source_id: string | null;
  sources?: LiveSourceMeta | LiveSourceMeta[] | null;
};
type LiveSourceBucket = {
  source: LiveSourceMeta;
  rows: Map<string, LiveSourcePlayerRow>;
  verifiedSourceTotal?: number;
};

function skinFaceUrl(username: string) {
  return buildNmsrFaceUrl(username);
}

function fullBodyUrl(username: string) {
  return buildNmsrFullBodyUrl(username);
}

type OverrideMaps = {
  sources: Map<string, JsonRecord>;
  sourceRows: Map<string, JsonRecord>;
  singlePlayers: Map<string, JsonRecord>;
  submissionSources: JsonRecord[];
};

type SerializedOverrideMaps = {
  version: 5;
  generatedAt: string;
  sources: Array<[string, JsonRecord]>;
  sourceRows: Array<[string, JsonRecord]>;
  singlePlayers: Array<[string, JsonRecord]>;
  submissionSources: JsonRecord[];
};

type LoadStaticManualOverridesOptions = {
  includeFlagMetadata?: boolean;
};

type PersistedOverrideSnapshot = {
  value: OverrideMaps;
  ageMs: number;
};

const BASE_SNAPSHOT_ID = "static-overrides-base-v1";
const BASE_SNAPSHOT_VERSION = 5;
const BASE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60_000;
const BASE_SNAPSHOT_REFRESH_AGE_MS = 23 * 60 * 60_000;
const OVERRIDE_CACHE_TTL_MS = 5 * 60_000;
const FLAG_METADATA_CACHE_TTL_MS = 60_000;
const MIN_AUTHORITATIVE_SCOREBOARD_ROWS = 50;
let baseOverrideCache: { expiresAt: number; value: OverrideMaps } | null = null;
let baseOverrideCachePromise: Promise<OverrideMaps> | null = null;
let flagMetadataCache: { expiresAt: number; value: Map<string, JsonRecord> } | null = null;
let flagMetadataCachePromise: Promise<Map<string, JsonRecord>> | null = null;

const snapshot = spreadsheetSnapshot as JsonRecord;
const sources = Array.isArray(snapshot.sources) ? (snapshot.sources as JsonRecord[]) : [];
const specialLeaderboards = snapshot.specialLeaderboards && typeof snapshot.specialLeaderboards === "object"
  ? (snapshot.specialLeaderboards as Record<string, JsonRecord>)
  : {};
function getStaticSpecialSources(kind: string) {
  if (kind === "ssp") {
    return getStaticSpecialSources("ssp-hsp").filter(isSspSource);
  }
  if (kind === "hsp") {
    return getStaticSpecialSources("ssp-hsp").filter(isHspSource);
  }
  const dataset = specialLeaderboards[kind];
  return dataset && Array.isArray(dataset.sources) ? (dataset.sources as JsonRecord[]) : [];
}

const allSnapshotSources = [...sources, ...getStaticSpecialSources("ssp-hsp")];
const snapshotSourceById = new Map<string, JsonRecord>(
  allSnapshotSources.map((source): [string, JsonRecord] => [String(source.id ?? source.slug ?? ""), source]),
);
const snapshotSourceBySlug = new Map<string, JsonRecord>(
  allSnapshotSources
    .map((source): [string, JsonRecord] => [String(source.slug ?? "").toLowerCase(), source])
    .filter(([slug]) => Boolean(slug)),
);

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePlayerIdentity(value: unknown) {
  return canonicalPlayerName(value);
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function profileSourceName(row: JsonRecord) {
  return String(
    row.server
      ?? row.displayName
      ?? row.sourceServer
      ?? row.sourceName
      ?? row.name
      ?? row.sourceSlug
      ?? row.slug
      ?? "",
  );
}

function compactSourceName(value: unknown) {
  return normalizeName(value).replace(/[^a-z0-9]/g, "");
}

const NARUTAKU_SMP_SLUG = "narutaku-smp";

function isNarutakuSmpLabel(value: unknown) {
  return compactSourceName(value) === "narutakusmp";
}

function normalizeNarutakuSmpSource<T extends JsonRecord>(source: T): T {
  const displayName = source.displayName ?? source.sourceName ?? source.server ?? source.name ?? "";
  if (!isNarutakuSmpLabel(displayName)) {
    return source;
  }

  return {
    ...source,
    displayName: "Narutaku SMP",
    slug: NARUTAKU_SMP_SLUG,
    sourceType: "server",
    sourceCategory: "server",
    sourceScope: "private_server_digs",
  };
}

function normalizeNarutakuSmpProfileRow<T extends JsonRecord>(row: T): T {
  if (!isNarutakuSmpProfileSource(row)) {
    return row;
  }

  return {
    ...row,
    sourceSlug: NARUTAKU_SMP_SLUG,
    sourceType: "server",
    sourceCategory: "server",
    sourceScope: "private_server_digs",
  };
}

function isNarutakuSmpProfileSource(row: JsonRecord) {
  return compactSourceName(profileSourceName(row)) === "narutakusmp";
}

function isNarutakuSmpSourceRecord(source: JsonRecord | null | undefined) {
  return isNarutakuSmpLabel(
    source?.displayName
      ?? source?.sourceName
      ?? source?.server
      ?? source?.name
      ?? source?.slug
      ?? "",
  );
}

function isUnlabeledProfileWorld(row: JsonRecord) {
  const label = normalizeName(profileSourceName(row));
  return /^unlabel(?:ed|led) world(?:\s*(?:\(\d+\)|\d+))?$/.test(label)
    || /^unlabled world(?:\s*(?:\(\d+\)|\d+))?$/.test(label);
}

function narutakuSmpPlayerNames(overrides: OverrideMaps) {
  const players = new Set<string>();
  const renameIndexes = getPlayerRenameIndexes(overrides);
  const addPlayer = (playerId: string, username: string) => {
    const resolvedUsername = resolveRenamedPlayerName(renameIndexes, playerId, username) || username;
    const canonical = canonicalPlayerName(resolvedUsername);
    if (canonical) {
      players.add(canonical);
    }
  };

  for (const source of allEffectiveSources(overrides)) {
    if (!isNarutakuSmpSourceRecord(source)) continue;
    const sourceId = String(source.id ?? "");
    if (isSourceOverrideHidden(overrides.sources.get(sourceId))) continue;

    for (const row of effectiveVisibleSourceRows(sourceId, source, overrides)) {
      addPlayer(String(row.playerId ?? ""), String(row.username ?? ""));
    }

    for (const [overrideKey, override] of overrides.sourceRows.entries()) {
      if (!overrideKey.startsWith(`${sourceId}:`) || isSourceRowHidden(override)) continue;
      const playerId = sourceRowPlayerIdFromOverrideKey(sourceId, overrideKey);
      const username = usernameFromManualSourceRowOverride(playerId, override).trim();
      if (playerId && username) {
        addPlayer(playerId, username);
      }
    }
  }
  return players;
}

function removeNarutakuUnlabeledProfileWorlds(rows: JsonRecord[], isNarutakuSmpPlayer = false) {
  const hasNarutakuSmp = isNarutakuSmpPlayer || rows.some(isNarutakuSmpProfileSource);
  if (!hasNarutakuSmp) {
    return { rows, removed: false };
  }

  const filtered = rows.filter((row) => !isUnlabeledProfileWorld(row));
  return {
    rows: filtered,
    removed: filtered.length !== rows.length,
  };
}

function hasOwn(record: JsonRecord | null | undefined, key: string) {
  return Boolean(record && Object.prototype.hasOwnProperty.call(record, key));
}

export async function loadStaticManualOverrides(options: LoadStaticManualOverridesOptions = {}): Promise<OverrideMaps> {
  const includeFlagMetadata = options.includeFlagMetadata !== false;
  const baseOverrides = await loadBaseStaticManualOverrides();
  if (!includeFlagMetadata) {
    return cloneOverrideMaps(baseOverrides);
  }

  const flagOverrides = await loadFlagMetadataOverrides();
  return mergeFlagOverrides(baseOverrides, flagOverrides);
}

async function loadBaseStaticManualOverrides(): Promise<OverrideMaps> {
  const now = Date.now();
  const isTestRuntime = typeof process !== "undefined" && process.env?.NODE_ENV === "test";
  if (isTestRuntime) {
    return loadBaseStaticManualOverridesUncached();
  }
  if (!isTestRuntime && baseOverrideCache && baseOverrideCache.expiresAt > now) {
    return cloneOverrideMaps(baseOverrideCache.value);
  }
  if (!isTestRuntime && baseOverrideCache) {
    refreshBaseOverrideCache();
    return cloneOverrideMaps(baseOverrideCache.value);
  }
  if (!isTestRuntime && baseOverrideCachePromise) {
    return cloneOverrideMaps(await baseOverrideCachePromise);
  }

  const persisted = await loadPersistedBaseOverrideSnapshot(now);
  if (persisted) {
    baseOverrideCache = { value: persisted.value, expiresAt: Date.now() + OVERRIDE_CACHE_TTL_MS };
    if (persisted.ageMs > BASE_SNAPSHOT_REFRESH_AGE_MS) {
      refreshBaseOverrideCache();
    }
    return cloneOverrideMaps(persisted.value);
  }

  baseOverrideCachePromise = refreshBaseOverrideCache({ persist: true });
  return cloneOverrideMaps(await baseOverrideCachePromise);
}

function refreshBaseOverrideCache(options: { persist?: boolean } = {}) {
  if (baseOverrideCachePromise) {
    return baseOverrideCachePromise;
  }

  baseOverrideCachePromise = loadBaseStaticManualOverridesUncached()
    .then(async (value) => {
      baseOverrideCache = { value, expiresAt: Date.now() + OVERRIDE_CACHE_TTL_MS };
      if (options.persist) {
        await persistBaseOverrideSnapshot(value);
      } else {
        void persistBaseOverrideSnapshot(value);
      }
      return value;
    })
    .finally(() => {
      baseOverrideCachePromise = null;
    });
  return baseOverrideCachePromise;
}

async function loadFlagMetadataOverrides(): Promise<Map<string, JsonRecord>> {
  const now = Date.now();
  const isTestRuntime = typeof process !== "undefined" && process.env?.NODE_ENV === "test";
  if (isTestRuntime) {
    return loadFlagMetadataOverridesUncached();
  }
  if (!isTestRuntime && flagMetadataCache && flagMetadataCache.expiresAt > now) {
    return new Map(flagMetadataCache.value);
  }
  if (!isTestRuntime && flagMetadataCache) {
    refreshFlagMetadataCache();
    return new Map(flagMetadataCache.value);
  }
  if (!isTestRuntime && flagMetadataCachePromise) {
    return new Map(await flagMetadataCachePromise);
  }

  flagMetadataCachePromise = refreshFlagMetadataCache();
  return new Map(await flagMetadataCachePromise);
}

function refreshFlagMetadataCache() {
  if (flagMetadataCachePromise) {
    return flagMetadataCachePromise;
  }

  flagMetadataCachePromise = loadFlagMetadataOverridesUncached()
    .then((value) => {
      flagMetadataCache = { value, expiresAt: Date.now() + FLAG_METADATA_CACHE_TTL_MS };
      return value;
    })
    .finally(() => {
      flagMetadataCachePromise = null;
    });
  return flagMetadataCachePromise;
}

function cloneOverrideMaps(overrides: OverrideMaps): OverrideMaps {
  return {
    sources: new Map(overrides.sources),
    sourceRows: new Map(overrides.sourceRows),
    singlePlayers: new Map(overrides.singlePlayers),
    submissionSources: overrides.submissionSources.map(normalizeSubmittedSingleplayerSource),
  };
}

function isSubmittedSspAlias(source: JsonRecord) {
  const label = normalizeName(source.displayName ?? source.sourceName ?? source.name ?? source.slug ?? "");
  return String(source.id ?? "").startsWith("submission:") && (label === "ssp" || label === "ssp world");
}

function isSubmittedHspAlias(source: JsonRecord) {
  const label = normalizeName(source.displayName ?? source.sourceName ?? source.name ?? source.slug ?? "");
  return String(source.id ?? "").startsWith("submission:") && (label === "hsp" || label === "hsp world");
}

function normalizeSubmittedSingleplayerSource<T extends JsonRecord>(source: T): T {
  if (isSubmittedSspAlias(source)) {
    return {
      ...source,
      displayName: "SSP World",
      sourceType: "ssp",
      sourceScope: "private_singleplayer",
      sourceCategory: "ssp",
      logoUrl: stringOrNull(source.logoUrl) ?? SSP_SOURCE_LOGO_URL,
    };
  }

  if (isSubmittedHspAlias(source)) {
    return {
      ...source,
      displayName: "HSP World",
      sourceType: "hsp",
      sourceScope: "private_singleplayer",
      sourceCategory: "hsp",
      logoUrl: stringOrNull(source.logoUrl) ?? HSP_SOURCE_LOGO_URL,
    };
  }

  return source;
}

function applyBundledPublicFallbackOverrides(overrides: OverrideMaps): OverrideMaps {
  // Local preview cannot read Supabase manual overrides without service credentials.
  // Keep the linked 5hekel owner dashboard aligned with the current public website snapshot.
  const next = cloneOverrideMaps(overrides);
  const playerId = "sheet:5hekel";
  const localOwnerPlayerId = "local-owner-player";
  const lastUpdated = "2026-04-21T00:00:00Z";

  const sourceRows: Array<[string, JsonRecord]> = [
    ["private:969a974231f34f2fe16142fd349826ca", { blocksMined: 8_243_000 }],
    ["private:676a617afc5312b1a2351bdc58f08d36", { blocksMined: 2_180_000 }],
    ["private:bb7a7a248e0698809846366803707106", { blocksMined: 1_183_000 }],
    ["private:d2c5b71b60d97254457586a4e65400c3", { blocksMined: 3_945_807, username: "1uu1", playerId: "sheet:1uu1" }],
  ];

  for (const [sourceId, data] of sourceRows) {
    const rowPlayerId = String(data.playerId ?? playerId);
    const key = `${sourceId}:${rowPlayerId}`;
    if (!next.sourceRows.has(key)) {
      next.sourceRows.set(key, {
        ...data,
        username: String(data.username ?? "5hekel"),
        playerId: rowPlayerId,
        lastUpdated,
      });
    }
  }

  if (!next.singlePlayers.has("sheet:narutaku21")) {
    next.singlePlayers.set("sheet:narutaku21", {
      username: "narutaku21",
      blocksMined: 16_505_766,
      lastUpdated,
    });
  }

  if (!next.submissionSources.some((source) => String(source.id ?? "") === "submission:ssp")) {
    next.submissionSources.push({
      id: "submission:ssp",
      slug: "ssp",
      displayName: "SSP World",
      sourceType: "ssp",
      sourceCategory: "ssp",
      sourceScope: "private_singleplayer",
      logoUrl: SSP_SOURCE_LOGO_URL,
      createdAt: lastUpdated,
      rows: [{
        playerId: localOwnerPlayerId,
        username: "5hekel",
        blocksMined: 1_600_000,
        lastUpdated,
      }],
    });
  }

  return next;
}

function mergeFlagOverrides(baseOverrides: OverrideMaps, flagOverrides: Map<string, JsonRecord>): OverrideMaps {
  const merged = cloneOverrideMaps(baseOverrides);
  for (const [key, flagOverride] of flagOverrides) {
    const existing = merged.singlePlayers.get(key) ?? {};
    if (!hasOwn(existing, "flagUrl")) {
      merged.singlePlayers.set(key, {
        ...existing,
        ...flagOverride,
      });
    }
  }
  return merged;
}

async function loadBaseStaticManualOverridesUncached(): Promise<OverrideMaps> {
  const empty: OverrideMaps = {
    sources: new Map(),
    sourceRows: new Map(),
    singlePlayers: new Map(),
    submissionSources: [],
  };

  if (!process.env.VITE_SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    const isTestRuntime = typeof process !== "undefined" && process.env?.NODE_ENV === "test";
    return isTestRuntime ? empty : applyBundledPublicFallbackOverrides(empty);
  }

  const [manualOverridesResult, submissions, liveSources] = await Promise.all([
    supabaseAdmin
      .from("mmm_manual_overrides")
      .select("id,kind,data"),
    loadApprovedSubmissions(),
    loadApprovedLiveSources(),
  ]);

  if (!manualOverridesResult.error) {
    for (const row of (manualOverridesResult.data ?? []) as OverrideRow[]) {
      const payload = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {};
      if (row.kind === "source") {
        empty.sources.set(row.id, payload);
      } else if (row.kind === "source-row") {
        empty.sourceRows.set(row.id, payload);
      } else if (row.kind === "single-player") {
        empty.singlePlayers.set(row.id, payload);
      }
    }
  }

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
  empty.submissionSources.push(...liveSources);

  return empty;
}

function serializeOverrideMaps(overrides: OverrideMaps): SerializedOverrideMaps {
  return {
    version: BASE_SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    sources: [...overrides.sources.entries()],
    sourceRows: [...overrides.sourceRows.entries()],
    singlePlayers: [...overrides.singlePlayers.entries()],
    submissionSources: [...overrides.submissionSources],
  };
}

function deserializeOverrideMaps(value: unknown): OverrideMaps | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const snapshot = value as Partial<SerializedOverrideMaps>;
  if (snapshot.version !== BASE_SNAPSHOT_VERSION) {
    return null;
  }
  if (!Array.isArray(snapshot.sources) || !Array.isArray(snapshot.sourceRows) || !Array.isArray(snapshot.singlePlayers) || !Array.isArray(snapshot.submissionSources)) {
    return null;
  }

  return {
    sources: new Map(snapshot.sources),
    sourceRows: new Map(snapshot.sourceRows),
    singlePlayers: new Map(snapshot.singlePlayers),
    submissionSources: [...snapshot.submissionSources],
  };
}

function snapshotUpdatedAt(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 0;
  }
  const generatedAt = (value as { generatedAt?: unknown }).generatedAt;
  return typeof generatedAt === "string" ? new Date(generatedAt).getTime() : 0;
}

function snapshotAgeMs(value: unknown, now: number) {
  const updatedAt = snapshotUpdatedAt(value);
  return updatedAt > 0 ? now - updatedAt : Number.POSITIVE_INFINITY;
}

function isSnapshotFreshEnough(value: unknown, now: number) {
  return snapshotAgeMs(value, now) <= BASE_SNAPSHOT_MAX_AGE_MS;
}

async function loadPersistedBaseOverrideSnapshot(now: number): Promise<PersistedOverrideSnapshot | null> {
  const [primary, audit] = await Promise.all([
    readPublicSnapshotTable(now),
    readAuditSnapshotFallback(now),
  ]);
  return primary ?? audit;
}

async function readPublicSnapshotTable(now: number): Promise<PersistedOverrideSnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from("mmm_public_snapshots")
    .select("payload")
    .eq("id", BASE_SNAPSHOT_ID)
    .maybeSingle();

  if (error) {
    return null;
  }

  const payload = (data as { payload?: unknown } | null)?.payload;
  const value = payload && isSnapshotFreshEnough(payload, now) ? deserializeOverrideMaps(payload) : null;
  return value ? { value, ageMs: snapshotAgeMs(payload, now) } : null;
}

async function readAuditSnapshotFallback(now: number): Promise<PersistedOverrideSnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from("admin_audit_log")
    .select("after_state")
    .eq("action_type", "public-cache.refresh")
    .eq("target_type", "public-cache")
    .eq("target_id", BASE_SNAPSHOT_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  const payload = (data as { after_state?: unknown } | null)?.after_state;
  const value = payload && isSnapshotFreshEnough(payload, now) ? deserializeOverrideMaps(payload) : null;
  return value ? { value, ageMs: snapshotAgeMs(payload, now) } : null;
}

async function persistBaseOverrideSnapshot(overrides: OverrideMaps) {
  const payload = serializeOverrideMaps(overrides);
  const now = payload.generatedAt;

  const primary = await supabaseAdmin
    .from("mmm_public_snapshots")
    .upsert({
      id: BASE_SNAPSHOT_ID,
      payload,
      updated_at: now,
    }, { onConflict: "id" });

  if (!primary.error) {
    return;
  }

  const latest = await supabaseAdmin
    .from("admin_audit_log")
    .select("after_state")
    .eq("action_type", "public-cache.refresh")
    .eq("target_type", "public-cache")
    .eq("target_id", BASE_SNAPSHOT_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestPayload = latest.error ? null : (latest.data as { after_state?: unknown } | null)?.after_state;
  if (latestPayload && JSON.stringify(latestPayload) === JSON.stringify(payload)) {
    return;
  }

  await supabaseAdmin
    .from("admin_audit_log")
    .insert({
      actor_user_id: null,
      actor_role: "system",
      action_type: "public-cache.refresh",
      target_type: "public-cache",
      target_id: BASE_SNAPSHOT_ID,
      before_state: {},
      after_state: payload,
      reason: "Public MMM snapshot refresh",
      created_at: now,
    });
}

export async function refreshStaticManualOverridesSnapshot(): Promise<OverrideMaps> {
  const value = await loadBaseStaticManualOverridesUncached();
  baseOverrideCache = { value, expiresAt: Date.now() + OVERRIDE_CACHE_TTL_MS };
  await persistBaseOverrideSnapshot(value);
  await persistCommonPublicResponses();
  return cloneOverrideMaps(value);
}

async function persistCommonPublicResponses() {
  const mainPageUrl = new URL("https://mmm.local/api/leaderboard?page=1&pageSize=20");
  const mainPageTopTenUrl = new URL("https://mmm.local/api/leaderboard?page=1&pageSize=10");
  const sourceDirectoryUrl = new URL("https://mmm.local/api/leaderboard?page=1&pageSize=1");
  const ssphspUrl = new URL("https://mmm.local/api/leaderboard-special?kind=ssp-hsp&page=1&pageSize=20");
  const sspUrl = new URL("https://mmm.local/api/leaderboard-special?kind=ssp&page=1&pageSize=20");
  const hspUrl = new URL("https://mmm.local/api/leaderboard-special?kind=hsp&page=1&pageSize=20");

  const mainPayload = await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(mainPageUrl), mainPageUrl);
  const mainTopTenPayload = await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(mainPageTopTenUrl), mainPageTopTenUrl);
  const sourceDirectoryPayload = await applyStaticManualOverridesToLeaderboardResponse(buildStaticLeaderboardResponse(sourceDirectoryUrl), sourceDirectoryUrl);
  const ssphspPayload = await applyStaticManualOverridesToLeaderboardResponse(buildStaticSpecialLeaderboardResponse(ssphspUrl), ssphspUrl);
  const sspPayload = await applyStaticManualOverridesToLeaderboardResponse(buildStaticSpecialLeaderboardResponse(sspUrl), sspUrl);
  const hspPayload = await applyStaticManualOverridesToLeaderboardResponse(buildStaticSpecialLeaderboardResponse(hspUrl), hspUrl);
  const fastPublicSourcesPayload = await applyFastApprovedLiveSourceSummariesToSources(sources.map(publicSourceSummaryFromSnapshot));
  const publicSourcesPayload = await applyStaticManualOverridesToSources(fastPublicSourcesPayload);
  const landingTopSources = topServerDigsSources(publicSourcesPayload);
  const landingPayload = {
    featuredRows: Array.isArray(mainPayload?.featuredRows) ? mainPayload.featuredRows.slice(0, 5) : [],
    topSources: landingTopSources,
    generatedAt: new Date().toISOString(),
  };

  await Promise.all([
    writeCachedPublicResponse(mainLeaderboardResponseCacheKey(mainPageUrl), mainPayload ? { ...mainPayload, publicSources: [] } : mainPayload),
    writeCachedPublicResponse(mainLeaderboardResponseCacheKey(mainPageTopTenUrl), mainTopTenPayload ? { ...mainTopTenPayload, publicSources: [] } : mainTopTenPayload),
    writeCachedPublicResponse(mainLeaderboardResponseCacheKey(sourceDirectoryUrl), sourceDirectoryPayload ? { ...sourceDirectoryPayload, publicSources: [] } : sourceDirectoryPayload),
    writeCachedPublicResponse(specialLeaderboardResponseCacheKey(ssphspUrl), ssphspPayload),
    writeCachedPublicResponse(specialLeaderboardResponseCacheKey(sspUrl), sspPayload),
    writeCachedPublicResponse(specialLeaderboardResponseCacheKey(hspUrl), hspPayload),
    writeCachedPublicResponse(publicSourcesResponseCacheKey(), publicSourcesPayload),
    writeCachedPublicResponse(landingSummaryResponseCacheKey(), landingPayload),
  ]);
}

function topServerDigsSources(publicSources: JsonRecord[]) {
  return [...publicSources]
    .filter(shouldShowInPrivateServerDigs)
    .sort((left, right) => {
      const diff = toNumber(right.totalBlocks, 0) - toNumber(left.totalBlocks, 0);
      return diff || String(left.displayName ?? "").localeCompare(String(right.displayName ?? ""));
    })
    .slice(0, 3);
}

export async function buildLandingTopSourcesFromLeaderboardData() {
  const publicSources = await applyFastApprovedLiveSourceSummariesToSources(getStaticPublicSources() as JsonRecord[]);
  return topServerDigsSources(publicSources);
}

async function loadFlagMetadataOverridesUncached(): Promise<Map<string, JsonRecord>> {
  const flags = new Map<string, JsonRecord>();
  const metadataLookup = await supabaseAdmin
    .from("player_metadata")
    .select("player_id,flag_code")
    .not("flag_code", "is", null);

  const metadataRows = (metadataLookup.error ? [] : metadataLookup.data ?? []) as PlayerMetadataFlagRow[];
  const playerIds = [...new Set(metadataRows.map((row) => row.player_id).filter((value): value is string => Boolean(value)))];
  if (playerIds.length > 0) {
    const playerLookup = await supabaseAdmin
      .from("users")
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
      flags.set(key, {
        flagUrl: `/generated/world-flags/${flagCode}.png`,
      });
    }
  }

  return flags;
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
  const scope = sourceScopeForType(sourceType);
  if (scope === "public_server") return "private_server_digs";
  if (scope === "private_singleplayer") return "private_singleplayer";
  return "submitted_source";
}

async function loadUsersForLiveRows(playerIds: string[]) {
  if (playerIds.length === 0) {
    return new Map<string, { id: string; username: string }>();
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,username")
    .in("id", playerIds);

  if (error) return new Map<string, { id: string; username: string }>();

  return new Map(
    ((data ?? []) as Array<{ id: string; username: string | null }>)
      .filter((row): row is { id: string; username: string } => Boolean(row.id && row.username))
      .map((row) => [row.id, row]),
  );
}

async function loadUsersForLiveUsernames(usernamesLower: string[]) {
  if (usernamesLower.length === 0) {
    return new Map<string, { id: string; username: string }>();
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,username,username_lower,canonical_name")
    .in("username_lower", usernamesLower);

  if (error) return new Map<string, { id: string; username: string }>();

  return new Map(
    ((data ?? []) as Array<{ id: string; username: string | null; username_lower?: string | null; canonical_name?: string | null }>)
      .filter((row): row is { id: string; username: string; username_lower?: string | null; canonical_name?: string | null } => Boolean(row.id && row.username))
      .map((row) => [normalizePlayerIdentity(row.canonical_name ?? row.username_lower ?? row.username), { id: row.id, username: row.username }]),
  );
}

function buildLiveSourcePayload(bucket: {
  source: LiveSourceMeta;
  rows: Map<string, LiveSourcePlayerRow>;
  verifiedSourceTotal?: number;
}) {
  const source = bucket.source;
  const slug = String(source.slug ?? "").toLowerCase();
  const snapshotSource = snapshotSourceBySlug.get(slug);
  const rows = rerankSubmissionRows([...bucket.rows.values()]);
  const playerSum = rows.reduce((sum, row) => sum + toNumber(row.blocksMined, 0), 0);
  const verifiedSourceTotal = toNumber(bucket.verifiedSourceTotal, 0);
  return {
    id: String(source.id ?? slug),
    slug,
    displayName: String(source.display_name ?? snapshotSource?.displayName ?? slug),
    sourceType: String(source.source_type ?? snapshotSource?.sourceType ?? "server"),
    logoUrl: stringOrNull(snapshotSource?.logoUrl) ?? null,
    totalBlocks: verifiedSourceTotal > 0 ? verifiedSourceTotal : playerSum,
    isDead: Boolean(snapshotSource?.isDead ?? false),
    playerCount: rows.length,
    sourceScope: stringOrNull(snapshotSource?.sourceScope) ?? "private_server_digs",
    hasSpreadsheetTotal: false,
    createdAt: rows.reduce((latest, row) => row.lastUpdated > latest ? row.lastUpdated : latest, ""),
    liveApprovedSource: true,
    authoritativeLiveSourceRows: verifiedSourceTotal > 0,
    replacesStaticSourceId: snapshotSource ? String(snapshotSource.id ?? "") : null,
    rows: rows.map((row, index) => ({
      username: row.username,
      blocksMined: row.blocksMined,
      lastUpdated: row.lastUpdated,
      rank: index + 1,
      playerId: row.playerId,
    })),
  };
}

function rowTimestampMs(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function shouldReplaceSourceRow(existing: { blocksMined?: unknown; totalDigs?: unknown; lastUpdated?: unknown } | null | undefined, incoming: { blocksMined?: unknown; totalDigs?: unknown; lastUpdated?: unknown }) {
  if (!existing) return true;
  const incomingUpdatedAt = rowTimestampMs(incoming.lastUpdated);
  const existingUpdatedAt = rowTimestampMs(existing.lastUpdated);
  if (incomingUpdatedAt && existingUpdatedAt && incomingUpdatedAt !== existingUpdatedAt) {
    return incomingUpdatedAt > existingUpdatedAt;
  }

  const incomingBlocks = toNumber(incoming.blocksMined, toNumber(incoming.totalDigs, 0));
  const existingBlocks = toNumber(existing.blocksMined, toNumber(existing.totalDigs, 0));
  if (incomingBlocks !== existingBlocks) {
    return incomingBlocks > existingBlocks;
  }

  return String(incoming.lastUpdated ?? "") > String(existing.lastUpdated ?? "");
}

type LiveServerTotalDiagnostic = {
  latestUpdate: string;
  totalsByUpdate: Map<string, Map<number, number>>;
  samplePlayerNames: string[];
};

function recordLiveServerTotal(diagnostic: LiveServerTotalDiagnostic, totalDigs: number, latestUpdate: string) {
  if (totalDigs <= 0) return;
  const updateKey = latestUpdate || "";
  if (!diagnostic.latestUpdate || updateKey > diagnostic.latestUpdate) {
    diagnostic.latestUpdate = updateKey;
  }
  const totals = diagnostic.totalsByUpdate.get(updateKey) ?? new Map<number, number>();
  totals.set(totalDigs, (totals.get(totalDigs) ?? 0) + 1);
  diagnostic.totalsByUpdate.set(updateKey, totals);
}

function selectLiveServerTotal(diagnostic: LiveServerTotalDiagnostic | undefined) {
  if (!diagnostic) return 0;
  const totals = diagnostic.totalsByUpdate.get(diagnostic.latestUpdate)
    ?? diagnostic.totalsByUpdate.get("")
    ?? new Map<number, number>();
  const selected = [...totals.entries()].sort((left, right) => {
    const countDelta = right[1] - left[1];
    return countDelta || right[0] - left[0];
  })[0];
  return selected?.[0] ?? 0;
}

function dedupeLiveSourceRows(rows: LiveSourcePlayerRow[]) {
  const byPlayer = new Map<string, LiveSourcePlayerRow>();
  for (const row of rows) {
    const key = canonicalPlayerName(row.username) || String(row.playerId ?? "").trim().toLowerCase();
    if (!key || row.blocksMined <= 0) continue;
    const existing = byPlayer.get(key);
    if (!existing || shouldReplaceSourceRow(existing, row)) {
      byPlayer.set(key, row);
    }
  }
  return rerankSubmissionRows([...byPlayer.values()]);
}

function liveRowsFromLeaderboardEntries(entries: LiveSourceEntryWithUserRow[]) {
  return dedupeLiveSourceRows(entries.flatMap((entry) => {
    const user = Array.isArray(entry.users) ? entry.users[0] : entry.users;
    const username = String(user?.username ?? "").trim();
    const blocksMined = toNumber(entry.score, 0);
    if (!username || blocksMined <= 0 || isPlaceholderLeaderboardUsername(canonicalPlayerName(username))) {
      return [];
    }
    return [{
      playerId: String(entry.player_id ?? user?.id ?? localPlayerId(username)),
      username,
      blocksMined,
      lastUpdated: String(entry.updated_at ?? ""),
    }];
  }));
}

function liveRowsFromScoreboardStats(stats: AeternumLiveRow[]) {
  const diagnostic: LiveServerTotalDiagnostic = {
    latestUpdate: "",
    totalsByUpdate: new Map<string, Map<number, number>>(),
    samplePlayerNames: [],
  };
  const rows: LiveSourcePlayerRow[] = [];

  for (const stat of stats) {
    const usernameLower = normalizePlayerIdentity(stat.username_lower ?? stat.username);
    const username = String(stat.username ?? usernameLower).trim();
    const blocksMined = toNumber(stat.player_digs, 0);
    const totalDigs = toNumber(stat.total_digs, 0);
    const latestUpdate = String(stat.latest_update ?? "");
    if (!username || !isValidAeternumPlayerStat({
      usernameLower,
      playerDigs: blocksMined,
      serverTotal: totalDigs,
      isFakePlayer: stat.is_fake_player,
    })) {
      continue;
    }

    recordLiveServerTotal(diagnostic, totalDigs, latestUpdate);
    rows.push({
      playerId: String(stat.player_id ?? `scoreboard:${usernameLower}`),
      username,
      blocksMined,
      lastUpdated: latestUpdate,
    });
  }

  const dedupedRows = dedupeLiveSourceRows(rows);
  const verifiedSourceTotal = selectLiveServerTotal(diagnostic);
  return {
    rows: dedupedRows,
    verifiedSourceTotal,
    authoritative: verifiedSourceTotal > 0 && dedupedRows.length >= MIN_AUTHORITATIVE_SCOREBOARD_ROWS,
  };
}

function mergeLiveSourceRows(
  target: Map<string, LiveSourcePlayerRow>,
  incoming: Map<string, LiveSourcePlayerRow>,
) {
  const targetKeyByUsername = new Map(
    [...target.entries()].map(([key, row]) => [canonicalPlayerName(row.username), key]),
  );

  for (const [incomingKey, incomingRow] of incoming.entries()) {
    const usernameKey = canonicalPlayerName(incomingRow.username);
    const targetKey = target.has(incomingKey)
      ? incomingKey
      : usernameKey
        ? targetKeyByUsername.get(usernameKey) ?? incomingKey
        : incomingKey;
    const existing = target.get(targetKey);
    if (!existing) {
      target.set(targetKey, incomingRow);
      if (usernameKey) targetKeyByUsername.set(usernameKey, targetKey);
      continue;
    }

    if (shouldReplaceSourceRow(existing, incomingRow)) {
      target.set(targetKey, incomingRow);
    }
  }
}

async function loadApprovedWorldRowsBySourceSlug(sourcesBySlug: Map<string, LiveSourceMeta>) {
  if (sourcesBySlug.size === 0) {
    return new Map<string, { rows: Map<string, LiveSourcePlayerRow>; verifiedSourceTotal: number; playerSum: number }>();
  }

  let worldsResult: { data: unknown[] | null; error: unknown | null };
  try {
    worldsResult = await supabaseAdmin
      .from("worlds_or_servers")
      .select("id,world_key,display_name,kind,host,source_scope,approval_status")
      .eq("approval_status", "approved")
      .eq("source_scope", "public_server")
      .limit(1000);
  } catch {
    return new Map();
  }
  if (worldsResult.error) return new Map();

  const worldsById = new Map<string, { world: ApprovedWorldRow; source: LiveSourceMeta }>();
  for (const world of (worldsResult.data ?? []) as ApprovedWorldRow[]) {
    const slug = buildSourceSlug({
      displayName: world.display_name,
      worldKey: world.world_key,
      host: world.host ?? undefined,
    });
    const source = sourcesBySlug.get(slug);
    if (source) {
      worldsById.set(world.id, { world, source });
    }
  }
  if (worldsById.size === 0) return new Map();

  let statsResult: { data: unknown[] | null; error: unknown | null };
  try {
    statsResult = await supabaseAdmin
      .from("aeternum_player_stats")
      .select("source_world_id,player_id,username,username_lower,player_digs,total_digs,latest_update,is_fake_player")
      .in("source_world_id", [...worldsById.keys()])
      .limit(20_000);
  } catch {
    return new Map();
  }
  if (statsResult.error) return new Map();

  const stats = (statsResult.data ?? []) as AeternumLiveRow[];
  const usernamesLower = [...new Set(stats
    .map((row) => normalizePlayerIdentity(row.username_lower ?? row.username))
    .filter(Boolean))];
  const usersByUsername = await loadUsersForLiveUsernames(usernamesLower);
  const rowsBySourceId = new Map<string, Map<string, LiveSourcePlayerRow>>();
  const diagnosticsBySourceId = new Map<string, LiveServerTotalDiagnostic>();

  for (const row of stats) {
    const worldId = String(row.source_world_id ?? "");
    const worldEntry = worldsById.get(worldId);
    if (!worldEntry) continue;
    const usernameLower = normalizePlayerIdentity(row.username_lower ?? row.username);
    const username = String(row.username ?? usernameLower).trim();
    const sourceId = worldEntry.source.id;
    const diagnostic = diagnosticsBySourceId.get(sourceId) ?? {
      latestUpdate: "",
      totalsByUpdate: new Map<string, Map<number, number>>(),
      samplePlayerNames: [],
    };
    const totalDigs = toNumber(row.total_digs, 0);
    const latestUpdate = String(row.latest_update ?? "");
    diagnosticsBySourceId.set(sourceId, diagnostic);
    if (!username || !isValidAeternumPlayerStat({
      usernameLower,
      playerDigs: row.player_digs,
      serverTotal: row.total_digs,
      isFakePlayer: row.is_fake_player,
    })) continue;
    recordLiveServerTotal(diagnostic, totalDigs, latestUpdate);

    const resolvedUser = usersByUsername.get(usernameLower);
    const playerId = String(row.player_id ?? resolvedUser?.id ?? `scoreboard:${worldId}:${usernameLower}`);
    const blocksMined = toNumber(row.player_digs, 0);
    const bucket = rowsBySourceId.get(sourceId) ?? new Map<string, { playerId: string; username: string; blocksMined: number; lastUpdated: string }>();
    const existing = bucket.get(playerId);
    const incoming = {
      playerId,
      username: resolvedUser?.username ?? username,
      blocksMined,
      lastUpdated: row.latest_update,
    };
    if (shouldReplaceSourceRow(existing, incoming)) {
      bucket.set(playerId, {
        ...incoming,
      });
    }
    if (diagnostic.samplePlayerNames.length < 12) {
      diagnostic.samplePlayerNames.push(resolvedUser?.username ?? username);
    }
    rowsBySourceId.set(sourceId, bucket);
  }

  return new Map([...rowsBySourceId.entries()].map(([sourceId, rows]) => {
    const verifiedSourceTotal = selectLiveServerTotal(diagnosticsBySourceId.get(sourceId));
    const playerSum = [...rows.values()].reduce((sum, row) => sum + toNumber(row.blocksMined, 0), 0);
    return [sourceId, { rows, verifiedSourceTotal, playerSum }];
  }));
}

export async function loadApprovedLiveSources() {
  let result: { data: unknown[] | null; error: unknown | null };
  try {
    result = await supabaseAdmin
      .from("leaderboard_entries")
      .select("player_id,score,updated_at,source_id,sources!inner(id,slug,display_name,source_type,is_public,is_approved)")
      .eq("sources.is_public", true)
      .eq("sources.is_approved", true)
      .gt("score", 0)
      .limit(10_000);
  } catch {
    return [];
  }

  const { data, error } = result;
  if (error) {
    if (isMissingSupabaseTableError(error)) return [];
    return [];
  }

  const rows = (data ?? []) as LiveSourceEntryRow[];
  const playerIds = [...new Set(rows.map((row) => row.player_id).filter((value): value is string => Boolean(value)))];
  const usersById = await loadUsersForLiveRows(playerIds);
  const buckets = new Map<string, {
    source: LiveSourceMeta;
    rows: Map<string, LiveSourcePlayerRow>;
    verifiedSourceTotal?: number;
  }>();
  const sourceBySlug = new Map<string, LiveSourceMeta>();
  const sourceById = new Map<string, LiveSourceMeta>();

  for (const row of rows) {
    const source = Array.isArray(row.sources) ? row.sources[0] : row.sources;
    const sourceId = String(source?.id ?? row.source_id ?? "");
    const playerId = String(row.player_id ?? "");
    const player = usersById.get(playerId);
    const blocksMined = toNumber(row.score, 0);
    if (!source || !sourceId || !row.source_id) continue;
    const slug = String(source.slug ?? "").trim().toLowerCase();
    if (slug) {
      sourceBySlug.set(slug, source);
    }
    sourceById.set(sourceId, source);
    if (!player || blocksMined <= 0) continue;
    if (isPlaceholderLeaderboardUsername(String(player.username ?? "").trim().toLowerCase())) {
      continue;
    }

    const bucket = buckets.get(sourceId) ?? {
      source,
      rows: new Map<string, { playerId: string; username: string; blocksMined: number; lastUpdated: string }>(),
    };
    const playerKey = canonicalPlayerName(player.username) || playerId;
    const existing = bucket.rows.get(playerKey);
    if (!existing || blocksMined > existing.blocksMined || row.updated_at > existing.lastUpdated) {
      bucket.rows.set(playerKey, {
        playerId,
        username: player.username,
        blocksMined,
        lastUpdated: row.updated_at,
      });
    }
    buckets.set(sourceId, bucket);
  }

  try {
    const sourceResult = await supabaseAdmin
      .from("sources")
      .select("id,slug,display_name,source_type,is_public,is_approved")
      .eq("is_public", true)
      .eq("is_approved", true)
      .limit(1000);
    if (!sourceResult.error) {
      for (const source of (sourceResult.data ?? []) as LiveSourceMeta[]) {
        const sourceId = String(source.id ?? "");
        const slug = String(source.slug ?? "").trim().toLowerCase();
        if (!sourceId || !slug) continue;
        sourceById.set(sourceId, source);
        sourceBySlug.set(slug, source);
      }
    }
  } catch {
    // The joined leaderboard query above is still enough for already materialized sources.
  }

  const approvedWorldRows = await loadApprovedWorldRowsBySourceSlug(sourceBySlug);
  for (const [sourceId, sourceRowsForWorld] of approvedWorldRows.entries()) {
    const source = sourceById.get(sourceId);
    if (!source) continue;
    const bucket = buckets.get(sourceId) ?? {
      source,
      rows: new Map<string, LiveSourcePlayerRow>(),
    };
    mergeLiveSourceRows(bucket.rows, sourceRowsForWorld.rows);
    bucket.verifiedSourceTotal = sourceRowsForWorld.verifiedSourceTotal;
    const playerSum = [...bucket.rows.values()].reduce((sum, row) => sum + toNumber(row.blocksMined, 0), 0);
    if (sourceRowsForWorld.verifiedSourceTotal > 0 && sourceRowsForWorld.verifiedSourceTotal !== playerSum) {
      console.warn("[static-overrides] verified source total differs from player sum", {
        sourceId,
        sourceName: source.display_name ?? sourceId,
        verifiedSourceTotal: sourceRowsForWorld.verifiedSourceTotal,
        calculatedApprovedTotal: sourceRowsForWorld.verifiedSourceTotal,
        perPlayerSum: playerSum,
        affectedPlayerNames: [...bucket.rows.values()].slice(0, 12).map((row) => row.username),
      });
    }
    buckets.set(sourceId, bucket);
  }

  return [...buckets.values()].map(buildLiveSourcePayload);
}

function isServerSubmissionType(sourceType: string) {
  return isServerSourceType(sourceType);
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
      sourceType: normalizeSourceType(submission.source_type),
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
      const key = canonicalPlayerName(username);
      const existing = bucket.rows.get(key);
      if (!existing || row.blocksMined > existing.blocksMined || submission.created_at > existing.lastUpdated) {
        bucket.rows.set(key, {
          username: existing?.username || username,
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

function sourceSlugKey(source: JsonRecord | null | undefined) {
  return String(source?.slug ?? "").trim().toLowerCase();
}

function mergeSourceLeaderboardRows(baseRows: JsonRecord[], replacementRows: JsonRecord[]) {
  const rowsByPlayer = new Map<string, JsonRecord>();

  for (const row of [...baseRows, ...replacementRows]) {
    const username = String(row.username ?? "").trim();
    const playerId = String(row.playerId ?? "").trim();
    const key = canonicalPlayerName(username) || (playerId ? `player:${playerId}` : "");
    if (!key) continue;

    const existing = rowsByPlayer.get(key);
    if (!existing) {
      rowsByPlayer.set(key, row);
      continue;
    }

    if (shouldReplaceSourceRow(existing, row)) {
      rowsByPlayer.set(key, row);
    }
  }

  return rerankRows([...rowsByPlayer.values()]);
}

function mergeSourceReplacement(base: JsonRecord, replacement: JsonRecord): JsonRecord {
  const baseRows = sourceRows(base);
  const replacementRows = sourceRows(replacement);
  const useAuthoritativeReplacementRows = replacement.liveApprovedSource === true
    && replacement.authoritativeLiveSourceRows === true
    && replacementRows.length > 0;
  const mergedRows = baseRows.length || replacementRows.length
    ? useAuthoritativeReplacementRows
      ? rerankRows(replacementRows)
      : mergeSourceLeaderboardRows(baseRows, replacementRows)
    : null;
  const mergedRowTotal = mergedRows
    ? mergedRows.reduce((sum, row) => sum + toNumber(row.blocksMined, toNumber(row.totalDigs, 0)), 0)
    : 0;
  const liveReplacementTotal = replacement.liveApprovedSource === true
    ? toNumber(replacement.totalBlocks, 0)
    : 0;

  return {
    ...base,
    ...replacement,
    logoUrl: stringOrNull(replacement.logoUrl) ?? stringOrNull(base.logoUrl) ?? null,
    sourceScope: stringOrNull(replacement.sourceScope) ?? stringOrNull(base.sourceScope) ?? null,
    isDead: hasOwn(replacement, "isDead") ? replacement.isDead : base.isDead,
    ...(mergedRows ? {
      rows: mergedRows,
      playerCount: mergedRows.length,
      totalBlocks: replacement.liveApprovedSource === true && replacement.authoritativeLiveSourceRows === true
        ? (liveReplacementTotal > 0 ? liveReplacementTotal : mergedRowTotal)
        : Math.max(toNumber(base.totalBlocks, 0), toNumber(replacement.totalBlocks, 0), mergedRowTotal),
    } : {}),
  };
}

function mergeSourcesBySlug(sources: JsonRecord[]) {
  return sources.reduce<JsonRecord | null>((merged, source) =>
    merged ? mergeSourceReplacement(merged, source) : source,
  null);
}

function applySourceMetadataOverride<T extends JsonRecord>(source: T, overrides: OverrideMaps): T {
  const sourceId = String(source.id ?? "");
  const override = sourceId ? overrides.sources.get(sourceId) : null;
  if (!override) {
    return normalizeNarutakuSmpSource(source);
  }

  const displayName = stringOrNull(override.displayName);
  const logoUrl = hasOwn(override, "logoUrl") ? stringOrNull(override.logoUrl) : undefined;
  const totalBlocks = hasOwn(override, "totalBlocks") ? toNumber(override.totalBlocks, toNumber(source.totalBlocks, 0)) : undefined;

  return normalizeNarutakuSmpSource({
    ...source,
    ...(displayName ? { displayName } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    ...(totalBlocks !== undefined ? { totalBlocks } : {}),
  });
}

function allEffectiveSources(overrides: OverrideMaps) {
  const bySlug = new Map<string, JsonRecord>();
  const withoutSlug: JsonRecord[] = [];
  for (const source of allSnapshotSources) {
    const slug = sourceSlugKey(source);
    if (slug) {
      bySlug.set(slug, source);
    } else {
      withoutSlug.push(source);
    }
  }

  for (const source of overrides.submissionSources) {
    const slug = sourceSlugKey(source);
    if (!slug) {
      withoutSlug.push(source);
      continue;
    }
    const existing = bySlug.get(slug);
    bySlug.set(slug, existing ? mergeSourceReplacement(existing, source) : source);
  }

  return [...bySlug.values(), ...withoutSlug]
    .filter((source) => !isSourceOverrideHidden(overrides.sources.get(String(source.id ?? ""))))
    .map((source) => applySourceMetadataOverride(source, overrides));
}

function effectiveSourceById(overrides: OverrideMaps, sourceId: string) {
  if (isSourceOverrideHidden(overrides.sources.get(sourceId))) {
    return null;
  }

  const directSubmissionSource = overrides.submissionSources.find((source) =>
    String(source.id ?? source.slug ?? "") === sourceId
    && !isSourceOverrideHidden(overrides.sources.get(String(source.id ?? ""))),
  );
  if (directSubmissionSource) {
    const slug = sourceSlugKey(directSubmissionSource);
    const mergedSource = slug
      ? mergeSourcesBySlug(overrides.submissionSources.filter((source) =>
          sourceSlugKey(source) === slug
          && !isSourceOverrideHidden(overrides.sources.get(String(source.id ?? ""))),
        ))
      : directSubmissionSource;
    return mergedSource ? applySourceMetadataOverride(mergedSource, overrides) : null;
  }

  const snapshotSource = snapshotSourceById.get(sourceId);
  if (!snapshotSource) return null;

  const replacement = overrides.submissionSources.find((source) => {
    if (isSourceOverrideHidden(overrides.sources.get(String(source.id ?? "")))) return false;
    const slug = sourceSlugKey(source);
    return slug && slug === sourceSlugKey(snapshotSource);
  });

  return applySourceMetadataOverride(replacement ? mergeSourceReplacement(snapshotSource, replacement) : snapshotSource, overrides);
}

function applySourceOverride<T extends JsonRecord>(source: T | null | undefined, overrides: OverrideMaps) {
  if (!source) return source;
  const sourceId = String(source.id ?? "");
  const sourceWithMetadata = applySourceMetadataOverride(source, overrides);
  const totalBlocks = getEffectiveSourceTotal(sourceId, source, overrides);
  const statsSource = sourceId ? effectiveSourceById(overrides, sourceId) ?? sourceWithMetadata : sourceWithMetadata;
  const rows = effectiveVisibleSourceRows(sourceId, statsSource, overrides);
  const stats = getSourceStats(rows);
  const rowPatch = hasOwn(source, "rows")
    ? {
        rows: rerankRows(rows),
        playerCount: stats.playerCount,
      }
    : {};

  return {
    ...sourceWithMetadata,
    ...rowPatch,
    totalBlocks,
    playerCount: stats.playerCount,
    logoUrl: sourceWithMetadata.logoUrl ?? null,
  };
}

function rerankRows<T extends JsonRecord>(rows: T[]): Array<T & { rank: number }> {
  const sorted = [...rows].sort((left, right) => {
    const delta = toNumber(right.blocksMined, 0) - toNumber(left.blocksMined, 0);
    if (delta !== 0) return delta;
    return String(left.username ?? "").localeCompare(String(right.username ?? ""));
  });

  return sorted.map((row, index) => ({
    ...row,
    rank: index + 1,
  }) as T & { rank: number });
}

function uniqueCanonicalRowKey(row: JsonRecord) {
  return canonicalPlayerName(row.username);
}

function mergeCanonicalMainRows(rows: JsonRecord[], aggregates: ReturnType<typeof buildPlayerAggregates>) {
  const grouped = new Map<string, JsonRecord[]>();
  for (const row of rows) {
    const key = uniqueCanonicalRowKey(row);
    if (!key) continue;
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }

  const merged: JsonRecord[] = [];
  for (const row of rows) {
    const key = uniqueCanonicalRowKey(row);
    if (!key) {
      merged.push(row);
      continue;
    }

    const group = grouped.get(key) ?? [row];
    if (group[0] !== row) continue;
    if (group.length === 1) {
      merged.push(row);
      continue;
    }

    const aggregate = aggregates.get(key);
    const strongestRow = group.reduce((best, candidate) => {
      const delta = toNumber(candidate.blocksMined, 0) - toNumber(best.blocksMined, 0);
      if (delta !== 0) return delta > 0 ? candidate : best;
      return toNumber(candidate.sourceCount, 0) > toNumber(best.sourceCount, 0) ? candidate : best;
    }, group[0]);
    const aggregateBlocks = toNumber(aggregate?.totalBlocks, 0);
    const strongestBlocks = toNumber(strongestRow.blocksMined, 0);
    const blocksMined = aggregateBlocks > strongestBlocks ? aggregateBlocks : strongestBlocks;
    const username = String(strongestRow.username ?? aggregate?.username ?? row.username ?? "");

    merged.push({
      ...strongestRow,
      playerId: String(strongestRow.playerId ?? aggregate?.playerId ?? localPlayerId(username)),
      username,
      skinFaceUrl: skinFaceUrl(username),
      blocksMined,
      totalDigs: blocksMined,
      sourceCount: aggregateBlocks > strongestBlocks
        ? aggregate?.sourceCount ?? strongestRow.sourceCount
        : strongestRow.sourceCount,
      sourceServer: aggregateBlocks > strongestBlocks
        ? aggregate?.sourceServer ?? strongestRow.sourceServer
        : strongestRow.sourceServer,
      rowKey: `global:${key}`,
    });
  }

  return merged;
}

function localPlayerId(username: string) {
  const normalized = canonicalPlayerName(username);
  return normalized === "5hekel" ? "local-owner-player" : `local-player:${normalized}`;
}

function sourceRowPlayerId(row: JsonRecord, username: string) {
  return stringOrNull(row.playerId) ?? localPlayerId(username);
}

function sourceRows(source: JsonRecord | null | undefined): JsonRecord[] {
  return source && Array.isArray(source.rows) ? (source.rows as JsonRecord[]) : [];
}

function visibleSourceRows(source: JsonRecord | null | undefined): JsonRecord[] {
  return sourceRows(source).filter((row) =>
    !isPlaceholderLeaderboardUsername(String(row.username ?? "").trim().toLowerCase()),
  );
}

function findSourceRowForUsername(source: JsonRecord | null | undefined, username: string) {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return null;
  return visibleSourceRows(source).find((row) => String(row.username ?? "").trim().toLowerCase() === normalized) ?? null;
}

function getSourceRowOverride(overrides: OverrideMaps, sourceId: string, playerId: string, username?: string) {
  const normalizedUsername = String(username ?? "").trim().toLowerCase();
  return overrides.sourceRows.get(`${sourceId}:${playerId}`)
    ?? (normalizedUsername ? overrides.sourceRows.get(`${sourceId}:${localPlayerId(normalizedUsername)}`) : undefined);
}

function getSinglePlayerOverride(overrides: OverrideMaps, playerId: string, username?: string) {
  const normalizedUsername = canonicalPlayerName(username);
  return overrides.singlePlayers.get(playerId)
    ?? (normalizedUsername ? overrides.singlePlayers.get(`sheet:${normalizedUsername}`) ?? overrides.singlePlayers.get(localPlayerId(normalizedUsername)) : undefined);
}

function isSinglePlayerOverrideHidden(override: JsonRecord | null | undefined) {
  return override?.hidden === true || override?.deleted === true;
}

function isSinglePlayerHidden(overrides: OverrideMaps, playerId: string, username?: string) {
  return isSinglePlayerOverrideHidden(getSinglePlayerOverride(overrides, playerId, username));
}

function getPlayerRenameIndexes(overrides: OverrideMaps) {
  return buildPlayerRenameIndexes(overrides.singlePlayers);
}

function renamedPlayerName(overrides: OverrideMaps, playerId: string, username: string) {
  return resolveRenamedPlayerName(getPlayerRenameIndexes(overrides), playerId, username) || username;
}

function applyRenamedPlayerKeys(row: JsonRecord, source: JsonRecord | null | undefined, sourceId: string, playerId: string, username: string) {
  const sourceSlug = String(source?.slug ?? sourceId);
  return {
    ...row,
    playerId,
    username,
    skinFaceUrl: skinFaceUrl(username),
    sourceKey: hasOwn(row, "sourceKey") ? `${sourceSlug}:${username.toLowerCase()}` : row.sourceKey,
    rowKey: hasOwn(row, "rowKey") ? `${sourceSlug}:${username.toLowerCase()}` : row.rowKey,
  };
}

function isSourceRowHidden(override: JsonRecord | null | undefined) {
  return override?.hidden === true || Boolean(stringOrNull(override?.mergedIntoSourceId));
}

function isSourceOverrideHidden(override: JsonRecord | null | undefined) {
  return override?.hidden === true || override?.deleted === true;
}

function sourceRowOverrideKey(sourceId: string, playerId: string) {
  return `${sourceId}:${playerId}`;
}

function sourceRowPlayerIdFromOverrideKey(sourceId: string, overrideKey: string) {
  const prefix = `${sourceId}:`;
  return overrideKey.startsWith(prefix) ? overrideKey.slice(prefix.length) : "";
}

function usernameFromManualSourceRowOverride(playerId: string, override: JsonRecord | null | undefined) {
  return stringOrNull(override?.username)
    ?? playerId.replace(/^local-player:/, "").replace(/^sheet:/, "");
}

function manualAddedSourceRows(sourceId: string, source: JsonRecord | null | undefined, overrides: OverrideMaps, existingKeys: Set<string>, existingUsernames: Set<string>): JsonRecord[] {
  if (!sourceId) return [];
  const rows: JsonRecord[] = [];
  const renameIndexes = getPlayerRenameIndexes(overrides);
  for (const [overrideKey, override] of overrides.sourceRows.entries()) {
    if (!overrideKey.startsWith(`${sourceId}:`) || override.added !== true || isSourceRowHidden(override)) continue;
    if (existingKeys.has(overrideKey)) continue;
    const playerId = sourceRowPlayerIdFromOverrideKey(sourceId, overrideKey);
    const originalUsername = usernameFromManualSourceRowOverride(playerId, override).trim();
    const username = resolveRenamedPlayerName(renameIndexes, playerId, originalUsername) || originalUsername;
    if (!playerId || !username) continue;
    if (isSinglePlayerHidden(overrides, playerId, username)) continue;
    if (existingUsernames.has(username.toLowerCase())) continue;
    rows.push({
      playerId,
      username,
      skinFaceUrl: skinFaceUrl(username),
      playerFlagUrl: null,
      lastUpdated: stringOrNull(override.lastUpdated) ?? String(source?.createdAt ?? snapshot.generatedAt ?? ""),
      blocksMined: toNumber(override.blocksMined, 0),
      totalDigs: toNumber(override.blocksMined, 0),
      rank: 0,
      sourceServer: String(source?.displayName ?? ""),
      sourceKey: `${String(source?.slug ?? sourceId)}:${username.toLowerCase()}`,
      sourceCount: 1,
      viewKind: "source",
      sourceId,
      sourceSlug: String(source?.slug ?? ""),
      rowKey: `${String(source?.slug ?? sourceId)}:${username.toLowerCase()}`,
    });
  }
  return rows;
}

function effectiveVisibleSourceRows(sourceId: string, source: JsonRecord | null | undefined, overrides: OverrideMaps): JsonRecord[] {
  const existingKeys = new Set<string>();
  const existingUsernames = new Set<string>();
  const renameIndexes = getPlayerRenameIndexes(overrides);
  const rows: JsonRecord[] = visibleSourceRows(source).flatMap((row): JsonRecord[] => {
    const originalUsername = String(row.username ?? "");
    const playerId = sourceRowPlayerId(row, originalUsername);
    const username = resolveRenamedPlayerName(renameIndexes, playerId, originalUsername) || originalUsername;
    existingKeys.add(sourceRowOverrideKey(sourceId, playerId));
    if (username.trim()) {
      existingUsernames.add(username.trim().toLowerCase());
    }
    const override = sourceId ? getSourceRowOverride(overrides, sourceId, playerId, originalUsername) : null;
    if (isSinglePlayerHidden(overrides, playerId, username)) return [];
    if (isSourceRowHidden(override)) return [];
    return [applyRenamedPlayerKeys({
      ...row,
      username,
      blocksMined: toNumber(override?.blocksMined, toNumber(row.blocksMined, 0)),
    } as JsonRecord, source, sourceId, playerId, username)];
  });
  return [...rows, ...manualAddedSourceRows(sourceId, source, overrides, existingKeys, existingUsernames)];
}

function getEffectiveRowSourceName(source: JsonRecord | null | undefined, sourceId: string, rowOverride: JsonRecord | null | undefined, overrides: OverrideMaps, fallback: unknown) {
  const sourceOverride = sourceId ? overrides.sources.get(sourceId) : null;
  return stringOrNull(rowOverride?.sourceName)
    ?? stringOrNull(sourceOverride?.displayName)
    ?? String(source?.displayName ?? fallback ?? "Unknown Source");
}

function getEffectiveSourceTotal(sourceId: string, source: JsonRecord, overrides: OverrideMaps) {
  const snapshotSource = effectiveSourceById(overrides, sourceId) ?? source;
  const rawRows = visibleSourceRows(snapshotSource);
  const rows = effectiveVisibleSourceRows(sourceId, snapshotSource, overrides);
  const hasRowOverride = rawRows.some((row) =>
    Boolean(getSourceRowOverride(overrides, sourceId, sourceRowPlayerId(row, String(row.username ?? "")), String(row.username ?? ""))),
  ) || rows.length !== rawRows.length;
  if (hasRowOverride) {
    return getSourceStats(rows).rowTotalBlocks;
  }

  const sourceOverride = overrides.sources.get(sourceId);
  if (hasOwn(sourceOverride, "totalBlocks")) {
    return toNumber(sourceOverride?.totalBlocks, toNumber(source.totalBlocks, 0));
  }
  return getSourceStats(snapshotSource ?? source).totalBlocks;
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
    for (const row of effectiveVisibleSourceRows(sourceId, source, overrides)) {
      const username = String(row.username ?? "").trim();
      if (!username) continue;
      const key = username.toLowerCase();
      const playerId = sourceRowPlayerId(row, username);
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
        hasSourceRowOverride: Boolean(existing?.hasSourceRowOverride || override || String(sourceId).startsWith("submission:") || source.liveApprovedSource === true),
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
  const rows = effectiveVisibleSourceRows(sourceId, source, overrides).map((row) => {
    const rowUsername = String(row.username ?? "");
    return {
      username: rowUsername,
      playerId: sourceRowPlayerId(row, rowUsername),
      blocksMined: toNumber(row.blocksMined, 0),
    };
  });
  const ranked = rerankRows(rows as JsonRecord[]) as JsonRecord[];
  const normalizedUsername = username.trim().toLowerCase();
  const match = ranked.find((row) =>
    String(row.playerId ?? "") === playerId || String(row.username ?? "").toLowerCase() === normalizedUsername,
  );
  return match ? Number(match.rank ?? 0) : null;
}

function isSingleplayerSpecialKind(kind: string) {
  return kind === "ssp" || kind === "hsp" || kind === "ssp-hsp";
}

function sourceMatchesSpecialKind(source: JsonRecord, kind: string) {
  if (kind === "ssp") return isSspSource(source);
  if (kind === "hsp") return isHspSource(source);
  return isSspHspSource(source);
}

function getSsphspSplitEntries(username: string, overrides?: OverrideMaps, kind = "ssp-hsp") {
  const slug = username.trim().toLowerCase();
  const submittedSources = overrides?.submissionSources.filter((source) => {
    const sourceId = String(source.id ?? "");
    return sourceMatchesSpecialKind(source, kind) && !isSourceOverrideHidden(overrides.sources.get(sourceId));
  }) ?? [];
  return [...getStaticSpecialSources(kind), ...submittedSources].flatMap((source) => {
    const sourceId = String(source.id ?? "");
    if (overrides && isSourceOverrideHidden(overrides.sources.get(sourceId))) return [];
    const row = overrides
      ? effectiveVisibleSourceRows(sourceId, source, overrides).find((entry) => String(entry.username ?? "").toLowerCase() === slug)
      : visibleSourceRows(source).find((entry) => String(entry.username ?? "").toLowerCase() === slug);
    return row ? [{ source, row }] : [];
  });
}

function applySsphspAggregateOverrides(rows: unknown, overrides: OverrideMaps, kind = "ssp-hsp") {
  if (!Array.isArray(rows)) {
    return [];
  }

  const renameIndexes = getPlayerRenameIndexes(overrides);
  const seenUsernames = new Set<string>();
  const mapped = rows.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const record = row as JsonRecord;
    const originalUsername = String(record.username ?? "");
    const recordPlayerId = String(record.playerId ?? localPlayerId(originalUsername));
    const username = resolveRenamedPlayerName(renameIndexes, recordPlayerId, originalUsername) || originalUsername;
    if (isSinglePlayerHidden(overrides, recordPlayerId, username)) return [];
    if (username) seenUsernames.add(username.toLowerCase());
    const entries = getSsphspSplitEntries(username, overrides, kind);
    if (entries.length === 0) {
      return [{
        ...record,
        playerId: recordPlayerId,
        username,
        skinFaceUrl: skinFaceUrl(username),
      }];
    }

    const playerId = recordPlayerId || localPlayerId(username);
    const effectiveEntries = entries.filter((entry) => {
      const sourceId = String(entry.source.id ?? "");
      const rowUsername = String(entry.row.username ?? username);
      const rowPlayerId = sourceRowPlayerId(entry.row, rowUsername);
      const override = getSourceRowOverride(overrides, sourceId, rowPlayerId, rowUsername);
      return !isSourceRowHidden(override);
    });
    const blocksMined = effectiveEntries.reduce((sum, entry) => {
      const sourceId = String(entry.source.id ?? "");
      const rowUsername = String(entry.row.username ?? username);
      const rowPlayerId = sourceRowPlayerId(entry.row, rowUsername);
      const override = getSourceRowOverride(overrides, sourceId, rowPlayerId, rowUsername);
      return sum + toNumber(override?.blocksMined, toNumber(entry.row.blocksMined, 0));
    }, 0);

    const singlePlayerOverride = overrides.singlePlayers.get(String(record.playerId ?? ""))
      ?? overrides.singlePlayers.get(`sheet:${username.toLowerCase()}`)
      ?? overrides.singlePlayers.get(playerId);

    return [{
      ...record,
      playerId,
      username,
      skinFaceUrl: skinFaceUrl(username),
      blocksMined,
      totalDigs: blocksMined,
      sourceCount: effectiveEntries.length,
      playerFlagUrl: hasOwn(singlePlayerOverride, "flagUrl")
        ? stringOrNull(singlePlayerOverride?.flagUrl)
        : record.playerFlagUrl ?? null,
    }];
  }) as JsonRecord[];

  for (const source of overrides.submissionSources) {
    if (isSourceOverrideHidden(overrides.sources.get(String(source.id ?? "")))) continue;
    if (!sourceMatchesSpecialKind(source, kind)) continue;
    const sourceId = String(source.id ?? "");
    for (const row of effectiveVisibleSourceRows(sourceId, source, overrides)) {
      const username = String(row.username ?? "");
      if (!username || seenUsernames.has(username.toLowerCase())) continue;
      if (isSinglePlayerHidden(overrides, sourceRowPlayerId(row, username), username)) continue;
      const entries = getSsphspSplitEntries(username, overrides, kind);
      const blocksMined = entries.reduce((sum, entry) => sum + toNumber(entry.row.blocksMined, 0), 0);
      mapped.push({
        playerId: sourceRowPlayerId(row, username),
        username,
        skinFaceUrl: skinFaceUrl(username),
        playerFlagUrl: null,
        lastUpdated: String(row.lastUpdated ?? source.createdAt ?? snapshot.generatedAt ?? ""),
        blocksMined,
        totalDigs: blocksMined,
        rank: 0,
        sourceServer: String(source.displayName ?? ""),
        sourceKey: `submitted:${kind}:${username.toLowerCase()}`,
        sourceCount: entries.length,
        viewKind: "global",
        sourceId: String(source.id ?? ""),
        sourceSlug: String(source.slug ?? ""),
        rowKey: `submitted:${kind}:${username.toLowerCase()}`,
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

  const source = sourceId ? effectiveSourceById(overrides, sourceId) : null;
  if (sourceId && source) {
    return rerankRows(effectiveVisibleSourceRows(sourceId, source, overrides).map((row) => {
      const username = String(row.username ?? "");
      const playerId = sourceRowPlayerId(row, username);
      const sourceRowOverride = getSourceRowOverride(overrides, sourceId, playerId, username);
      const playerOverride = getSinglePlayerOverride(overrides, playerId, username);
      const flagOverride = hasOwn(sourceRowOverride, "flagUrl") ? sourceRowOverride : playerOverride;
      const blocksMined = toNumber(row.blocksMined, 0);
      return {
        ...row,
        playerId,
        username,
        skinFaceUrl: skinFaceUrl(username),
        sourceServer: getEffectiveRowSourceName(source, sourceId, sourceRowOverride, overrides, row.sourceServer),
        blocksMined,
        totalDigs: blocksMined,
        playerFlagUrl: hasOwn(flagOverride, "flagUrl") ? stringOrNull(flagOverride?.flagUrl) : row.playerFlagUrl ?? null,
      };
    }) as JsonRecord[]);
  }

  const mapped = rows.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const record = row as JsonRecord;
    const originalUsername = String(record.username ?? "");
    const playerId = String(record.playerId ?? localPlayerId(originalUsername));
    const username = renamedPlayerName(overrides, playerId, originalUsername);
    const effectiveSourceId = sourceId ?? String(record.sourceId ?? "");
    const sourceOverride = effectiveSourceId ? overrides.sources.get(effectiveSourceId) : null;
    const sourceRowOverride = sourceId ? getSourceRowOverride(overrides, effectiveSourceId, playerId, originalUsername) : null;
    if (isSourceRowHidden(sourceRowOverride)) return [];
    const playerOverride = getSinglePlayerOverride(overrides, playerId, originalUsername);
    const blocksOverride = sourceRowOverride ?? (sourceId ? null : playerOverride);
    const flagOverride = hasOwn(sourceRowOverride, "flagUrl") ? sourceRowOverride : playerOverride;
    const nextRank = sourceId && sourceRowOverride ? rankForSourcePlayer(effectiveSourceId, playerId, username, overrides) : null;
    const usernameChanged = username !== originalUsername;
    if (!blocksOverride && !flagOverride && !sourceOverride && !usernameChanged) return record;

    return [{
      ...record,
      playerId,
      username,
      skinFaceUrl: skinFaceUrl(username),
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
  const renameIndexes = getPlayerRenameIndexes(overrides);
  const seenUsernames = new Set<string>();
  const mapped = rows.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const record = row as JsonRecord;
    const originalUsername = String(record.username ?? "");
    const playerId = String(record.playerId ?? localPlayerId(originalUsername));
    const username = resolveRenamedPlayerName(renameIndexes, playerId, originalUsername) || originalUsername;
    if (isSinglePlayerHidden(overrides, playerId, username)) return [];
    if (username) seenUsernames.add(username.toLowerCase());
    const aggregate = aggregates.get(username.toLowerCase()) ?? aggregates.get(originalUsername.toLowerCase());
    const playerOverride = getSinglePlayerOverride(overrides, playerId, originalUsername);
    const useAggregate = Boolean(aggregate?.hasSourceRowOverride);
    const blocksMined = useAggregate
      ? toNumber(aggregate?.totalBlocks, toNumber(record.blocksMined, 0))
      : playerOverride
        ? toNumber(playerOverride.blocksMined, toNumber(record.blocksMined, 0))
        : toNumber(record.blocksMined, 0);

    return [{
      ...record,
      playerId,
      username,
      skinFaceUrl: skinFaceUrl(username),
      blocksMined,
      totalDigs: blocksMined,
      sourceCount: useAggregate ? aggregate?.sourceCount ?? record.sourceCount : record.sourceCount,
      sourceServer: useAggregate ? aggregate?.sourceServer ?? record.sourceServer : record.sourceServer,
      playerFlagUrl: hasOwn(playerOverride, "flagUrl") ? stringOrNull(playerOverride?.flagUrl) : record.playerFlagUrl ?? null,
    }];
  }) as JsonRecord[];

  for (const aggregate of aggregates.values()) {
    if (seenUsernames.has(aggregate.username.toLowerCase())) continue;
    if (isSinglePlayerHidden(overrides, aggregate.playerId, aggregate.username)) continue;
    mapped.push({
      playerId: aggregate.playerId,
      username: aggregate.username,
      skinFaceUrl: skinFaceUrl(aggregate.username),
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

  return rerankRows(mergeCanonicalMainRows(mapped, aggregates));
}

function findEffectiveMainLeaderboardRow(overrides: OverrideMaps, username: string, playerId?: string) {
  const normalizedUsername = canonicalPlayerName(username);
  const rankedRows = applyMainRowOverrides(getStaticMainLeaderboardRows(), overrides);
  const effectiveRow = rankedRows.find((row) => {
    const rowPlayerId = String(row.playerId ?? "");
    return Boolean(playerId && rowPlayerId === playerId) || canonicalPlayerName(row.username) === normalizedUsername;
  });
  return effectiveRow ?? findStaticMainLeaderboardRowForPlayer(username, playerId) ?? null;
}

function shouldUseFastLiveSourceSummary(existing: JsonRecord | undefined, live: JsonRecord) {
  if (!existing) return true;
  if (live.authoritativeLiveSourceRows === true) return true;
  const slug = sourceSlugKey(live);
  const snapshotSource = slug ? snapshotSourceBySlug.get(slug) : null;
  const snapshotRowCount = snapshotSource ? visibleSourceRows(snapshotSource).length : 0;
  const existingPlayerCount = Math.max(snapshotRowCount, toNumber(existing.playerCount, 0));
  return toNumber(live.playerCount, 0) >= existingPlayerCount && toNumber(live.totalBlocks, 0) > 0;
}

async function loadFastApprovedLiveSourceSummaries() {
  if (!process.env.VITE_SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return [];
  }

  let entryResult: { data: unknown[] | null; error: unknown | null };
  let scoreboardResult: { data: unknown[] | null; error: unknown | null };
  try {
    [entryResult, scoreboardResult] = await Promise.all([
      supabaseAdmin
        .from("leaderboard_entries")
        .select("player_id,score,updated_at,source_id,sources!inner(id,slug,display_name,source_type,is_public,is_approved)")
        .eq("sources.is_public", true)
        .eq("sources.is_approved", true)
        .gt("score", 0)
        .limit(20_000),
      supabaseAdmin
        .from("aeternum_player_stats")
        .select("source_world_id,server_name,player_id,username,username_lower,player_digs,total_digs,latest_update,is_fake_player")
        .eq("is_fake_player", false)
        .limit(20_000),
    ]);
  } catch {
    return [];
  }

  if (entryResult.error) {
    return [];
  }

  const scoreboardBySlug = new Map<string, ReturnType<typeof liveRowsFromScoreboardStats>>();
  if (!scoreboardResult.error) {
    const groupedStats = new Map<string, AeternumLiveRow[]>();
    for (const row of (scoreboardResult.data ?? []) as AeternumLiveRow[]) {
      const serverName = stringOrNull(row.server_name);
      if (!serverName) continue;
      const slug = buildSourceSlug({ displayName: serverName });
      const rows = groupedStats.get(slug) ?? [];
      rows.push(row);
      groupedStats.set(slug, rows);
    }
    for (const [slug, rows] of groupedStats.entries()) {
      const summary = liveRowsFromScoreboardStats(rows);
      if (summary.rows.length > 0) {
        scoreboardBySlug.set(slug, summary);
      }
    }
  }

  const buckets = new Map<string, {
    source: LiveSourceMeta;
    rowsByPlayer: Map<string, { blocksMined: number; updatedAt: string }>;
  }>();

  for (const row of (entryResult.data ?? []) as LiveSourceSummaryEntryRow[]) {
    const source = Array.isArray(row.sources) ? row.sources[0] : row.sources;
    const sourceId = String(source?.id ?? row.source_id ?? "");
    const playerId = String(row.player_id ?? "");
    const blocksMined = toNumber(row.score, 0);
    if (!source || !sourceId || !playerId || blocksMined <= 0) continue;
    const bucket = buckets.get(sourceId) ?? {
      source,
      rowsByPlayer: new Map<string, { blocksMined: number; updatedAt: string }>(),
    };
    const existing = bucket.rowsByPlayer.get(playerId);
    if (!existing || shouldReplaceSourceRow(
      { blocksMined: existing.blocksMined, lastUpdated: existing.updatedAt },
      { blocksMined, lastUpdated: row.updated_at },
    )) {
      bucket.rowsByPlayer.set(playerId, { blocksMined, updatedAt: row.updated_at });
    }
    buckets.set(sourceId, bucket);
  }

  return [...buckets.values()].map((bucket) => {
    const slug = String(bucket.source.slug ?? "").trim().toLowerCase();
    const snapshotSource = snapshotSourceBySlug.get(slug);
    const scoreboard = scoreboardBySlug.get(slug);
    const rowTotal = [...bucket.rowsByPlayer.values()].reduce((sum, row) => sum + row.blocksMined, 0);
    const totalBlocks = scoreboard?.authoritative && scoreboard.verifiedSourceTotal > 0
      ? scoreboard.verifiedSourceTotal
      : rowTotal;
    const playerCount = scoreboard?.authoritative
      ? scoreboard.rows.length
      : bucket.rowsByPlayer.size;
    return {
      id: bucket.source.id,
      slug,
      displayName: bucket.source.display_name,
      sourceType: normalizeSourceType(bucket.source.source_type),
      logoUrl: stringOrNull(snapshotSource?.logoUrl) ?? null,
      totalBlocks,
      isDead: Boolean(snapshotSource?.isDead ?? false),
      playerCount,
      sourceScope: stringOrNull(snapshotSource?.sourceScope) ?? submissionSourceScope(bucket.source.source_type),
      hasSpreadsheetTotal: false,
      liveApprovedSource: true,
      authoritativeLiveSourceRows: Boolean(scoreboard?.authoritative),
      replacesStaticSourceId: snapshotSource ? String(snapshotSource.id ?? "") : null,
    } satisfies JsonRecord;
  });
}

export async function applyFastApprovedLiveSourceSummariesToSources<T extends JsonRecord>(sources: T[]) {
  const liveSources = await loadFastApprovedLiveSourceSummaries();
  if (liveSources.length === 0) {
    return sources;
  }

  const bySlug = new Map<string, JsonRecord>();
  const withoutSlug: JsonRecord[] = [];
  for (const source of sources) {
    const slug = sourceSlugKey(source);
    if (slug) {
      bySlug.set(slug, source);
    } else {
      withoutSlug.push(source);
    }
  }

  for (const liveSource of liveSources) {
    const slug = sourceSlugKey(liveSource);
    if (!slug) {
      withoutSlug.push(liveSource);
      continue;
    }
    const existing = bySlug.get(slug);
    if (shouldUseFastLiveSourceSummary(existing, liveSource)) {
      bySlug.set(slug, existing ? { ...existing, ...liveSource } : liveSource);
    }
  }

  return [...bySlug.values(), ...withoutSlug] as T[];
}

export async function applyStaticManualOverridesToSources<T extends JsonRecord>(sources: T[]) {
  const overrides = await loadStaticManualOverrides({ includeFlagMetadata: false });
  const bySlug = new Map<string, T>();
  const withoutSlug: T[] = [];

  for (const source of sources) {
    if (isSourceOverrideHidden(overrides.sources.get(String(source.id ?? "")))) continue;
    const mapped = applySourceOverride(source, overrides) as T;
    const slug = sourceSlugKey(mapped);
    if (slug) {
      bySlug.set(slug, mapped);
    } else {
      withoutSlug.push(mapped);
    }
  }

  for (const source of overrides.submissionSources) {
    if (isSourceOverrideHidden(overrides.sources.get(String(source.id ?? "")))) continue;
    const mapped = applySourceOverride(source, overrides) as T;
    const slug = sourceSlugKey(mapped);
    if (!slug) {
      withoutSlug.push(mapped);
      continue;
    }
    const existing = bySlug.get(slug);
    bySlug.set(slug, existing ? mergeSourceReplacement(existing, mapped) as unknown as T : mapped);
  }

  for (const source of allEffectiveSources(overrides)) {
    if (!isNarutakuSmpLabel(source.displayName ?? source.name ?? "")) continue;
    if (isSourceOverrideHidden(overrides.sources.get(String(source.id ?? "")))) continue;
    const mapped = applySourceOverride(source, overrides) as unknown as T;
    const slug = sourceSlugKey(mapped);
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, mapped);
  }

  return [...bySlug.values(), ...withoutSlug]
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

function getRequestedLeaderboardPage(url: URL | undefined, fallback: unknown) {
  if (!url) {
    return Math.max(1, Math.floor(Number(fallback ?? "1")) || 1);
  }
  return Math.max(1, Math.floor(Number(url.searchParams.get("page") ?? String(fallback ?? "1"))) || 1);
}

function getRequestedLeaderboardPageSize(url: URL | undefined, fallback: unknown, rowsLength: number) {
  if (!url) {
    return Math.min(100, Math.max(1, Math.floor(Number(fallback ?? (rowsLength || 30))) || 30));
  }
  return Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get("pageSize") ?? String(fallback ?? (rowsLength || 30)))) || 30));
}

function applyLeaderboardRequestFilters(rows: JsonRecord[], filters: NonNullable<ReturnType<typeof getActiveLeaderboardRequestFilters>>) {
  return rows.filter((row) =>
    toNumber(row.blocksMined, 0) >= filters.minBlocks
    && (!filters.query || String(row.username ?? "").toLowerCase().includes(filters.query)),
  );
}

export async function applyStaticManualOverridesToLeaderboardResponse<T extends JsonRecord | null>(payload: T, url?: URL): Promise<T> {
  if (!payload) return payload;
  const overrides = await loadStaticManualOverrides({ includeFlagMetadata: false });
  const source = applySourceOverride(payload.source as JsonRecord | null, overrides);
  const sourceId = source ? String(source.id ?? "") : null;
  const specialKind = String(payload.kind ?? "");
  const isSsphspLeaderboard = isSingleplayerSpecialKind(specialKind);
  const isMainLeaderboard = !sourceId && !isSsphspLeaderboard;
  const requestedSourceSlug = !isMainLeaderboard && !isSsphspLeaderboard
    ? String(url?.searchParams.get("source") ?? source?.slug ?? "").trim()
    : "";
  const fullStaticSourceRows = requestedSourceSlug ? getStaticSourceLeaderboardRows(requestedSourceSlug) : null;
  const baseRows = isMainLeaderboard
    ? getStaticMainLeaderboardRows()
    : isSsphspLeaderboard
      ? getStaticSpecialLeaderboardRows(specialKind)
    : sourceId && fullStaticSourceRows
      ? fullStaticSourceRows
      : payload.rows;
  let rows = (isSsphspLeaderboard
    ? applySsphspAggregateOverrides(baseRows, overrides, specialKind)
    : isMainLeaderboard
      ? applyMainRowOverrides(baseRows, overrides)
    : applyRowOverrides(baseRows, sourceId, overrides)) as JsonRecord[];
  const unfilteredRows = rows;
  const requestFilters = getActiveLeaderboardRequestFilters(url);
  const filteredRows = requestFilters ? applyLeaderboardRequestFilters(rows, requestFilters) : rows;
  const resolvedPageSize = requestFilters
    ? requestFilters.pageSize
    : getRequestedLeaderboardPageSize(url, payload.pageSize, rows.length);
  const unpaginatedTotalRows = requestFilters
    ? filteredRows.length
    : filteredRows.length;
  const resolvedTotalPages = Math.max(1, Math.ceil(unpaginatedTotalRows / resolvedPageSize));
  const requestedPage = requestFilters ? requestFilters.page : getRequestedLeaderboardPage(url, payload.page);
  const resolvedPage = Math.min(requestedPage, resolvedTotalPages);
  rows = filteredRows.slice((resolvedPage - 1) * resolvedPageSize, resolvedPage * resolvedPageSize);
  const featuredRows = (isSsphspLeaderboard
    ? applySsphspAggregateOverrides(payload.featuredRows, overrides, specialKind)
    : isMainLeaderboard
      ? applyMainRowOverrides(payload.featuredRows, overrides)
    : applyRowOverrides(payload.featuredRows, sourceId, overrides)).slice(0, 3);
  const totalBlocks = sourceId
    ? requestFilters ? getSourceStats(filteredRows).rowTotalBlocks : getEffectiveSourceTotal(sourceId, source as JsonRecord, overrides)
    : filteredRows.reduce((sum, row) => sum + toNumber(row.blocksMined, 0), 0);
  const playerCount = sourceId
    ? getSourceStats(requestFilters ? filteredRows : unfilteredRows).playerCount
    : filteredRows.length;
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
    playerCount,
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
    const preferredMetadata = shouldPreferMergedServerRow(row, existing) ? row : existing;
    merged.set(normalized, {
      ...preferredMetadata,
      [blocksKey]: toNumber(existing[blocksKey], 0) + toNumber(row[blocksKey], 0),
      rank: Math.min(toNumber(existing.rank, Number.MAX_SAFE_INTEGER), toNumber(row.rank, Number.MAX_SAFE_INTEGER)),
    });
  }
  return [...merged.values()].sort((left, right) => toNumber(right[blocksKey], 0) - toNumber(left[blocksKey], 0));
}

function shouldPreferMergedServerRow(candidate: JsonRecord, current: JsonRecord) {
  const candidateIsServer = Boolean(stringOrNull(candidate.sourceSlug)) && shouldShowInPrivateServerDigs(candidate);
  const currentIsServer = Boolean(stringOrNull(current.sourceSlug)) && shouldShowInPrivateServerDigs(current);
  if (candidateIsServer !== currentIsServer) return candidateIsServer;

  const candidateHasSlug = Boolean(stringOrNull(candidate.sourceSlug));
  const currentHasSlug = Boolean(stringOrNull(current.sourceSlug));
  if (candidateHasSlug !== currentHasSlug) return candidateHasSlug;

  return false;
}

export async function applyStaticManualOverridesToPlayerDetail<T extends JsonRecord | null>(payload: T): Promise<T> {
  if (!payload) return payload;
  const overrides = await loadStaticManualOverrides({ includeFlagMetadata: false });
  const originalName = String(payload.name ?? "");
  const playerId = String(payload.playerId ?? `sheet:${canonicalPlayerName(originalName)}`);
  const activeName = renamedPlayerName(overrides, playerId, originalName);
  const override = getSinglePlayerOverride(overrides, playerId, originalName);
  if (isSinglePlayerOverrideHidden(override) || isSinglePlayerHidden(overrides, playerId, activeName)) {
    return null as T;
  }
  let hasServerOverride = false;
  const servers = Array.isArray(payload.servers)
    ? payload.servers.flatMap((server) => {
        const record = server as JsonRecord;
        const sourceId = String(record.sourceId ?? "");
        const rowPlayerId = String(record.playerId ?? "");
        const source = effectiveSourceById(overrides, sourceId);
        const sourceLookupId = String(source?.id ?? sourceId);
        const effectiveRow = source
          ? effectiveVisibleSourceRows(sourceLookupId, source, overrides).find((row) => String(row.username ?? "").toLowerCase() === activeName.toLowerCase())
          : null;
        const sourceRowOverride = sourceId && rowPlayerId ? getSourceRowOverride(overrides, sourceId, rowPlayerId, originalName) : null;
        if (isSourceRowHidden(sourceRowOverride)) return [];
        if (sourceRowOverride || effectiveRow) {
          hasServerOverride = true;
        }
        const blocks = effectiveRow
          ? toNumber(effectiveRow.blocksMined, toNumber(record.blocks, 0))
          : sourceRowOverride
            ? toNumber(sourceRowOverride.blocksMined, toNumber(record.blocks, 0))
            : record.blocks;
        const effectivePlayerId = String(effectiveRow?.playerId ?? rowPlayerId);
        const rank = effectiveRow
          ? rankForSourcePlayer(sourceLookupId, effectivePlayerId, activeName, overrides) ?? toNumber(effectiveRow.rank, toNumber(record.rank, 0))
          : sourceRowOverride
            ? rankForSourcePlayer(sourceId, rowPlayerId, activeName, overrides) ?? record.rank
            : record.rank;
        return [normalizeNarutakuSmpProfileRow({
          ...record,
          sourceId: String(source?.id ?? sourceId),
          sourceSlug: String(source?.slug ?? record.sourceSlug ?? ""),
          playerId: effectivePlayerId,
          server: getEffectiveRowSourceName(source, sourceId, sourceRowOverride, overrides, record.server),
          logoUrl: stringOrNull(source?.logoUrl) ?? stringOrNull(record.logoUrl) ?? null,
          sourceType: String(source?.sourceType ?? record.sourceType ?? ""),
          sourceCategory: String(source?.sourceCategory ?? record.sourceCategory ?? ""),
          sourceScope: String(source?.sourceScope ?? record.sourceScope ?? ""),
          blocks,
          rank,
        })];
      })
    : payload.servers;
  const existingServerKeys = new Set(
    Array.isArray(servers)
      ? servers.map((server) => normalizeName((server as JsonRecord).server))
      : [],
  );
  if (Array.isArray(servers)) {
    for (const rawSource of allEffectiveSources(overrides)) {
      const source = applySourceMetadataOverride(rawSource, overrides);
      const sourceId = String(source.id ?? "");
      for (const row of effectiveVisibleSourceRows(sourceId, source, overrides)) {
        if (String(row.username ?? "").toLowerCase() !== activeName.toLowerCase()) continue;
        const serverName = String(source.displayName ?? "");
        if (existingServerKeys.has(normalizeName(serverName))) continue;
        servers.push(normalizeNarutakuSmpProfileRow({
          sourceId: String(source.id ?? ""),
          sourceSlug: String(source.slug ?? ""),
          playerId: sourceRowPlayerId(row, String(row.username ?? "")),
          server: serverName,
          logoUrl: stringOrNull(source.logoUrl) ?? null,
          sourceType: String(source.sourceType ?? ""),
          sourceCategory: String(source.sourceCategory ?? ""),
          sourceScope: String(source.sourceScope ?? ""),
          blocks: toNumber(row.blocksMined, 0),
          rank: rankForSourcePlayer(String(source.id ?? ""), sourceRowPlayerId(row, String(row.username ?? "")), String(row.username ?? ""), overrides) ?? Number(row.rank ?? 0),
          joined: "2026",
        }));
        hasServerOverride = true;
        existingServerKeys.add(normalizeName(serverName));
      }
    }
  }
  const mergedServers = Array.isArray(servers) ? mergeServerRows(servers, "server", "blocks") : servers;
  const isNarutakuSmpPlayer = narutakuSmpPlayerNames(overrides).has(canonicalPlayerName(activeName));
  const profileServerFilter = Array.isArray(mergedServers)
    ? removeNarutakuUnlabeledProfileWorlds(mergedServers, isNarutakuSmpPlayer)
    : { rows: mergedServers, removed: false };
  const profileServers = profileServerFilter.rows;
  const serverTotal = Array.isArray(profileServers)
    ? profileServers.reduce((sum, server) => sum + toNumber((server as JsonRecord).blocks, 0), 0)
    : toNumber(payload.blocksNum, 0);
  const currentBlocksNum = hasServerOverride || profileServerFilter.removed
    ? serverTotal
    : override
      ? toNumber(override.blocksMined, toNumber(payload.blocksNum, 0))
      : toNumber(payload.blocksNum, 0);
  const mainLeaderboardRow = findEffectiveMainLeaderboardRow(overrides, activeName, playerId);
  const leaderboardBlocksNum = mainLeaderboardRow && !profileServerFilter.removed
    ? toNumber(mainLeaderboardRow.blocksMined, currentBlocksNum)
    : currentBlocksNum;

  return {
    ...payload,
    rank: mainLeaderboardRow ? toNumber(mainLeaderboardRow.rank, toNumber(payload.rank, 0)) : payload.rank,
    name: activeName,
    slug: activeName.toLowerCase(),
    avatarUrl: fullBodyUrl(activeName),
    blocksNum: leaderboardBlocksNum,
    places: Array.isArray(profileServers) ? profileServers.length : payload.places,
    servers: profileServers,
  };
}

export async function applyStaticManualOverridesToDashboardPlayerData<T extends JsonRecord | null>(payload: T): Promise<T> {
  if (!payload) return payload;
  const overrides = await loadStaticManualOverrides();
  const originalUsername = String(payload.username ?? "");
  const playerId = String(payload.playerId ?? localPlayerId(originalUsername));
  const username = renamedPlayerName(overrides, playerId, originalUsername);
  const override = getSinglePlayerOverride(overrides, playerId, originalUsername);
  if (isSinglePlayerOverrideHidden(override) || isSinglePlayerHidden(overrides, playerId, username)) {
    return null as T;
  }
  let hasServerOverride = false;
  const servers = Array.isArray(payload.servers)
    ? payload.servers.flatMap((server) => {
        const record = server as JsonRecord;
        const sourceId = String(record.id ?? "");
        const source = effectiveSourceById(overrides, sourceId);
        const sourceLookupId = String(source?.id ?? sourceId);
        const effectiveRow = source
          ? effectiveVisibleSourceRows(sourceLookupId, source, overrides).find((row) => String(row.username ?? "").toLowerCase() === username.toLowerCase())
          : null;
        const rowOverride = sourceId ? getSourceRowOverride(overrides, sourceId, playerId, originalUsername) : null;
        if (isSourceRowHidden(rowOverride)) return [];
        if (rowOverride || effectiveRow) {
          hasServerOverride = true;
        }
        const totalBlocks = effectiveRow
          ? toNumber(effectiveRow.blocksMined, toNumber(record.totalBlocks, 0))
          : rowOverride
            ? toNumber(rowOverride.blocksMined, toNumber(record.totalBlocks, 0))
            : record.totalBlocks;
        const effectiveSourceId = sourceLookupId;
        const effectivePlayerId = String(effectiveRow?.playerId ?? playerId);
        return [{
          ...record,
          id: effectiveSourceId,
          playerId: effectivePlayerId,
          displayName: getEffectiveRowSourceName(source, sourceId, rowOverride, overrides, record.displayName),
          totalBlocks,
          rank: effectiveRow
            ? rankForSourcePlayer(effectiveSourceId, effectivePlayerId, username, overrides) ?? toNumber(effectiveRow.rank, toNumber(record.rank, 0))
            : rowOverride
              ? rankForSourcePlayer(sourceId, playerId, username, overrides) ?? record.rank
              : record.rank,
        }];
      })
    : payload.servers;
  const existingServerKeys = new Set(
    Array.isArray(servers)
      ? servers.map((server) => normalizeName((server as JsonRecord).displayName))
      : [],
  );
  if (Array.isArray(servers)) {
    for (const rawSource of allEffectiveSources(overrides)) {
      const source = applySourceMetadataOverride(rawSource, overrides);
      const sourceId = String(source.id ?? "");
      for (const row of effectiveVisibleSourceRows(sourceId, source, overrides)) {
        if (String(row.username ?? "").toLowerCase() !== username.toLowerCase()) continue;
        const displayName = String(source.displayName ?? "");
        if (existingServerKeys.has(normalizeName(displayName))) continue;
        servers.push({
          id: String(source.id ?? ""),
          displayName,
          totalBlocks: toNumber(row.blocksMined, 0),
          rank: rankForSourcePlayer(String(source.id ?? ""), sourceRowPlayerId(row, String(row.username ?? "")), username, overrides) ?? Number(row.rank ?? 0),
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
  const mainLeaderboardRow = findEffectiveMainLeaderboardRow(overrides, username, playerId);
  const leaderboardTotalBlocks = mainLeaderboardRow ? toNumber(mainLeaderboardRow.blocksMined, toNumber(totalBlocks, 0)) : totalBlocks;
  const leaderboardRank = mainLeaderboardRow ? toNumber(mainLeaderboardRow.rank, toNumber(payload.rank, 0)) : payload.rank;

  return {
    ...payload,
    username,
    playerId,
    rank: leaderboardRank,
    totalBlocks: leaderboardTotalBlocks,
    sourceCount: Array.isArray(mergedServers) ? mergedServers.length : payload.sourceCount,
    sourceServer: Array.isArray(mergedServers) && mergedServers[0] ? String((mergedServers[0] as JsonRecord).displayName ?? payload.sourceServer ?? "") : payload.sourceServer,
    servers: mergedServers,
  };
}

export async function applyStaticManualOverridesToSubmitSources<T extends JsonRecord>(sources: T[], username: string) {
  const overrides = await loadStaticManualOverrides({ includeFlagMetadata: false });
  const normalizedUsername = username.trim().toLowerCase();
  const playerId = localPlayerId(normalizedUsername);
  const activeUsername = renamedPlayerName(overrides, playerId, username);
  const mapped = sources.flatMap((source) => {
    const sourceId = String(source.sourceId ?? source.id ?? "");
    const snapshotSource = snapshotSourceById.get(sourceId);
    const sourceOverride = sourceId ? overrides.sources.get(sourceId) : null;
    const rowOverride = sourceId ? getSourceRowOverride(overrides, sourceId, playerId, activeUsername) : null;
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
  const stats = getSourceStats(source);
  return {
    id: source.id,
    slug: source.slug,
    displayName: source.displayName,
    sourceType: source.sourceType,
    logoUrl: source.logoUrl ?? null,
    totalBlocks: stats.totalBlocks,
    isDead: Boolean(source.isDead),
    playerCount: stats.playerCount,
    sourceScope: source.sourceScope,
    hasSpreadsheetTotal: Boolean(source.hasSpreadsheetTotal),
  };
}

function liveSourceLeaderboardRows(source: JsonRecord, rows: LiveSourcePlayerRow[]): JsonRecord[] {
  return rerankRows(rows.map((row) => {
    const username = row.username;
    const blocksMined = toNumber(row.blocksMined, 0);
    return {
      playerId: row.playerId,
      username,
      skinFaceUrl: skinFaceUrl(username),
      playerFlagUrl: null,
      lastUpdated: String(row.lastUpdated ?? source.createdAt ?? snapshot.generatedAt ?? ""),
      blocksMined,
      totalDigs: blocksMined,
      rank: 0,
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

function submissionSourceLeaderboardRows(source: JsonRecord, overrides: OverrideMaps): JsonRecord[] {
  const sourceId = String(source.id ?? "");
  return rerankRows(effectiveVisibleSourceRows(sourceId, source, overrides).map((row) => {
    const username = String(row.username ?? "");
    const blocksMined = toNumber(row.blocksMined, 0);
    return {
      playerId: sourceRowPlayerId(row, username),
      username,
      skinFaceUrl: skinFaceUrl(username),
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

async function buildFastApprovedLiveSourceLeaderboardResponse(url: URL) {
  const sourceSlug = String(url.searchParams.get("source") ?? "").trim().toLowerCase();
  if (!sourceSlug || !process.env.VITE_SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return null;
  }

  let sourceLookup: { data: unknown | null; error: unknown | null };
  try {
    sourceLookup = await supabaseAdmin
      .from("sources")
      .select("id,slug,display_name,source_type,is_public,is_approved")
      .eq("slug", sourceSlug)
      .eq("is_public", true)
      .eq("is_approved", true)
      .maybeSingle();
  } catch {
    return null;
  }

  const { data: sourceData, error: sourceError } = sourceLookup;
  if (sourceError || !sourceData) {
    return null;
  }

  const sourceMeta = sourceData as LiveSourceMeta;
  const snapshotSource = snapshotSourceBySlug.get(sourceSlug);
  let entryResult: { data: unknown[] | null; error: unknown | null };
  let scoreboardResult: { data: unknown[] | null; error: unknown | null };
  try {
    [entryResult, scoreboardResult] = await Promise.all([
      supabaseAdmin
        .from("leaderboard_entries")
        .select("player_id,score,updated_at,users!inner(id,username)")
        .eq("source_id", sourceMeta.id)
        .gt("score", 0)
        .limit(5_000),
      supabaseAdmin
        .from("aeternum_player_stats")
        .select("source_world_id,player_id,username,username_lower,player_digs,total_digs,latest_update,is_fake_player")
        .eq("server_name", sourceMeta.display_name)
        .eq("is_fake_player", false)
        .limit(5_000),
    ]);
  } catch {
    return null;
  }

  if (entryResult.error) {
    return null;
  }

  const entryRows = liveRowsFromLeaderboardEntries((entryResult.data ?? []) as LiveSourceEntryWithUserRow[]);
  const scoreboard = scoreboardResult.error
    ? { rows: [] as LiveSourcePlayerRow[], verifiedSourceTotal: 0, authoritative: false }
    : liveRowsFromScoreboardStats((scoreboardResult.data ?? []) as AeternumLiveRow[]);
  const snapshotRowCount = snapshotSource ? visibleSourceRows(snapshotSource).length : 0;
  const useScoreboardRows = scoreboard.authoritative;
  const useEntryRows = entryRows.length > 0 && (!snapshotSource || entryRows.length >= snapshotRowCount);
  const liveRows = useScoreboardRows ? scoreboard.rows : useEntryRows ? entryRows : [];

  if (liveRows.length === 0) {
    return null;
  }

  const source = {
    id: sourceMeta.id,
    slug: sourceSlug,
    displayName: sourceMeta.display_name,
    sourceType: normalizeSourceType(sourceMeta.source_type),
    logoUrl: stringOrNull(snapshotSource?.logoUrl) ?? null,
    totalBlocks: useScoreboardRows && scoreboard.verifiedSourceTotal > 0
      ? scoreboard.verifiedSourceTotal
      : liveRows.reduce((sum, row) => sum + toNumber(row.blocksMined, 0), 0),
    isDead: Boolean(snapshotSource?.isDead ?? false),
    playerCount: liveRows.length,
    sourceScope: stringOrNull(snapshotSource?.sourceScope) ?? submissionSourceScope(sourceMeta.source_type),
    hasSpreadsheetTotal: false,
    createdAt: liveRows.reduce((latest, row) => row.lastUpdated > latest ? row.lastUpdated : latest, ""),
    liveApprovedSource: true,
    authoritativeLiveSourceRows: useScoreboardRows || !snapshotSource || entryRows.length >= snapshotRowCount,
    replacesStaticSourceId: snapshotSource ? String(snapshotSource.id ?? "") : null,
  } satisfies JsonRecord;

  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page") ?? "1")) || 1);
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get("pageSize") ?? "30")) || 30));
  const minBlocks = Math.max(0, Number(url.searchParams.get("minBlocks") ?? "0"));
  const query = String(url.searchParams.get("query") ?? "").trim().toLowerCase();
  const isFiltered = Boolean(query) || minBlocks > 0;
  const baseRows = liveSourceLeaderboardRows(source, liveRows);
  const filteredRows = baseRows.filter((row) =>
    toNumber(row.blocksMined, 0) >= minBlocks
    && (!query || String(row.username ?? "").toLowerCase().includes(query)),
  );
  const filteredStats = getSourceStats(filteredRows);
  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const rows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return {
    scope: "source",
    title: source.displayName,
    description: `${source.displayName} approved from MMM synced source data.`,
    scoreLabel: "Blocks Mined",
    source,
    featuredRows: baseRows.slice(0, 3),
    rows,
    page: safePage,
    pageSize,
    totalRows,
    totalPages,
    totalBlocks: isFiltered ? filteredStats.rowTotalBlocks : toNumber(source.totalBlocks, filteredStats.totalBlocks),
    playerCount: isFiltered ? filteredStats.playerCount : liveRows.length,
    highlightedPlayer: "5hekel",
    publicSources: sources.map(publicSourceSummaryFromSnapshot),
  };
}

export async function buildApprovedSubmissionSourceLeaderboardResponse(url: URL) {
  const sourceSlug = String(url.searchParams.get("source") ?? "");
  if (!sourceSlug) return null;
  const fastLiveResponse = await buildFastApprovedLiveSourceLeaderboardResponse(url);
  if (fastLiveResponse) {
    return fastLiveResponse;
  }

  const overrides = await loadStaticManualOverrides({ includeFlagMetadata: false });
  const matchingSources = overrides.submissionSources.filter((candidate) =>
    String(candidate.slug ?? "") === sourceSlug
    && !isSourceOverrideHidden(overrides.sources.get(String(candidate.id ?? ""))),
  );
  const rawSource = mergeSourcesBySlug(matchingSources)
    ?? mergeSourcesBySlug(allEffectiveSources(overrides).filter((candidate) =>
      sourceSlugKey(candidate) === sourceSlug
      && !isSourceOverrideHidden(overrides.sources.get(String(candidate.id ?? ""))),
    ));
  const source = rawSource ? applySourceOverride(rawSource, overrides) : null;
  if (!source) return null;

  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page") ?? "1")) || 1);
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get("pageSize") ?? "30")) || 30));
  const minBlocks = Math.max(0, Number(url.searchParams.get("minBlocks") ?? "0"));
  const query = String(url.searchParams.get("query") ?? "").trim().toLowerCase();
  const isFiltered = Boolean(query) || minBlocks > 0;
  const baseRows = submissionSourceLeaderboardRows(source, overrides);
  const filteredRows = baseRows.filter((row) =>
    toNumber(row.blocksMined, 0) >= minBlocks
    && (!query || String(row.username ?? "").toLowerCase().includes(query)),
  );
  const sourceStats = getSourceStats(baseRows);
  const filteredStats = getSourceStats(filteredRows);
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
    totalBlocks: isFiltered ? filteredStats.rowTotalBlocks : toNumber(source.totalBlocks, sourceStats.totalBlocks),
    playerCount: isFiltered ? filteredStats.playerCount : sourceStats.playerCount,
    highlightedPlayer: "5hekel",
    publicSources,
  };
}

export async function buildApprovedSubmissionPlayerDetailResponse(url: URL) {
  const slug = String(url.searchParams.get("slug") ?? "").trim().toLowerCase();
  if (!slug) return null;
  const overrides = await loadStaticManualOverrides({ includeFlagMetadata: false });
  let username = slug;
  const serverRows = allEffectiveSources(overrides).flatMap((rawSource) => {
    const source = applySourceMetadataOverride(rawSource, overrides);
    const sourceId = String(source.id ?? "");
    return effectiveVisibleSourceRows(sourceId, source, overrides)
      .filter((row) => String(row.username ?? "").toLowerCase() === slug)
      .map((row) => {
        username = String(row.username ?? slug);
        return normalizeNarutakuSmpProfileRow({
          sourceId: String(source.id ?? ""),
          sourceSlug: String(source.slug ?? ""),
          playerId: sourceRowPlayerId(row, String(row.username ?? slug)),
          server: String(source.displayName ?? ""),
          logoUrl: stringOrNull(source.logoUrl) ?? null,
          sourceType: String(source.sourceType ?? ""),
          sourceCategory: String(source.sourceCategory ?? ""),
          sourceScope: String(source.sourceScope ?? ""),
          blocks: toNumber(row.blocksMined, 0),
          rank: rankForSourcePlayer(String(source.id ?? ""), sourceRowPlayerId(row, String(row.username ?? slug)), String(row.username ?? slug), overrides) ?? Number(row.rank ?? 0),
          joined: "2026",
        });
      });
  });
  if (serverRows.length === 0) return null;
  const mainLeaderboardRow = findEffectiveMainLeaderboardRow(overrides, username);
  const mergedServers = mergeServerRows(serverRows as JsonRecord[], "server", "blocks");
  const narutakuPlayers = narutakuSmpPlayerNames(overrides);
  const profileServerFilter = removeNarutakuUnlabeledProfileWorlds(
    mergedServers,
    narutakuPlayers.has(canonicalPlayerName(username)) || narutakuPlayers.has(canonicalPlayerName(slug)),
  );
  const profileServers = profileServerFilter.rows;
  const blocksNum = profileServers.reduce((sum, row) => sum + toNumber(row.blocks, 0), 0);
  return {
    rank: mainLeaderboardRow ? toNumber(mainLeaderboardRow.rank, 0) : 0,
    slug,
    name: username,
    blocksNum: mainLeaderboardRow && !profileServerFilter.removed ? toNumber(mainLeaderboardRow.blocksMined, blocksNum) : blocksNum,
    avatarUrl: fullBodyUrl(username),
    bio: `${username} has approved MMM source submissions tracked through owner moderation.`,
    joined: "APR 2026",
    favoriteBlock: "DEEPSLATE",
    places: profileServers.length,
    servers: profileServers,
    activity: [],
    sessions: [],
  };
}
