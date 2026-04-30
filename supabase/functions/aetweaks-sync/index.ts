import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildSecurityHeaders,
  clientErrorResponse,
  encryptAtRest,
  extractClientIp,
  hashDeterministic,
  hashIpForRateLimit,
  logSecurityEvent,
  parseKeyRing,
  PRIVACY_RETENTION,
  successResponse,
} from "../_shared/security.ts";
import { isPlaceholderLeaderboardUsername, looksLikeSyntheticFakeUsername, normalizeFilteredFakeUsernames, shouldIncludeLeaderboardUsername } from "../../../shared/leaderboard-ingestion.ts";
import { canonicalPlayerName, cleanPlayerDisplayName as cleanCanonicalPlayerDisplayName } from "../../../shared/player-identity.js";
import { isQualifyingCompletedSession, MIN_SESSION_DURATION_SECONDS, normalizeSessionDurationSeconds } from "../../../shared/session-filters.ts";
import { buildSourceDisplayName, buildSourceSlug, buildSourceType } from "../../../shared/source-slug.ts";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

interface SyncWorld {
  key: string;
  display_name: string;
  kind: "singleplayer" | "multiplayer" | "realm" | "unknown";
  host?: string | null;
}

interface SyncProject {
  project_key: string;
  name: string;
  progress: number;
  goal?: number | null;
  is_active: boolean;
}

interface SyncDailyGoal {
  goal_date: string;
  target: number;
  progress: number;
  completed: boolean;
}

interface SyncSessionBreakdown {
  block_id: string;
  count: number;
}

interface SyncRatePoint {
  point_index: number;
  blocks_per_hour: number;
  elapsed_seconds: number;
}

interface SyncSession {
  session_key: string;
  started_at: string;
  ended_at?: string | null;
  active_seconds: number;
  total_blocks: number;
  average_bph: number;
  peak_bph: number;
  best_streak_seconds: number;
  top_block?: string | null;
  status: "active" | "paused" | "ended";
  block_breakdown?: SyncSessionBreakdown[];
  rate_points?: SyncRatePoint[];
}

interface SyncStats {
  blocks_per_hour: number;
  estimated_finish_seconds?: number | null;
  current_project_name?: string | null;
  current_project_progress?: number | null;
  current_project_goal?: number | null;
  daily_progress?: number | null;
  daily_target?: number | null;
}

interface AeternumSidebarSync {
  server_name?: string | null;
  objective_title?: string | null;
  player_digs?: number | null;
  total_digs?: number | null;
  captured_at?: string | null;
}

interface AeternumLeaderboardEntrySync {
  username: string;
  digs: number;
  rank?: number | null;
  source_server?: string | null;
}

interface AeternumLeaderboardSync {
  server_name?: string | null;
  objective_title?: string | null;
  total_digs?: number | null;
  captured_at?: string | null;
  source_type?: string | null;
  filtered_fake_usernames?: string[] | null;
  entries?: AeternumLeaderboardEntrySync[];
}

interface PlayerTotalDigsSync {
  username: string;
  total_digs: number;
  server?: string | null;
  timestamp?: string | null;
  objective_title?: string | null;
}

interface SyncLifetimeTotals {
  total_blocks?: number;
  total_sessions?: number;
  total_play_seconds?: number;
}

interface SyncCurrentWorldTotals {
  world_key: string;
  display_name: string;
  kind: "singleplayer" | "multiplayer" | "realm" | "unknown";
  host?: string | null;
  total_blocks?: number;
  last_seen_at?: string | null;
}

interface SyncSourceScan {
  compatible?: boolean | null;
  confidence?: number | null;
  scoreboard_title?: string | null;
  sample_sidebar_lines?: string[] | null;
  detected_stat_fields?: string[] | null;
  total_digs?: number | null;
  player_total_digs?: number | null;
  server_name?: string | null;
  icon_url?: string | null;
  scan_fingerprint?: string | null;
  raw_scan_evidence?: Record<string, Json> | null;
}

interface SyncPayload {
  client_id: string;
  minecraft_uuid?: string | null;
  username: string;
  mod_version?: string | null;
  minecraft_version?: string | null;
  world?: SyncWorld | null;
  lifetime_totals?: SyncLifetimeTotals | null;
  current_world_totals?: SyncCurrentWorldTotals | null;
  source_scan?: SyncSourceScan | null;
  aeternum_sidebar?: AeternumSidebarSync | null;
  aeternum_leaderboard?: AeternumLeaderboardSync | null;
  player_total_digs?: PlayerTotalDigsSync | null;
  session?: SyncSession | null;
  projects?: SyncProject[];
  daily_goal?: SyncDailyGoal | null;
  synced_stats?: SyncStats | null;
}

type PrivacyContext = {
  clientIdHash: string;
  encryptedMinecraftUuid: string | null;
  minecraftUuidHash: string | null;
};

type SyncAuthDecision =
  | { allowed: true; mode: "shared_secret" | "linked_identity" | "open" }
  | { allowed: false; cause: "missing_secret_and_unlinked" | "missing_uuid_for_linked_fallback" | "linked_identity_lookup_unavailable" };

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const REJECTED_SOURCE_REVIEW_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ACCEPTED_LEADERBOARD_ENTRIES = 512;
const MAX_PROJECTS = 25;
const MAX_BREAKDOWN_ENTRIES = 128;
const MAX_RATE_POINTS = 720;
const MAX_SOURCE_SCAN_LINES = 12;
const MAX_SOURCE_SCAN_FIELDS = 16;
const PLAYER_TABLE = "users";
const PUBLIC_CACHE_SNAPSHOT_IDS = [
  "static-overrides-base-v1",
  "public-response:landing:summary:v1",
  "public-response:leaderboard:sources",
  "public-response:leaderboard:main:p1:s20",
  "public-response:leaderboard:main:p1:s10",
  "public-response:leaderboard:main:p1:s1",
  "public-response:leaderboard:special:ssp-hsp:p1:s20",
  "public-response:leaderboard:special:ssp:p1:s20",
  "public-response:leaderboard:special:hsp:p1:s20",
];

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const syncSecret = Deno.env.get("AE_SYNC_SHARED_SECRET") ?? "";
const encryptionKeys = parseKeyRing(Deno.env.get("AE_ENCRYPTION_KEYS_JSON"));
const primaryEncryptionKeyId = Deno.env.get("AE_PRIMARY_ENCRYPTION_KEY_ID") ?? "";
const deterministicHashSecret = Deno.env.get("AE_HASH_SECRET") ?? "";
const ipHashSecret = Deno.env.get("AE_IP_HASH_SECRET") ?? "";
const allowedOrigins = (Deno.env.get("AE_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function sanitizeInt(value: unknown, fallback = 0, max = 1_000_000_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, Math.round(parsed)));
}

function sanitizeText(value: unknown, fallback = "", maxLength = 128) {
  if (typeof value !== "string") return fallback;
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return (code >= 32 && code !== 127) || code > 127;
    })
    .join("")
    .trim()
    .slice(0, maxLength);
}

function cleanPlayerDisplayName(value: unknown) {
  return sanitizeText(cleanCanonicalPlayerDisplayName(value), "", 64);
}

function sanitizeTextList(values: unknown, maxItems: number, maxLength = 160) {
  if (!Array.isArray(values)) return [];
  return values
    .slice(0, maxItems)
    .map((value) => sanitizeText(value, "", maxLength))
    .filter(Boolean);
}

function sanitizeUsername(value: unknown) {
  const username = cleanPlayerDisplayName(value).slice(0, 16);
  return /^[A-Za-z0-9_]{3,16}$/.test(username) ? username : "";
}

function canonicalUsernameKey(value: unknown) {
  return canonicalPlayerName(sanitizeUsername(value));
}

function isPlaceholderSyncUsername(username: string) {
  const normalized = canonicalUsernameKey(username);
  return normalized === "player" || normalized === "unknown";
}

function resolvePayloadUsername(payload: SyncPayload) {
  const primary = sanitizeUsername(payload.username);
  if (!isPlaceholderSyncUsername(primary)) {
    return primary;
  }

  const playerTotalUsername = sanitizeUsername(payload.player_total_digs?.username);
  return playerTotalUsername && !isPlaceholderSyncUsername(playerTotalUsername)
    ? playerTotalUsername
    : primary;
}

function isServerLikeKind(kind: SyncWorld["kind"] | SyncCurrentWorldTotals["kind"] | string | null | undefined) {
  return kind === "multiplayer" || kind === "realm";
}

function normalizeSourceScope(value: unknown): "public_server" | "private_singleplayer" | "unsupported" {
  const normalized = sanitizeText(value, "", 48);
  if (normalized === "private_singleplayer" || normalized === "unsupported") {
    return normalized;
  }
  return "public_server";
}

function isWorldCountableForPlayerTotal(world: {
  source_scope?: string | null;
  approval_status?: string | null;
} | null | undefined) {
  if (!world) return false;
  const scope = normalizeSourceScope(world.source_scope);
  if (scope === "unsupported") return false;
  if (scope === "private_singleplayer") return true;
  return (world.approval_status ?? "pending") !== "rejected";
}

function isIsoDate(value: string) {
  return !Number.isNaN(Date.parse(value));
}

function latestIso(...values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value) && isIsoDate(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? new Date().toISOString();
}

function logSyncInfo(stage: string, details: Record<string, Json | undefined>) {
  console.info("[aetweaks-sync]", stage, details);
  console.info("[SYNC_DEBUG]", stage, details);
}

function requireSecurityConfiguration() {
  return Boolean(
    supabaseUrl &&
      serviceRoleKey &&
      deterministicHashSecret &&
      ipHashSecret &&
      primaryEncryptionKeyId &&
      encryptionKeys[primaryEncryptionKeyId],
  );
}

function resolveAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }

  if (!origin.startsWith("https://")) {
    return null;
  }

  if (allowedOrigins.length === 0) {
    return origin;
  }

  return allowedOrigins.includes(origin) ? origin : null;
}

function validatePayload(payload: SyncPayload) {
  if (!sanitizeText(payload.client_id, "", 128)) {
    return "Invalid client identifier.";
  }

  const username = resolvePayloadUsername(payload);
  if (!username || (isPlaceholderSyncUsername(username) && !payload.minecraft_uuid)) {
    return "Invalid username.";
  }

  if (payload.projects && payload.projects.length > MAX_PROJECTS) {
    return "Too many projects in one sync payload.";
  }

  if (payload.session) {
    if (!sanitizeText(payload.session.session_key, "", 128) || !isIsoDate(payload.session.started_at)) {
      return "Invalid session payload.";
    }

    if ((payload.session.block_breakdown?.length ?? 0) > MAX_BREAKDOWN_ENTRIES) {
      return "Session breakdown is too large.";
    }

    if ((payload.session.rate_points?.length ?? 0) > MAX_RATE_POINTS) {
      return "Session rate graph is too large.";
    }
  }

  if ((payload.aeternum_leaderboard?.entries?.length ?? 0) > MAX_ACCEPTED_LEADERBOARD_ENTRIES) {
    return "Leaderboard payload is too large.";
  }

  return null;
}

async function buildPrivacyContext(payload: SyncPayload): Promise<PrivacyContext> {
  const minecraftUuid = payload.minecraft_uuid?.toLowerCase() ?? null;
  let encryptedMinecraftUuid: string | null = null;

  if (minecraftUuid) {
    try {
      encryptedMinecraftUuid = await encryptAtRest(minecraftUuid, encryptionKeys, primaryEncryptionKeyId);
    } catch (error) {
      logSecurityEvent("aetweaks-sync uuid encryption failed", error instanceof Error ? error.message : error);
    }
  }

  return {
    clientIdHash: await hashDeterministic(payload.client_id, deterministicHashSecret),
    encryptedMinecraftUuid,
    minecraftUuidHash: minecraftUuid
      ? await hashDeterministic(minecraftUuid, deterministicHashSecret)
      : null,
  };
}

async function evaluateSyncAuth(
  request: Request,
  payload: SyncPayload,
  privacy: PrivacyContext,
): Promise<SyncAuthDecision> {
  const configuredSecret = syncSecret.trim();
  const providedSecret = (request.headers.get("x-sync-secret") ?? "").trim();

  if (!configuredSecret) {
    return { allowed: true, mode: "open" };
  }

  if (providedSecret && providedSecret === configuredSecret) {
    return { allowed: true, mode: "shared_secret" };
  }

  const usernameLower = canonicalUsernameKey(resolvePayloadUsername(payload));
  if (!privacy.minecraftUuidHash || !usernameLower) {
    // Public mod builds do not always ship a shared secret and players may not have
    // linked their dashboard identity yet. In that case we still accept sync and
    // treat it as an open public ingestion path rather than blocking everyone except
    // manually linked users.
    return { allowed: true, mode: "open" };
  }

  const linkedLookup = await supabase
    .from("connected_accounts")
    .select("id,minecraft_username")
    .eq("minecraft_uuid_hash", privacy.minecraftUuidHash)
    .maybeSingle();

  if (linkedLookup.error) {
    logSecurityEvent("aetweaks-sync linked identity lookup failed", {
      code: linkedLookup.error.code,
      message: linkedLookup.error.message,
      details: linkedLookup.error.details,
      hint: linkedLookup.error.hint,
    });
    return { allowed: true, mode: "open" };
  }

  if (!linkedLookup.data) {
    return { allowed: true, mode: "open" };
  }

  const linkedUsername = canonicalUsernameKey(linkedLookup.data.minecraft_username);
  if (!linkedUsername || linkedUsername !== usernameLower) {
    return { allowed: true, mode: "open" };
  }

  return { allowed: true, mode: "linked_identity" };
}

class StageFailure extends Error {
  private static describeCause(cause: unknown) {
    if (cause instanceof Error) {
      return cause.message;
    }
    if (cause && typeof cause === "object") {
      const maybe = cause as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
      const message = typeof maybe.message === "string" ? maybe.message : "";
      const code = typeof maybe.code === "string" ? maybe.code : "";
      const details = typeof maybe.details === "string" ? maybe.details : "";
      const hint = typeof maybe.hint === "string" ? maybe.hint : "";
      return [code, message, details, hint].filter(Boolean).join(" | ") || JSON.stringify(cause);
    }
    return String(cause);
  }

  constructor(
    readonly stage: string,
    readonly context: Record<string, Json | undefined>,
    cause: unknown,
  ) {
    super(StageFailure.describeCause(cause));
    this.name = "StageFailure";
  }
}

function describeErrorForLog(error: unknown): Record<string, Json | undefined> {
  if (error instanceof StageFailure) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      failedStage: error.stage,
    };
  }

  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    };
  }

  if (error && typeof error === "object") {
    const maybe = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    return {
      errorCode: typeof maybe.code === "string" ? maybe.code : undefined,
      errorMessage: typeof maybe.message === "string" ? maybe.message : JSON.stringify(error),
      errorDetails: typeof maybe.details === "string" ? maybe.details : undefined,
      errorHint: typeof maybe.hint === "string" ? maybe.hint : undefined,
    };
  }

  return {
    errorMessage: String(error),
  };
}

async function runStage<T>(
  stage: string,
  context: Record<string, Json | undefined>,
  work: () => Promise<T>,
): Promise<T> {
  logSyncInfo(`${stage}-started`, { ...context, status: "started" });
  try {
    const result = await work();
    logSyncInfo(stage, { ...context, status: "ok" });
    return result;
  } catch (error) {
    if (error instanceof StageFailure) {
      logSyncInfo(`${stage}-failed`, {
        ...context,
        status: "error",
        ...describeErrorForLog(error),
      });
      throw error;
    }
    logSyncInfo(`${stage}-failed`, {
      ...context,
      status: "error",
      ...describeErrorForLog(error),
    });
    throw new StageFailure(stage, context, error);
  }
}

async function enforceRateLimit(request: Request, privacy: PrivacyContext) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const clientIp = extractClientIp(request);
  const ipKey = clientIp
    ? await hashIpForRateLimit(clientIp, ipHashSecret, nowIso.slice(0, 10))
    : "anonymous";
  const windowKey = Math.floor(now / RATE_LIMIT_WINDOW_MS);
  const bucketKey = await hashDeterministic(`${privacy.clientIdHash}:${ipKey}:${windowKey}`, deterministicHashSecret);

  await supabase.from("sync_request_limits").delete().lt("expires_at", nowIso);

  const existing = await supabase
    .from("sync_request_limits")
    .select("request_count")
    .eq("bucket_key", bucketKey)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  const currentCount = sanitizeInt(existing.data?.request_count, 0, RATE_LIMIT_MAX_REQUESTS + 1);
  if (currentCount >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  const { error } = await supabase.from("sync_request_limits").upsert({
    bucket_key: bucketKey,
    request_count: currentCount + 1,
    expires_at: new Date(now + PRIVACY_RETENTION.syncRequestLimits * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: nowIso,
  }, { onConflict: "bucket_key" });

  if (error) {
    throw error;
  }

  return true;
}

async function invalidatePublicDataSnapshots(details: Record<string, Json | undefined>) {
  const nowIso = new Date().toISOString();
  const invalidPayload = {
    version: -1,
    generatedAt: nowIso,
    invalidatedBy: "mmm-sync",
    ...details,
  };

  const snapshotDelete = await supabase
    .from("mmm_public_snapshots")
    .delete()
    .in("id", PUBLIC_CACHE_SNAPSHOT_IDS);
  if (snapshotDelete.error) {
    logSyncInfo("public-cache-primary-invalidation-failed", {
      ...details,
      errorCode: snapshotDelete.error.code,
      errorMessage: snapshotDelete.error.message,
    });
  }

  const auditRows = PUBLIC_CACHE_SNAPSHOT_IDS.map((cacheId) => ({
    actor_user_id: null,
    actor_role: "system",
    action_type: cacheId === "static-overrides-base-v1" ? "public-cache.refresh" : "public-cache.response",
    target_type: "public-cache",
    target_id: cacheId,
    before_state: {},
    after_state: invalidPayload,
    reason: "MMM sync updated approved source/player totals",
    created_at: nowIso,
  }));

  const auditInsert = await supabase
    .from("admin_audit_log")
    .insert(auditRows);
  if (auditInsert.error) {
    logSyncInfo("public-cache-audit-invalidation-failed", {
      ...details,
      errorCode: auditInsert.error.code,
      errorMessage: auditInsert.error.message,
    });
  } else {
    logSyncInfo("public-cache-invalidated", {
      ...details,
      cacheIds: PUBLIC_CACHE_SNAPSHOT_IDS.length,
    });
  }
}

type ExistingPlayerRow = {
  id: string;
  minecraft_uuid?: string | null;
  minecraft_uuid_hash?: string | null;
  username?: string | null;
  username_lower?: string | null;
  canonical_name?: string | null;
  last_seen_at?: string | null;
  preserve_linked_identity?: boolean;
};

type ResolvedMinecraftIdentity = {
  username: string;
  usernameLower: string;
  encryptedMinecraftUuid: string;
  minecraftUuidHash: string;
};

const resolvedIdentityCache = new Map<string, Promise<ResolvedMinecraftIdentity | null>>();

function formatMinecraftUuid(value: string) {
  const compact = value.trim().toLowerCase().replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(compact)) {
    return null;
  }
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

async function resolveMinecraftIdentityByUsername(username: string): Promise<ResolvedMinecraftIdentity | null> {
  const sanitizedUsername = sanitizeUsername(username);
  if (!sanitizedUsername) return null;
  const usernameLower = canonicalUsernameKey(sanitizedUsername);
  if (isPlaceholderLeaderboardUsername(usernameLower)) {
    return null;
  }
  const cached = resolvedIdentityCache.get(usernameLower);
  if (cached) {
    return cached;
  }

  const lookupPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      try {
        const response = await fetch(
          `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(sanitizedUsername)}`,
          {
            method: "GET",
            headers: {
              "Accept": "application/json",
              "User-Agent": "AeTweaksSync/1.0",
            },
            signal: controller.signal,
          },
        );

        if (response.status === 204 || response.status === 404) {
          return null;
        }
        if (!response.ok) {
          logSyncInfo("minecraft identity lookup failed", {
            username: sanitizedUsername,
            status: response.status,
          });
          return null;
        }

        const payload = await response.json() as { id?: string; name?: string };
        const formattedUuid = formatMinecraftUuid(payload.id ?? "");
        const resolvedUsername = sanitizeUsername(payload.name ?? sanitizedUsername) || sanitizedUsername;
        if (!formattedUuid) {
          return null;
        }

        return {
          username: resolvedUsername,
          usernameLower: canonicalUsernameKey(resolvedUsername),
          encryptedMinecraftUuid: await encryptAtRest(formattedUuid, encryptionKeys, primaryEncryptionKeyId),
          minecraftUuidHash: await hashDeterministic(formattedUuid, deterministicHashSecret),
        } satisfies ResolvedMinecraftIdentity;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      logSyncInfo("minecraft identity lookup errored", {
        username: sanitizedUsername,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  })();

  resolvedIdentityCache.set(usernameLower, lookupPromise);
  return lookupPromise;
}

async function loadPlayersByUsernameLower(usernamesLower: string[]) {
  const canonicalNames = Array.from(new Set(usernamesLower.map(canonicalUsernameKey).filter(Boolean)));
  if (canonicalNames.length === 0) {
    return new Map<string, ExistingPlayerRow>();
  }

  const { data, error } = await supabase
    .from(PLAYER_TABLE)
    .select("id,minecraft_uuid,minecraft_uuid_hash,username,username_lower,canonical_name,last_seen_at")
    .in("canonical_name", canonicalNames);

  if (error) throw error;

  return new Map(
    ((data ?? []) as ExistingPlayerRow[])
      .filter((row) => row.canonical_name || row.username_lower)
      .map((row) => [canonicalPlayerName(row.canonical_name ?? row.username_lower), row]),
  );
}

async function buildResolvedClientId(identity: ResolvedMinecraftIdentity) {
  const token = await hashDeterministic(
    `resolved-player:${identity.minecraftUuidHash}`,
    deterministicHashSecret,
  );
  return `resolved:${token.slice(0, 32)}`;
}

async function upsertResolvedPlayerIdentity(identity: ResolvedMinecraftIdentity) {
  const nowIso = new Date().toISOString();
  const byUuid = await supabase
    .from(PLAYER_TABLE)
    .select("id,minecraft_uuid,minecraft_uuid_hash,username,username_lower,canonical_name,last_seen_at")
    .eq("minecraft_uuid_hash", identity.minecraftUuidHash)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byUuid.error) throw byUuid.error;

  const byUsername = await supabase
    .from(PLAYER_TABLE)
    .select("id,minecraft_uuid,minecraft_uuid_hash,username,username_lower,canonical_name,last_seen_at")
    .eq("canonical_name", identity.usernameLower)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byUsername.error) throw byUsername.error;

  const canonical = (byUuid.data as ExistingPlayerRow | null) ?? (byUsername.data as ExistingPlayerRow | null);
  const resolvedClientId = await buildResolvedClientId(identity);
  const row = {
    client_id: resolvedClientId,
    username: identity.username,
    username_lower: identity.usernameLower,
    canonical_name: identity.usernameLower,
    minecraft_uuid: identity.encryptedMinecraftUuid,
    minecraft_uuid_hash: identity.minecraftUuidHash,
    last_seen_at: nowIso,
    updated_at: nowIso,
  };

  if (canonical?.id) {
    const { data, error } = await supabase
      .from(PLAYER_TABLE)
      .update(row)
      .eq("id", canonical.id)
      .select("id,minecraft_uuid,minecraft_uuid_hash,username,username_lower,canonical_name,last_seen_at")
      .single();
    if (error) throw error;
    return data as ExistingPlayerRow;
  }

  const { data, error } = await supabase
    .from(PLAYER_TABLE)
    .insert(row)
    .select("id,minecraft_uuid,minecraft_uuid_hash,username,username_lower,canonical_name,last_seen_at")
    .single();
  if (error) {
    const retryByUuid = await supabase
      .from(PLAYER_TABLE)
      .select("id,minecraft_uuid,minecraft_uuid_hash,username,username_lower,canonical_name,last_seen_at")
      .eq("minecraft_uuid_hash", identity.minecraftUuidHash)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (retryByUuid.error) throw retryByUuid.error;
    if (retryByUuid.data) {
      return retryByUuid.data as ExistingPlayerRow;
    }

    const retryByUsername = await supabase
      .from(PLAYER_TABLE)
      .select("id,minecraft_uuid,minecraft_uuid_hash,username,username_lower,canonical_name,last_seen_at")
      .eq("canonical_name", identity.usernameLower)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (retryByUsername.error) throw retryByUsername.error;
    if (retryByUsername.data) {
      return retryByUsername.data as ExistingPlayerRow;
    }

    throw error;
  }
  return data as ExistingPlayerRow;
}

async function findCanonicalPlayer(payload: SyncPayload, privacy: PrivacyContext) {
  const username = resolvePayloadUsername(payload);
  const usernameLower = canonicalUsernameKey(username);
  const usernameIsPlaceholder = isPlaceholderSyncUsername(username);
  const clientId = sanitizeText(payload.client_id, "", 128);

  logSyncInfo("user/player lookup started", {
    username,
    hasUuidHash: Boolean(privacy.minecraftUuidHash),
    hasClientId: Boolean(clientId),
  });

  if (usernameLower && !usernameIsPlaceholder) {
    const byLinkedUsername = await supabase
      .from("connected_accounts")
      .select("user_id,minecraft_uuid,minecraft_uuid_hash,minecraft_username,updated_at")
      .ilike("minecraft_username", username)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byLinkedUsername.error) throw byLinkedUsername.error;
    if (byLinkedUsername.data?.user_id) {
      const linkedUsername = sanitizeUsername(byLinkedUsername.data.minecraft_username);
      logSyncInfo("player matched by linked account username", {
        username,
        playerId: byLinkedUsername.data.user_id,
        payloadUuidMatchesLinked: Boolean(
          privacy.minecraftUuidHash &&
            byLinkedUsername.data.minecraft_uuid_hash &&
            privacy.minecraftUuidHash === byLinkedUsername.data.minecraft_uuid_hash,
        ),
      });
      return {
        id: byLinkedUsername.data.user_id as string,
        minecraft_uuid: byLinkedUsername.data.minecraft_uuid as string | null,
        minecraft_uuid_hash: byLinkedUsername.data.minecraft_uuid_hash as string | null,
        username: linkedUsername || username,
        username_lower: canonicalUsernameKey(linkedUsername || username),
        last_seen_at: byLinkedUsername.data.updated_at as string | null,
        preserve_linked_identity: true,
      };
    }
  }

  if (privacy.minecraftUuidHash) {
    const byUuid = await supabase
      .from(PLAYER_TABLE)
      .select("id,minecraft_uuid,minecraft_uuid_hash,username,username_lower,canonical_name,last_seen_at")
      .eq("minecraft_uuid_hash", privacy.minecraftUuidHash)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byUuid.error) throw byUuid.error;
    if (byUuid.data) {
      logSyncInfo("player matched by uuid hash", {
        username,
        playerId: byUuid.data.id,
      });
      return byUuid.data as ExistingPlayerRow;
    }

    const byLinkedAccount = await supabase
      .from("connected_accounts")
      .select("user_id,minecraft_uuid,minecraft_uuid_hash,minecraft_username,updated_at")
      .eq("minecraft_uuid_hash", privacy.minecraftUuidHash)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byLinkedAccount.error) throw byLinkedAccount.error;
    if (byLinkedAccount.data?.user_id) {
      const linkedUsername = sanitizeUsername(byLinkedAccount.data.minecraft_username);
      logSyncInfo("player matched by linked account uuid hash", {
        username,
        playerId: byLinkedAccount.data.user_id,
      });
      return {
        id: byLinkedAccount.data.user_id as string,
        minecraft_uuid: byLinkedAccount.data.minecraft_uuid as string | null,
        minecraft_uuid_hash: byLinkedAccount.data.minecraft_uuid_hash as string | null,
        username: linkedUsername || username,
        username_lower: canonicalUsernameKey(linkedUsername || username),
        last_seen_at: byLinkedAccount.data.updated_at as string | null,
      };
    }
  }

  if (usernameLower && !usernameIsPlaceholder) {
    const byUsername = await supabase
      .from(PLAYER_TABLE)
      .select("id,minecraft_uuid,minecraft_uuid_hash,username,username_lower,canonical_name,last_seen_at")
      .eq("canonical_name", usernameLower)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byUsername.error) throw byUsername.error;
    if (byUsername.data) {
      logSyncInfo("player matched by username fallback", {
        username,
        playerId: byUsername.data.id,
      });
      return byUsername.data as ExistingPlayerRow;
    }
  }

  if (clientId) {
    const byClientId = await supabase
      .from(PLAYER_TABLE)
      .select("id,minecraft_uuid,minecraft_uuid_hash,username,username_lower,canonical_name,last_seen_at")
      .eq("client_id", clientId)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byClientId.error) throw byClientId.error;
    if (byClientId.data) {
      logSyncInfo("player matched by client id", {
        username,
        clientId,
        playerId: byClientId.data.id,
      });
      return byClientId.data as ExistingPlayerRow;
    }
  }

  return null;
}

async function upsertPlayer(payload: SyncPayload, world: SyncWorld | null, privacy: PrivacyContext) {
  let username = resolvePayloadUsername(payload);
  let usernameLower = canonicalUsernameKey(username);
  const clientId = sanitizeText(payload.client_id, "", 128);
  const nowIso = new Date().toISOString();
  const canonicalPlayer = await findCanonicalPlayer(payload, privacy);
  const canonicalUsername = sanitizeUsername(canonicalPlayer?.username);
  if (isPlaceholderSyncUsername(username) && canonicalUsername && !isPlaceholderSyncUsername(canonicalUsername)) {
    username = canonicalUsername;
    usernameLower = canonicalUsernameKey(username);
  }
  if (!username || isPlaceholderSyncUsername(username)) {
    throw new Error("Cannot sync with a placeholder username.");
  }
  const row: Record<string, Json> = {
    username,
    username_lower: usernameLower,
    canonical_name: usernameLower,
    last_mod_version: sanitizeText(payload.mod_version, "", 32) || null,
    last_minecraft_version: sanitizeText(payload.minecraft_version, "", 32) || null,
    last_server_name: sanitizeText(world?.display_name, "", 64) || null,
    last_seen_at: nowIso,
    updated_at: nowIso,
  };

  if (!canonicalPlayer?.preserve_linked_identity) {
    row.client_id = clientId;
    if (privacy.encryptedMinecraftUuid) {
      row.minecraft_uuid = privacy.encryptedMinecraftUuid;
    }
    if (privacy.minecraftUuidHash) {
      row.minecraft_uuid_hash = privacy.minecraftUuidHash;
    }
  }

  if (canonicalPlayer) {
    if (isPlaceholderSyncUsername(username) && sanitizeUsername(canonicalPlayer.username)) {
      row.username = sanitizeUsername(canonicalPlayer.username);
    }
    const { data, error } = await supabase
      .from(PLAYER_TABLE)
      .update(row)
      .eq("id", canonicalPlayer.id)
      .select("id")
      .single();
    if (error) throw error;
    logSyncInfo("user/player upsert success", {
      username: sanitizeUsername((data as { username?: string | null }).username ?? username) || username,
      playerId: data.id as string,
      mode: "updated",
    });
    return data as { id: string };
  }

  const insertAttempt = await supabase
    .from(PLAYER_TABLE)
    .insert(row)
    .select("id")
    .single();

  if (!insertAttempt.error) {
    logSyncInfo("user/player upsert success", {
      username,
      playerId: insertAttempt.data.id as string,
      mode: "inserted",
    });
    return insertAttempt.data as { id: string };
  }

  const fallbackPlayer = await findCanonicalPlayer(payload, privacy);
  if (fallbackPlayer) {
    const { data, error } = await supabase
      .from(PLAYER_TABLE)
      .update(row)
      .eq("id", fallbackPlayer.id)
      .select("id")
      .single();
    if (error) throw error;
    logSyncInfo("user/player upsert success", {
      username,
      playerId: data.id as string,
      mode: "updated-after-conflict",
    });
    return data as { id: string };
  }

  throw insertAttempt.error;
}

type ExistingAeternumRow = {
  source_world_id?: string | null;
  player_id?: string | null;
  minecraft_uuid?: string | null;
  minecraft_uuid_hash?: string | null;
  username_lower: string;
  player_digs?: number | null;
  total_digs?: number | null;
  latest_update?: string | null;
  is_fake_player?: boolean | null;
};

async function getExistingAeternumRows(serverName: string, usernamesLower: string[], sourceWorldId?: string | null) {
  const canonicalNames = Array.from(new Set(usernamesLower.map(canonicalUsernameKey).filter(Boolean)));
  if (canonicalNames.length === 0) {
    return new Map<string, ExistingAeternumRow>();
  }

  const { data, error } = await supabase
    .from("aeternum_player_stats")
    .select("source_world_id,player_id,minecraft_uuid,minecraft_uuid_hash,username_lower,player_digs,total_digs,latest_update,is_fake_player")
    .eq(sourceWorldId ? "source_world_id" : "server_name", sourceWorldId ?? serverName)
    .in("username_lower", canonicalNames);

  if (error) throw error;

  return new Map(
    ((data ?? []) as ExistingAeternumRow[]).map((row) => [canonicalUsernameKey(row.username_lower), row]),
  );
}

async function getExistingAeternumServerTotal(serverName: string, sourceWorldId?: string | null) {
  const { data, error } = await supabase
    .from("aeternum_player_stats")
    .select("total_digs")
    .eq(sourceWorldId ? "source_world_id" : "server_name", sourceWorldId ?? serverName)
    .eq("is_fake_player", false)
    .order("total_digs", { ascending: false })
    .limit(1);

  if (error) throw error;
  return sanitizeInt(data?.[0]?.total_digs);
}

async function upsertAeternumPlayerStats(rows: Record<string, Json> | Record<string, Json>[]) {
  const primary = await supabase
    .from("aeternum_player_stats")
    .upsert(rows, { onConflict: "username_lower,source_world_id" });
  if (!primary.error) {
    return;
  }

  const errorWithCode = primary.error as { code?: string };
  if (errorWithCode?.code !== "42P10") {
    throw primary.error;
  }

  const fallback = await supabase
    .from("aeternum_player_stats")
    .upsert(rows, { onConflict: "username_lower,server_name" });
  if (fallback.error) {
    throw fallback.error;
  }

  logSyncInfo("aeternum upsert conflict fallback", {
    onConflict: "username_lower,server_name",
  });
}

function resolveScoreboardServerName(serverName: string | null | undefined, world: SyncWorld | null | undefined) {
  const resolved = sanitizeText(serverName || world?.display_name, "", 64);
  return resolved || "Unknown Source";
}

async function syncAuthoritativePlayerTotals(
  playerId: string,
  worldId: string | null,
  authoritativeBlocks: number,
) {
  if (!worldId || authoritativeBlocks <= 0) {
    return;
  }

  const worldLookup = await runStage(
    "player-total-digs-source-resolved",
    { playerId, worldId, authoritativeBlocks, table: "worlds_or_servers", operation: "select-world-by-id" },
    async () => {
      const result = await supabase
        .from("worlds_or_servers")
        .select("world_key,display_name,kind,host,source_scope,approval_status,reviewed_at")
        .eq("id", worldId)
        .maybeSingle();
      if (result.error) throw result.error;
      return result;
    },
  );
  if (!worldLookup.data) {
    logSyncInfo("player-total-digs-source-skipped", {
      playerId,
      worldId,
      reason: "world-not-found",
    });
    return;
  }

  const sourceSlug = buildSourceSlug({
    displayName: worldLookup.data.display_name,
    worldKey: worldLookup.data.world_key,
    host: worldLookup.data.host,
  });
  const sourceDisplayName = buildSourceDisplayName({
    displayName: worldLookup.data.display_name,
    worldKey: worldLookup.data.world_key,
    host: worldLookup.data.host,
  });
  const sourceType = buildSourceType(worldLookup.data.kind);
  const isApproved = (worldLookup.data.approval_status ?? "pending") === "approved";
  const isExplicitlyRejected = worldLookup.data.reviewed_at != null && !isApproved;
  if (isExplicitlyRejected) {
    logSyncInfo("player-total-digs-source-skipped", {
      playerId,
      worldId,
      reason: "source-explicitly-rejected",
    });
    return;
  }
  const isPublic = normalizeSourceScope(worldLookup.data.source_scope) === "public_server" && isApproved;
  let effectiveScore = authoritativeBlocks;

  const sourceLookup = await runStage(
    "player-total-digs-existing-source-fetched",
    { playerId, worldId, sourceSlug, table: "sources", operation: "select-source-by-slug" },
    async () => {
      const result = await supabase
        .from("sources")
        .select("id")
        .eq("slug", sourceSlug)
        .maybeSingle();
      if (result.error) throw result.error;
      return result;
    },
  );

  if (sourceLookup.data?.id) {
    const existingEntry = await runStage(
      "player-total-digs-existing-score-fetched",
      { playerId, worldId, sourceSlug, sourceId: sourceLookup.data.id, table: "leaderboard_entries", operation: "select-player-source-score" },
      async () => {
        const result = await supabase
          .from("leaderboard_entries")
          .select("score")
          .eq("player_id", playerId)
          .eq("source_id", sourceLookup.data.id)
          .maybeSingle();
        if (result.error) throw result.error;
        return result;
      },
    );
    effectiveScore = Math.max(authoritativeBlocks, sanitizeInt(existingEntry.data?.score));
  }

  logSyncInfo("player-total-digs-effective-score-computed", {
    playerId,
    worldId,
    sourceSlug,
    sourceDisplayName,
    authoritativeBlocks,
    effectiveScore,
    isPublic,
    isApproved,
  });

  await runStage(
    "player-total-digs-submit-source-score-invoked",
    { playerId, worldId, sourceSlug, effectiveScore, isPublic, isApproved, rpc: "submit_source_score", tables: ["sources", "leaderboard_entries"] },
    async () => {
      const { error } = await supabase.rpc("submit_source_score", {
        p_player_id: playerId,
        p_source_slug: sourceSlug,
        p_source_display_name: sourceDisplayName,
        p_source_type: sourceType,
        p_score: effectiveScore,
        p_is_public: isPublic,
      });
      if (error) throw error;
    },
  );

  logSyncInfo("total digs update success", {
    playerId,
    worldId,
    sourceSlug,
    effectiveScore,
  });

  logSyncInfo("authoritative-score-submitted", {
    playerId,
    worldId,
    sourceSlug,
    sourceDisplayName,
    incomingScore: authoritativeBlocks,
    effectiveScore,
    isPublic,
    isApproved,
  });
}

type ExistingWorldRow = {
  id: string;
  approval_status?: string | null;
  submitted_by_player_id?: string | null;
  submitted_at?: string | null;
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  source_scope?: string | null;
  scan_fingerprint?: string | null;
};

type SourceClassification = {
  sourceScope: "public_server" | "private_singleplayer" | "unsupported";
  approvalStatus: "pending" | "approved" | "rejected";
};

function classifySource(
  world: SyncWorld,
  scan: SyncSourceScan | null | undefined,
  existing: ExistingWorldRow | null,
): SourceClassification {
  if (world.kind === "singleplayer") {
    return {
      sourceScope: "private_singleplayer",
      approvalStatus: (existing?.approval_status as "pending" | "approved" | "rejected" | undefined) ?? "pending",
    };
  }

  if (!isServerLikeKind(world.kind)) {
    return { sourceScope: "unsupported", approvalStatus: "rejected" };
  }

  if (!scan?.compatible) {
    return {
      sourceScope: existing?.source_scope ? normalizeSourceScope(existing.source_scope) : "public_server",
      approvalStatus: (existing?.approval_status as "pending" | "approved" | "rejected" | undefined) ?? "pending",
    };
  }

  if (existing?.approval_status === "approved") {
    return { sourceScope: "public_server", approvalStatus: "approved" };
  }

  const canResubmitRejected = existing?.approval_status === "rejected"
    && scan.scan_fingerprint
    && existing.scan_fingerprint
    && scan.scan_fingerprint !== existing.scan_fingerprint
    && (!existing.reviewed_at || (Date.now() - new Date(existing.reviewed_at).getTime()) >= REJECTED_SOURCE_REVIEW_COOLDOWN_MS);

  return {
    sourceScope: "public_server",
    approvalStatus: canResubmitRejected ? "pending" : ((existing?.approval_status as "pending" | "approved" | "rejected" | undefined) ?? "pending"),
  };
}

async function upsertWorld(playerId: string, world: SyncWorld | null, scan: SyncSourceScan | null | undefined) {
  if (!world) return null;

  const nowIso = new Date().toISOString();
  const worldKey = sanitizeText(world.key, "", 128);
  const displayName = sanitizeText(world.display_name, "Unknown World", 64);
  const host = null; // never store host — privacy

  const existing = await supabase
    .from("worlds_or_servers")
    .select("id,approval_status,submitted_by_player_id,submitted_at,reviewed_by_user_id,reviewed_at,source_scope,scan_fingerprint")
    .eq("world_key", worldKey)
    .maybeSingle();

  if (existing.error) throw existing.error;

  const classification = classifySource(world, scan, (existing.data ?? null) as ExistingWorldRow | null);
  const scanFingerprint = sanitizeText(scan?.scan_fingerprint, "", 160) || null;

  const nextRow = {
    display_name: displayName,
    kind: world.kind,
    host,
    last_seen_at: nowIso,
    source_scope: classification.sourceScope,
    approval_status: classification.approvalStatus,
    submitted_by_player_id: classification.sourceScope === "public_server"
      ? ((existing.data?.submitted_by_player_id as string | null | undefined) ?? playerId)
      : null,
    submitted_at: classification.sourceScope === "public_server"
      ? ((existing.data?.submitted_at as string | null | undefined) ?? nowIso)
      : nowIso,
    reviewed_by_user_id: classification.approvalStatus === "pending" ? null : existing.data?.reviewed_by_user_id ?? null,
    reviewed_at: classification.approvalStatus === "pending" ? null : existing.data?.reviewed_at ?? null,
    icon_url: sanitizeText(scan?.icon_url, "", 4096) || null,
    scoreboard_title: sanitizeText(scan?.scoreboard_title, "", 128) || null,
    sample_sidebar_lines: sanitizeTextList(scan?.sample_sidebar_lines, MAX_SOURCE_SCAN_LINES),
    detected_stat_fields: sanitizeTextList(scan?.detected_stat_fields, MAX_SOURCE_SCAN_FIELDS, 64),
    scan_confidence: sanitizeInt(scan?.confidence, 0, 1000),
    raw_scan_evidence: scan?.raw_scan_evidence && typeof scan.raw_scan_evidence === "object" && !Array.isArray(scan.raw_scan_evidence)
      ? scan.raw_scan_evidence
      : null,
    scan_fingerprint: scanFingerprint,
    last_scan_at: nowIso,
    last_scan_submitted_by_player_id: playerId,
  };

  if (existing.data?.id) {
    const { data, error } = await supabase
      .from("worlds_or_servers")
      .update(nextRow)
      .eq("id", existing.data.id)
      .select("id")
      .single();

    if (error) throw error;
    return data as { id: string };
  }

  const { data, error } = await supabase
    .from("worlds_or_servers")
    .insert({
      world_key: worldKey,
      first_seen_at: nowIso,
      ...nextRow,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data as { id: string };
}

async function upsertSession(playerId: string, worldId: string | null, session: SyncSession | null) {
  if (!session) return { sessionId: null, countedSession: false };

  const sessionKey = sanitizeText(session.session_key, "", 128);
  const activeSeconds = sanitizeInt(session.active_seconds, 0, 31_536_000);
  const qualifiesCompletedSession = isQualifyingCompletedSession({
    status: session.status,
    activeSeconds,
    endedAt: session.ended_at ?? null,
  }) && Boolean(sessionKey) && isIsoDate(session.started_at) && isIsoDate(session.ended_at);

  if (!qualifiesCompletedSession) {
    return { sessionId: null, countedSession: false };
  }

  const existing = await supabase
    .from("mining_sessions")
    .select("id,status,active_seconds,ended_at")
    .eq("player_id", playerId)
    .eq("session_key", sessionKey)
    .maybeSingle();

  if (existing.error) throw existing.error;

  const countedSession = !existing.data || !isQualifyingCompletedSession({
    status: existing.data.status,
    activeSeconds: normalizeSessionDurationSeconds(existing.data.active_seconds),
    endedAt: typeof existing.data.ended_at === "string" ? existing.data.ended_at : null,
  });

  const { data, error } = await supabase
    .from("mining_sessions")
    .upsert({
      player_id: playerId,
      world_id: worldId,
      session_key: sessionKey,
      started_at: session.started_at,
      ended_at: session.ended_at,
      active_seconds: activeSeconds,
      total_blocks: sanitizeInt(session.total_blocks),
      average_bph: sanitizeInt(session.average_bph, 0, 500_000),
      peak_bph: sanitizeInt(session.peak_bph, 0, 500_000),
      best_streak_seconds: sanitizeInt(session.best_streak_seconds, 0, 31_536_000),
      top_block: sanitizeText(session.top_block, "", 128) || null,
      status: session.status,
      synced_at: new Date().toISOString(),
    }, { onConflict: "player_id,session_key" })
    .select("id")
    .single();

  if (error) throw error;

  const sessionId = data.id as string;

  if (session.block_breakdown) {
    const { error: deleteBreakdownError } = await supabase.from("session_block_breakdown").delete().eq("session_id", sessionId);
    if (deleteBreakdownError) throw deleteBreakdownError;

    const sanitizedBreakdown = session.block_breakdown
      .slice(0, MAX_BREAKDOWN_ENTRIES)
      .map((entry) => ({
        session_id: sessionId,
        block_id: sanitizeText(entry.block_id, "", 128),
        count: sanitizeInt(entry.count),
      }))
      .filter((entry) => entry.block_id && entry.count > 0);

    if (sanitizedBreakdown.length > 0) {
      const { error: insertBreakdownError } = await supabase.from("session_block_breakdown").insert(sanitizedBreakdown);
      if (insertBreakdownError) throw insertBreakdownError;
    }
  }

  if (session.rate_points) {
    const { error: deleteRateError } = await supabase.from("session_rate_points").delete().eq("session_id", sessionId);
    if (deleteRateError) throw deleteRateError;

    const sanitizedPoints = session.rate_points
      .slice(0, MAX_RATE_POINTS)
      .map((point) => ({
        session_id: sessionId,
        point_index: sanitizeInt(point.point_index, 0, MAX_RATE_POINTS),
        blocks_per_hour: sanitizeInt(point.blocks_per_hour, 0, 500_000),
        elapsed_seconds: sanitizeInt(point.elapsed_seconds, 0, 31_536_000),
      }));

    if (sanitizedPoints.length > 0) {
      const { error: insertRateError } = await supabase.from("session_rate_points").insert(sanitizedPoints);
      if (insertRateError) throw insertRateError;
    }
  }

  return { sessionId, countedSession };
}

async function updateWorldStats(playerId: string, worldId: string | null, session: SyncSession | null, worldTotals: SyncCurrentWorldTotals | null | undefined, countedSession = false) {
  if (!worldId) return;

  const current = await supabase
    .from("player_world_stats")
    .select("total_blocks,total_sessions,total_play_seconds")
    .eq("player_id", playerId)
    .eq("world_id", worldId)
    .maybeSingle();

  if (current.error) throw current.error;

  const row = current.data ?? {
    total_blocks: 0,
    total_sessions: 0,
    total_play_seconds: 0,
  };

  const nextTotalBlocks = worldTotals?.total_blocks != null
    ? Math.max(sanitizeInt(row.total_blocks), sanitizeInt(worldTotals.total_blocks))
    : sanitizeInt(row.total_blocks);
  const nextTotalSessions = countedSession
    ? sanitizeInt(row.total_sessions, 0, 10_000_000) + 1
    : sanitizeInt(row.total_sessions, 0, 10_000_000);
  const nextTotalPlaySeconds = countedSession
    ? sanitizeInt(row.total_play_seconds, 0, 31_536_000) + sanitizeInt(session?.active_seconds, 0, 31_536_000)
    : sanitizeInt(row.total_play_seconds, 0, 31_536_000);

  const { error } = await supabase.from("player_world_stats").upsert({
    player_id: playerId,
    world_id: worldId,
    total_blocks: nextTotalBlocks,
    total_sessions: nextTotalSessions,
    total_play_seconds: nextTotalPlaySeconds,
    last_seen_at: worldTotals?.last_seen_at && isIsoDate(worldTotals.last_seen_at) ? worldTotals.last_seen_at : new Date().toISOString(),
  }, { onConflict: "player_id,world_id" });

  if (error) throw error;

  if (nextTotalBlocks > 0) {
    await syncAuthoritativePlayerTotals(playerId, worldId, nextTotalBlocks);
  }
}

async function syncProjects(playerId: string, projects: SyncProject[] | undefined) {
  if (!projects) return;

  for (const project of projects.slice(0, MAX_PROJECTS)) {
    const projectKey = sanitizeText(project.project_key, "", 128);
    if (!projectKey) continue;

    const { error } = await supabase.from("projects").upsert({
      player_id: playerId,
      project_key: projectKey,
      name: sanitizeText(project.name, "Project", 64),
      progress: sanitizeInt(project.progress),
      goal: project.goal == null ? null : sanitizeInt(project.goal),
      is_active: Boolean(project.is_active),
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "player_id,project_key" });

    if (error) throw error;
  }
}

async function syncDailyGoal(playerId: string, dailyGoal: SyncDailyGoal | null | undefined) {
  if (!dailyGoal) return;

  const { error } = await supabase.from("daily_goals").upsert({
    player_id: playerId,
    goal_date: sanitizeText(dailyGoal.goal_date, "", 32),
    target: sanitizeInt(dailyGoal.target),
    progress: sanitizeInt(dailyGoal.progress),
    completed: Boolean(dailyGoal.completed),
    updated_at: new Date().toISOString(),
  }, { onConflict: "player_id,goal_date" });

  if (error) throw error;
}

async function syncStats(playerId: string, stats: SyncStats | null | undefined) {
  if (!stats) return;

  const { error } = await supabase.from("synced_stats").upsert({
    player_id: playerId,
    blocks_per_hour: sanitizeInt(stats.blocks_per_hour, 0, 500_000),
    estimated_finish_seconds: stats.estimated_finish_seconds == null ? null : sanitizeInt(stats.estimated_finish_seconds, 0, 315_360_000),
    current_project_name: sanitizeText(stats.current_project_name, "", 64) || null,
    current_project_progress: stats.current_project_progress == null ? null : sanitizeInt(stats.current_project_progress),
    current_project_goal: stats.current_project_goal == null ? null : sanitizeInt(stats.current_project_goal),
    daily_progress: stats.daily_progress == null ? null : sanitizeInt(stats.daily_progress),
    daily_target: stats.daily_target == null ? null : sanitizeInt(stats.daily_target),
    updated_at: new Date().toISOString(),
  }, { onConflict: "player_id" });

  if (error) throw error;
}

async function syncAeternumSidebar(
  playerId: string,
  worldId: string | null,
  payload: SyncPayload,
  privacy: PrivacyContext,
  snapshot: AeternumSidebarSync | null | undefined,
) {
  if (!snapshot) return;
  if (!worldId) return;

  const username = resolvePayloadUsername(payload);
  const playerDigs = sanitizeInt(snapshot.player_digs);
  const totalDigs = sanitizeInt(snapshot.total_digs);
  if (isPlaceholderSyncUsername(username)) {
    logSyncInfo("aeternum sidebar skipped placeholder username", {
      username,
      playerId,
      worldId,
    });
    return;
  }
  if (!username || playerDigs <= 0) return;

  const latestUpdate = snapshot.captured_at && isIsoDate(snapshot.captured_at)
    ? snapshot.captured_at
    : new Date().toISOString();
  const serverName = resolveScoreboardServerName(snapshot.server_name, payload.world);
  const usernameLower = canonicalUsernameKey(username);
  const existingRows = await getExistingAeternumRows(serverName, [usernameLower], worldId);
  const existing = existingRows.get(usernameLower);
  if (existing?.is_fake_player) return;
  const existingServerTotal = Math.max(
    sanitizeInt(existing?.total_digs),
    await getExistingAeternumServerTotal(serverName, worldId),
  );
  const nextPlayerDigs = Math.max(sanitizeInt(existing?.player_digs), playerDigs);
  const nextServerTotal = totalDigs > 0 && totalDigs >= nextPlayerDigs
    ? Math.max(existingServerTotal, totalDigs)
    : existingServerTotal;

  await upsertAeternumPlayerStats({
    source_world_id: worldId,
    player_id: playerId,
    minecraft_uuid: privacy.encryptedMinecraftUuid,
    minecraft_uuid_hash: privacy.minecraftUuidHash,
    username,
    username_lower: usernameLower,
    player_digs: nextPlayerDigs,
    total_digs: nextServerTotal,
    server_name: serverName,
    objective_title: sanitizeText(snapshot.objective_title, "Aeternum", 64),
    latest_update: latestIso(existing?.latest_update, latestUpdate),
    updated_at: new Date().toISOString(),
  });

  await syncAuthoritativePlayerTotals(playerId, worldId, nextPlayerDigs);

  logSyncInfo("aeternum sidebar synced", {
    username,
    playerId,
    playerDigs: nextPlayerDigs,
    serverTotal: nextServerTotal,
    latestUpdate,
  });
}

async function syncAeternumLeaderboard(
  playerId: string,
  worldId: string | null,
  payload: SyncPayload,
  privacy: PrivacyContext,
  leaderboard: AeternumLeaderboardSync | null | undefined,
) {
  if (!leaderboard?.entries?.length) return;
  if (!worldId) return;

  const serverName = resolveScoreboardServerName(leaderboard.server_name, payload.world);
  const objectiveTitle = sanitizeText(leaderboard.objective_title, "Scoreboard", 64);
  const latestUpdate = leaderboard.captured_at && isIsoDate(leaderboard.captured_at)
    ? leaderboard.captured_at
    : new Date().toISOString();
  const totalDigs = sanitizeInt(leaderboard.total_digs);
  const localUsername = canonicalUsernameKey(resolvePayloadUsername(payload));
  const filteredFakeUsernames = normalizeFilteredFakeUsernames(
    leaderboard.filtered_fake_usernames,
    sanitizeText,
    MAX_ACCEPTED_LEADERBOARD_ENTRIES,
  );
  const heuristicFakeUsernames = leaderboard.entries
    .slice(0, MAX_ACCEPTED_LEADERBOARD_ENTRIES)
    .map((entry) => canonicalUsernameKey(entry.username))
    .filter((username) => looksLikeSyntheticFakeUsername(username));
  const combinedFakeUsernames = Array.from(new Set([
    ...filteredFakeUsernames,
    ...heuristicFakeUsernames,
  ]));

  if (combinedFakeUsernames.length > 0) {
    const { error: markFakeRowsError } = await supabase
      .from("aeternum_player_stats")
      .update({ is_fake_player: true, player_digs: 0, updated_at: new Date().toISOString() })
      .eq("source_world_id", worldId)
      .in("username_lower", combinedFakeUsernames);
    if (markFakeRowsError) throw markFakeRowsError;
  }

  const deduped = new Map<string, {
    username: string;
    digs: number;
    rank: number | null;
    sourceServer: string;
  }>();

  for (const entry of leaderboard.entries.slice(0, MAX_ACCEPTED_LEADERBOARD_ENTRIES)) {
    const username = sanitizeUsername(entry.username);
    const digs = sanitizeInt(entry.digs);
    if (!username || digs <= 0) continue;
    if (isPlaceholderLeaderboardUsername(canonicalUsernameKey(username))) continue;

    const nextRank = entry.rank == null ? null : sanitizeInt(entry.rank, 0, 10_000);
    const key = canonicalUsernameKey(username);
    if (shouldIncludeLeaderboardUsername(key, combinedFakeUsernames) === false) continue;
    const existing = deduped.get(key);
      const next = {
        username,
        digs,
        rank: nextRank && nextRank > 0 ? nextRank : null,
        sourceServer: sanitizeText(entry.source_server || serverName, "", 64) || "Unknown Source",
      };

    if (!existing
      || next.digs > existing.digs
      || (next.digs === existing.digs && next.rank !== null && (existing.rank === null || next.rank < existing.rank))) {
      deduped.set(key, next);
    }
  }

  if (deduped.size === 0) return;

  const existingRows = await getExistingAeternumRows(serverName, Array.from(deduped.keys()), worldId);
  const existingPlayersByUsername = await loadPlayersByUsernameLower(Array.from(deduped.keys()));
  const resolvedPlayersByUsername = new Map<string, ExistingPlayerRow>();

  for (const usernameLower of deduped.keys()) {
    const existingRow = existingRows.get(usernameLower);
    const existingPlayer = existingPlayersByUsername.get(usernameLower);
    const isLocalPlayer = usernameLower === localUsername;
    if (isLocalPlayer || existingRow?.minecraft_uuid_hash || existingPlayer?.minecraft_uuid_hash) {
      continue;
    }

    const resolvedIdentity = await resolveMinecraftIdentityByUsername(usernameLower);
    if (!resolvedIdentity) {
      continue;
    }

    const resolvedPlayer = await upsertResolvedPlayerIdentity(resolvedIdentity);
    resolvedPlayersByUsername.set(usernameLower, resolvedPlayer);
  }

  const existingServerTotal = await getExistingAeternumServerTotal(serverName, worldId);
  const nextServerTotal = Math.max(existingServerTotal, totalDigs);

  const rows = Array.from(deduped.values())
    .sort((a, b) => b.digs - a.digs || (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.username.localeCompare(b.username))
    .map((entry) => {
      const usernameLower = canonicalUsernameKey(entry.username);
      const existing = existingRows.get(usernameLower);
      const matchedPlayer = resolvedPlayersByUsername.get(usernameLower) ?? existingPlayersByUsername.get(usernameLower);
      if (existing?.is_fake_player) {
        return null;
      }
      const isLocalPlayer = usernameLower === localUsername;
      // Full scoreboard snapshots should track the currently visible scoreboard value
      // for that username/source. Keeping a historical max here makes bad reads stick.
      const nextPlayerDigs = entry.digs;
      return {
      source_world_id: worldId,
      player_id: isLocalPlayer ? playerId : matchedPlayer?.id ?? existing?.player_id ?? null,
      minecraft_uuid: isLocalPlayer ? privacy.encryptedMinecraftUuid : matchedPlayer?.minecraft_uuid ?? existing?.minecraft_uuid ?? null,
      minecraft_uuid_hash: isLocalPlayer ? privacy.minecraftUuidHash : matchedPlayer?.minecraft_uuid_hash ?? existing?.minecraft_uuid_hash ?? null,
      username: entry.username,
      username_lower: usernameLower,
      player_digs: nextPlayerDigs,
      total_digs: nextServerTotal > 0 ? nextServerTotal : sanitizeInt(existing?.total_digs),
      server_name: serverName,
      objective_title: objectiveTitle,
      latest_update: latestIso(existing?.latest_update, latestUpdate),
      updated_at: new Date().toISOString(),
    }})
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return;

  // Do not delete players absent from the current snapshot — the scoreboard only shows a
  // limited number of entries (e.g. top 15). Deleting everyone else every sync would
  // permanently lose players who happen to scroll off the visible scoreboard.
  // Fake-player removal is handled above via the filteredFakeUsernames path.
  await upsertAeternumPlayerStats(rows);

  const localRow = rows.find((row) => row.username_lower === localUsername);
  if (localRow) {
    await syncAuthoritativePlayerTotals(playerId, worldId, sanitizeInt(localRow.player_digs));
  }

  logSyncInfo("aeternum leaderboard synced", {
    username: payload.username,
    playerId,
    entryCount: rows.length,
    playerDigs: sanitizeInt(localRow?.player_digs),
    serverTotal: nextServerTotal,
    latestUpdate,
  });
}

async function syncPlayerTotalDigs(
  playerId: string,
  worldId: string | null,
  payload: SyncPayload,
  privacy: PrivacyContext,
  sync: PlayerTotalDigsSync | null | undefined,
) {
  if (!sync) return;
  if (!worldId) return;

  const username = sanitizeUsername(sync.username || resolvePayloadUsername(payload));
  const payloadUsername = resolvePayloadUsername(payload);
  const resolvedUsername = isPlaceholderSyncUsername(username) && payloadUsername ? payloadUsername : username;
  const resolvedUsernameLower = canonicalUsernameKey(resolvedUsername);
  const totalDigs = sanitizeInt(sync.total_digs);
  if (isPlaceholderSyncUsername(resolvedUsername)) {
    logSyncInfo("player-total-digs-skipped-placeholder-username", {
      username,
      payloadUsername,
      playerId,
      worldId,
      totalDigs,
    });
    return;
  }
  if (!resolvedUsername || totalDigs < 0) return;

  const serverName = resolveScoreboardServerName(sync.server, payload.world);
  const objectiveTitle = sanitizeText(sync.objective_title, "Scoreboard", 64);
  const latestUpdate = sync.timestamp && isIsoDate(sync.timestamp) ? sync.timestamp : new Date().toISOString();

  logSyncInfo("player-total-digs-request-parsed", {
    payloadUsername,
    username: resolvedUsername,
    playerId,
    worldId,
    totalDigs,
    serverName,
    objectiveTitle,
    latestUpdate,
  });

  const existing = await runStage(
    "player-total-digs-existing-row-fetched",
    { payloadUsername, username: resolvedUsername, playerId, worldId, table: "aeternum_player_stats", operation: "select-player-world-scoreboard-row" },
    async () => {
      const result = await supabase
        .from("aeternum_player_stats")
        .select("player_digs,total_digs,is_fake_player")
        .eq("username_lower", resolvedUsernameLower)
        .eq("source_world_id", worldId)
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
  );
  if (existing?.is_fake_player) {
    logSyncInfo("player-total-digs-skipped-fake-player", { username: resolvedUsername, playerId, worldId });
    return;
  }

  const existingPlayerDigs = sanitizeInt(existing?.player_digs);
  const existingServerTotal = sanitizeInt(existing?.total_digs);
  const nextPlayerDigs = totalDigs > 0 ? Math.max(existingPlayerDigs, totalDigs) : existingPlayerDigs;

  await runStage(
    "player-total-digs-scoreboard-row-upserted",
    { username: resolvedUsername, playerId, worldId, existingPlayerDigs, totalDigs, nextPlayerDigs, existingServerTotal, table: "aeternum_player_stats", operation: "upsert-player-scoreboard-row" },
    () => upsertAeternumPlayerStats({
      source_world_id: worldId,
      player_id: playerId,
      minecraft_uuid: privacy.encryptedMinecraftUuid,
      minecraft_uuid_hash: privacy.minecraftUuidHash,
      username: resolvedUsername,
      username_lower: resolvedUsernameLower,
      player_digs: nextPlayerDigs,
      total_digs: existingServerTotal,
      server_name: serverName,
      objective_title: objectiveTitle,
      latest_update: latestUpdate,
      updated_at: new Date().toISOString(),
    }),
  );

  await runStage(
    "player-total-digs-authoritative-score-submitted",
    { username: resolvedUsername, playerId, worldId, nextPlayerDigs, rpc: "submit_source_score", tables: ["sources", "leaderboard_entries"] },
    () => syncAuthoritativePlayerTotals(playerId, worldId, nextPlayerDigs),
  );

  logSyncInfo("player total digs synced", {
    username: resolvedUsername,
    playerId,
    playerDigs: nextPlayerDigs,
    serverTotal: existingServerTotal,
    latestUpdate,
  });
}

async function recomputePlayerTotals(playerId: string, lifetimeTotals?: SyncLifetimeTotals | null) {
  logSyncInfo("player totals recompute queries started", {
    playerId,
    tables: ["mining_sessions", "player_world_stats", "aeternum_player_stats", "worlds_or_servers", PLAYER_TABLE],
  });

  const { data: sessions, error } = await supabase
    .from("mining_sessions")
    .select("total_blocks,active_seconds")
    .eq("player_id", playerId)
    .eq("status", "ended")
    .gte("active_seconds", MIN_SESSION_DURATION_SECONDS)
    .not("ended_at", "is", null);
  if (error) throw error;

  const { data: worldStats, error: worldStatsError } = await supabase
    .from("player_world_stats")
    .select("total_blocks,total_sessions,total_play_seconds,world_id")
    .eq("player_id", playerId);
  if (worldStatsError) throw worldStatsError;

  const { data: aeternumStats, error: aeternumStatsError } = await supabase
    .from("aeternum_player_stats")
    .select("player_digs,source_world_id,server_name")
    .eq("player_id", playerId)
    .eq("is_fake_player", false);
  if (aeternumStatsError) throw aeternumStatsError;

  const worldStatWorldIds = (worldStats ?? [])
    .map((row) => sanitizeText((row as { world_id?: string | null }).world_id ?? "", "", 128))
    .filter(Boolean);
  const scoreboardWorldIds = (aeternumStats ?? [])
    .map((row) => sanitizeText((row as { source_world_id?: string | null }).source_world_id ?? "", "", 128))
    .filter(Boolean);
  const worldIds = Array.from(new Set([...worldStatWorldIds, ...scoreboardWorldIds]));
  const worldsById = new Map<string, {
    world_key?: string | null;
    display_name?: string | null;
    host?: string | null;
    source_scope?: string | null;
    approval_status?: string | null;
  }>();
  if (worldIds.length > 0) {
    const { data: worlds, error: worldsError } = await supabase
      .from("worlds_or_servers")
      .select("id,world_key,display_name,host,source_scope,approval_status")
      .in("id", worldIds);
    if (worldsError) throw worldsError;
    for (const world of worlds ?? []) {
      worldsById.set(world.id as string, {
        world_key: (world as { world_key?: string | null }).world_key ?? null,
        display_name: (world as { display_name?: string | null }).display_name ?? null,
        host: (world as { host?: string | null }).host ?? null,
        source_scope: (world as { source_scope?: string | null }).source_scope ?? null,
        approval_status: (world as { approval_status?: string | null }).approval_status ?? null,
      });
    }
  }

  const endedSessionBlocks = (sessions ?? []).reduce((sum, row) => sum + sanitizeInt(row.total_blocks), 0);
  const endedSessionPlaySeconds = (sessions ?? []).reduce((sum, row) => sum + sanitizeInt(row.active_seconds, 0, 31_536_000), 0);
  const scoreboardBackedWorldIds = new Set(
    (aeternumStats ?? [])
      .map((row) => sanitizeText((row as { source_world_id?: string | null }).source_world_id ?? "", "", 128))
      .filter(Boolean),
  );
  const visibleWorldStats = (worldStats ?? []).filter((row) => {
    if (scoreboardBackedWorldIds.has(row.world_id as string)) {
      return false;
    }
    const world = worldsById.get(row.world_id as string);
    return isWorldCountableForPlayerTotal(world);
  });
  const worldBlocks = visibleWorldStats.reduce((sum, row) => sum + sanitizeInt(row.total_blocks), 0);
  const worldSessions = visibleWorldStats.reduce((sum, row) => sum + sanitizeInt(row.total_sessions, 0, 10_000_000), 0);
  const worldPlaySeconds = visibleWorldStats.reduce((sum, row) => sum + sanitizeInt(row.total_play_seconds, 0, 31_536_000), 0);
  const scoreboardBlocksBySource = new Map<string, number>();
  for (const row of (aeternumStats ?? [])) {
    const sourceWorldId = sanitizeText((row as { source_world_id?: string | null }).source_world_id ?? "", "", 128);
    const serverName = sanitizeText((row as { server_name?: string | null }).server_name ?? "", "", 64);
    const sourceKey = sourceWorldId || serverName;
    if (!sourceKey) {
      continue;
    }

    const world = sourceWorldId ? worldsById.get(sourceWorldId) : null;
    const visible = isWorldCountableForPlayerTotal(world);

    if (!visible) {
      continue;
    }

    const nextBlocks = sanitizeInt((row as { player_digs?: number | null }).player_digs);
    const existing = scoreboardBlocksBySource.get(sourceKey) ?? 0;
    if (nextBlocks > existing) {
      scoreboardBlocksBySource.set(sourceKey, nextBlocks);
    }
  }

  const scoreboardBlocks = Array.from(scoreboardBlocksBySource.values()).reduce((sum, value) => sum + value, 0);
  const sourceBackedBlocks = worldBlocks + scoreboardBlocks;
  const lifetimeBlocks = lifetimeTotals?.total_blocks != null
    ? sanitizeInt(lifetimeTotals.total_blocks)
    : 0;
  const totalBlocks = Math.max(sourceBackedBlocks, lifetimeBlocks, endedSessionBlocks);
  const totalPlaySeconds = lifetimeTotals?.total_play_seconds != null
    ? Math.max(endedSessionPlaySeconds, worldPlaySeconds, sanitizeInt(lifetimeTotals.total_play_seconds, 0, 315_360_000))
    : Math.max(endedSessionPlaySeconds, worldPlaySeconds);
  const totalSessions = lifetimeTotals?.total_sessions != null
    ? Math.max(sessions?.length ?? 0, worldSessions, sanitizeInt(lifetimeTotals.total_sessions, 0, 10_000_000))
    : Math.max(sessions?.length ?? 0, worldSessions);

  const { error: updateError } = await supabase
    .from(PLAYER_TABLE)
    .update({
      total_synced_blocks: totalBlocks,
      total_play_seconds: totalPlaySeconds,
      total_sessions: totalSessions,
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", playerId);
  if (updateError) throw updateError;

  logSyncInfo("player totals recomputed", {
    playerId,
    totalBlocks,
    lifetimeBlocks: lifetimeTotals?.total_blocks ?? null,
    worldBlocks,
    sessionBlocks: endedSessionBlocks,
    scoreboardBlocks,
    scoreboardRows: (aeternumStats ?? []).length,
    loadedWorlds: worldsById.size,
    worldStatWorlds: worldStatWorldIds.length,
    scoreboardWorlds: scoreboardWorldIds.length,
    totalSessions,
  });
}

Deno.serve(async (request) => {
  const allowedOrigin = resolveAllowedOrigin(request);
  const securityHeaders = buildSecurityHeaders(request.headers.get("origin"), allowedOrigin);

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: securityHeaders });
  }

  if (request.method !== "POST") {
    return clientErrorResponse(securityHeaders, 405, "Method not allowed.");
  }

  if (request.headers.get("origin") && !allowedOrigin) {
    return clientErrorResponse(securityHeaders, 400, "Origin is not allowed.");
  }

  if (!requireSecurityConfiguration()) {
    logSecurityEvent("aetweaks-sync missing required security configuration");
    return clientErrorResponse(securityHeaders, 500, "Server security configuration is incomplete.");
  }

  let payload: SyncPayload;
  try {
    payload = await request.json();
  } catch {
    return clientErrorResponse(securityHeaders, 400, "Invalid JSON body.");
  }

  const validationError = validatePayload(payload);
  if (validationError) {
    return clientErrorResponse(securityHeaders, 400, validationError);
  }
  logSyncInfo("payload-validated", {
    username: sanitizeUsername(payload.username),
    hasWorld: Boolean(payload.world),
    hasSession: Boolean(payload.session),
  });

  try {
    const privacy = await buildPrivacyContext(payload);
    logSyncInfo("privacy-context-built", {
      username: sanitizeUsername(payload.username),
      hasUuidHash: Boolean(privacy.minecraftUuidHash),
      hasEncryptedUuid: Boolean(privacy.encryptedMinecraftUuid),
    });
    const authDecision = await evaluateSyncAuth(request, payload, privacy);
    if (!authDecision.allowed) {
      logSecurityEvent("aetweaks-sync rejected request", {
        cause: authDecision.cause,
        hasSecretConfigured: Boolean(syncSecret.trim()),
        hasProvidedSecret: Boolean((request.headers.get("x-sync-secret") ?? "").trim()),
        hasMinecraftUuid: Boolean(payload.minecraft_uuid),
        username: sanitizeUsername(payload.username),
      });
      const message = authDecision.cause === "missing_uuid_for_linked_fallback"
        ? "Unauthorized: missing shared secret and no linked UUID for fallback."
        : authDecision.cause === "linked_identity_lookup_unavailable"
        ? "Unauthorized: linked identity fallback unavailable."
        : "Unauthorized: missing shared secret and no linked identity match.";
      return clientErrorResponse(securityHeaders, 401, message);
    }

    logSyncInfo("sync auth accepted", {
      mode: authDecision.mode,
      username: sanitizeUsername(payload.username),
      hasProvidedSecret: Boolean((request.headers.get("x-sync-secret") ?? "").trim()),
      hasLinkedUuid: Boolean(privacy.minecraftUuidHash),
    });

    const allowed = await enforceRateLimit(request, privacy);
    if (!allowed) {
      return clientErrorResponse(securityHeaders, 429, "Too many requests. Please retry later.");
    }
    logSyncInfo("rate-limit-passed", {
      username: sanitizeUsername(payload.username),
      mode: authDecision.mode,
    });

    logSyncInfo("sync request received", {
      username: sanitizeUsername(payload.username),
      hasSession: Boolean(payload.session),
      hasSourceScan: Boolean(payload.source_scan?.compatible || payload.source_scan?.scoreboard_title || payload.source_scan?.sample_sidebar_lines?.length),
      hasAeternumLeaderboard: Boolean(payload.aeternum_leaderboard?.entries?.length),
      hasPlayerTotalDigs: Boolean(payload.player_total_digs),
      lifetimeBlocks: sanitizeInt(payload.lifetime_totals?.total_blocks),
      worldBlocks: sanitizeInt(payload.current_world_totals?.total_blocks),
    });
    logSyncInfo("payload totals parsed", {
      username: sanitizeUsername(payload.username),
      lifetimeTotalsPresent: Boolean(payload.lifetime_totals),
      lifetimeBlocksRaw: payload.lifetime_totals?.total_blocks ?? null,
      lifetimeBlocksParsed: sanitizeInt(payload.lifetime_totals?.total_blocks),
      currentWorldTotalsPresent: Boolean(payload.current_world_totals),
      worldBlocksRaw: payload.current_world_totals?.total_blocks ?? null,
      worldBlocksParsed: sanitizeInt(payload.current_world_totals?.total_blocks),
      playerTotalDigsRaw: payload.player_total_digs?.total_digs ?? null,
      playerTotalDigsParsed: sanitizeInt(payload.player_total_digs?.total_digs),
    });

    const player = await runStage(
      "player-upserted",
      { username: sanitizeUsername(payload.username), tables: [PLAYER_TABLE, "connected_accounts"], operation: "upsert-player-identity" },
      () => upsertPlayer(payload, payload.world ?? null, privacy),
    );
    const world = await runStage(
      "world-upserted",
      { username: sanitizeUsername(payload.username), playerId: player.id, table: "worlds_or_servers", operation: "upsert-world" },
      () => upsertWorld(player.id, payload.world ?? null, payload.source_scan),
    );
    const sessionResult = await runStage(
      "session-upserted",
      { username: sanitizeUsername(payload.username), playerId: player.id, worldId: world?.id ?? null, tables: ["mining_sessions", "session_block_breakdown", "session_rate_points"], operation: "upsert-session" },
      () => upsertSession(player.id, world?.id ?? null, payload.session ?? null),
    );
    await runStage(
      "world-stats-updated",
      { username: sanitizeUsername(payload.username), playerId: player.id, worldId: world?.id ?? null, tables: ["player_world_stats", "worlds_or_servers", "sources", "leaderboard_entries"], operation: "upsert-world-stats" },
      () => updateWorldStats(player.id, world?.id ?? null, payload.session ?? null, payload.current_world_totals, sessionResult.countedSession),
    );
    await runStage(
      "projects-synced",
      { username: sanitizeUsername(payload.username), playerId: player.id, table: "projects", operation: "upsert-projects" },
      () => syncProjects(player.id, payload.projects),
    );
    await runStage(
      "daily-goal-synced",
      { username: sanitizeUsername(payload.username), playerId: player.id, table: "daily_goals", operation: "upsert-daily-goal" },
      () => syncDailyGoal(player.id, payload.daily_goal),
    );
    await runStage(
      "stats-synced",
      { username: sanitizeUsername(payload.username), playerId: player.id, table: "synced_stats", operation: "upsert-synced-stats" },
      () => syncStats(player.id, payload.synced_stats),
    );
    await runStage(
      "player-total-digs-synced",
      { username: sanitizeUsername(payload.username), playerId: player.id, worldId: world?.id ?? null, tables: ["aeternum_player_stats", "sources", "leaderboard_entries"], operation: "sync-player-total-digs" },
      () => syncPlayerTotalDigs(player.id, world?.id ?? null, payload, privacy, payload.player_total_digs),
    );
    if (payload.aeternum_leaderboard?.entries?.length) {
      await runStage(
        "aeternum-leaderboard-synced",
        { username: sanitizeUsername(payload.username), playerId: player.id, worldId: world?.id ?? null, tables: ["aeternum_player_stats", PLAYER_TABLE, "sources", "leaderboard_entries"], operation: "sync-aeternum-leaderboard" },
        () => syncAeternumLeaderboard(player.id, world?.id ?? null, payload, privacy, payload.aeternum_leaderboard),
      );
    } else {
      await runStage(
        "aeternum-sidebar-synced",
        { username: sanitizeUsername(payload.username), playerId: player.id, worldId: world?.id ?? null, tables: ["aeternum_player_stats", "sources", "leaderboard_entries"], operation: "sync-aeternum-sidebar" },
        () => syncAeternumSidebar(player.id, world?.id ?? null, payload, privacy, payload.aeternum_sidebar),
      );
    }
    try {
      await runStage(
        "player-totals-recomputed",
        { username: sanitizeUsername(payload.username), playerId: player.id, worldId: world?.id ?? null, tables: ["mining_sessions", "player_world_stats", "aeternum_player_stats", "worlds_or_servers", PLAYER_TABLE], operation: "recompute-player-total" },
        () => recomputePlayerTotals(player.id, payload.lifetime_totals),
      );
    } catch (error) {
      if (error instanceof StageFailure) {
        logSecurityEvent("aetweaks-sync recompute failure", {
          stage: error.stage,
          context: error.context,
          message: error.message,
        });
        logSyncInfo("player-totals-recomputed-failure", {
          username: sanitizeUsername(payload.username),
          playerId: player.id,
          worldId: world?.id ?? null,
          stage: error.stage,
          message: error.message,
        });
        throw error;
      } else {
        throw error;
      }
    }

    logSyncInfo("sync request completed", {
      username: sanitizeUsername(payload.username),
      playerId: player.id,
      worldId: world?.id ?? null,
    });
    logSyncInfo("response-success", {
      username: sanitizeUsername(payload.username),
      playerId: player.id,
      worldId: world?.id ?? null,
    });
    logSyncInfo("final sync success", {
      username: sanitizeUsername(payload.username),
      playerId: player.id,
      worldId: world?.id ?? null,
    });

    if (world?.id && payload.world) {
      await runStage(
        "public-cache-invalidated",
        {
          username: sanitizeUsername(payload.username),
          playerId: player.id,
          worldId: world.id,
          sourceSlug: buildSourceSlug({
            displayName: payload.world.display_name,
            worldKey: payload.world.key,
            host: null,
          }),
          tables: ["mmm_public_snapshots", "admin_audit_log"],
          operation: "invalidate-public-source-snapshots",
        },
        () => invalidatePublicDataSnapshots({
          username: sanitizeUsername(payload.username),
          playerId: player.id,
          worldId: world.id,
          sourceSlug: buildSourceSlug({
            displayName: payload.world?.display_name,
            worldKey: payload.world?.key,
            host: null,
          }),
        }),
      );
    }

    return successResponse(securityHeaders);
  } catch (error) {
    const debugRequested = (request.headers.get("x-aet-debug") ?? "").trim() === "1";
    if (error instanceof StageFailure) {
      logSecurityEvent("aetweaks-sync stage failure", {
        stage: error.stage,
        context: error.context,
        message: error.message,
      });
      if (debugRequested) {
        return clientErrorResponse(
          securityHeaders,
          500,
          `Unable to process the sync request. stage=${error.stage}; message=${error.message}`,
        );
      }
    }
    logSecurityEvent("aetweaks-sync error", error instanceof Error ? error.message : error);
    logSyncInfo("response-failure", {
      username: sanitizeUsername(payload.username),
      error: error instanceof StageFailure ? `${error.stage}: ${error.message}` : (error instanceof Error ? error.message : String(error)),
    });
    if (debugRequested) {
      const errorMessage = error instanceof StageFailure
        ? `${error.stage}: ${error.message}`
        : (error instanceof Error ? error.message : String(error));
      return clientErrorResponse(securityHeaders, 500, `Unable to process the sync request. error=${errorMessage}`);
    }
    return clientErrorResponse(securityHeaders, 500, "Unable to process the sync request.");
  }
});
