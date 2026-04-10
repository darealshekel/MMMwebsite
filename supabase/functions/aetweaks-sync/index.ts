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
import { normalizeFilteredFakeUsernames, shouldIncludeLeaderboardUsername } from "../../../shared/leaderboard-ingestion.ts";
import { isQualifyingCompletedSession, MIN_SESSION_DURATION_SECONDS, normalizeSessionDurationSeconds } from "../../../shared/session-filters.ts";

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

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const REJECTED_SOURCE_REVIEW_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ACCEPTED_LEADERBOARD_ENTRIES = 512;
const MAX_PROJECTS = 25;
const MAX_BREAKDOWN_ENTRIES = 128;
const MAX_RATE_POINTS = 720;
const MAX_SOURCE_SCAN_LINES = 12;
const MAX_SOURCE_SCAN_FIELDS = 16;

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
  return value.trim().replace(/[\u0000-\u001F\u007F]/g, "").slice(0, maxLength);
}

function sanitizeTextList(values: unknown, maxItems: number, maxLength = 160) {
  if (!Array.isArray(values)) return [];
  return values
    .slice(0, maxItems)
    .map((value) => sanitizeText(value, "", maxLength))
    .filter(Boolean);
}

function sanitizeUsername(value: unknown) {
  const username = sanitizeText(value, "", 16);
  return /^[A-Za-z0-9_]{3,16}$/.test(username) ? username : "";
}

function canonicalAeternumServerName(_value: unknown) {
  return "Aeternum";
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

function isCanonicalAeternumWorld(world: SyncWorld | null | undefined) {
  const displayName = sanitizeText(world?.display_name, "", 64).toLowerCase();
  const worldKey = sanitizeText(world?.key, "", 128).toLowerCase();
  const host = sanitizeText(world?.host, "", 128).toLowerCase();

  return displayName === "aeternum"
    || worldKey === "aeternum"
    || worldKey === "play.aeternum.net"
    || worldKey === "mc.aeternumsmp.net"
    || host === "play.aeternum.net"
    || host === "mc.aeternumsmp.net";
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

  if (!sanitizeUsername(payload.username)) {
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

type ExistingPlayerRow = {
  id: string;
  client_id?: string | null;
  minecraft_uuid?: string | null;
  minecraft_uuid_hash?: string | null;
  username?: string | null;
  username_lower?: string | null;
  last_seen_at?: string | null;
};

async function findCanonicalPlayer(payload: SyncPayload, privacy: PrivacyContext) {
  const username = sanitizeUsername(payload.username);
  const usernameLower = username.toLowerCase();

  const byClient = await supabase
    .from("players")
    .select("id,client_id,minecraft_uuid,minecraft_uuid_hash,username,username_lower,last_seen_at")
    .eq("client_id", privacy.clientIdHash)
    .maybeSingle();

  if (byClient.error) throw byClient.error;
  if (byClient.data) {
    logSyncInfo("player matched by client id", {
      username,
      playerId: byClient.data.id,
    });
    return byClient.data as ExistingPlayerRow;
  }

  if (privacy.minecraftUuidHash) {
    const byUuid = await supabase
      .from("players")
      .select("id,client_id,minecraft_uuid,minecraft_uuid_hash,username,username_lower,last_seen_at")
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
  }

  if (usernameLower) {
    const aeternumRows = await getExistingAeternumRows(canonicalAeternumServerName(null), [usernameLower]);
    const aeternum = aeternumRows.get(usernameLower);
    if (aeternum?.player_id) {
      const byAeternum = await supabase
        .from("players")
        .select("id,client_id,minecraft_uuid,minecraft_uuid_hash,username,username_lower,last_seen_at")
        .eq("id", aeternum.player_id)
        .maybeSingle();

      if (byAeternum.error) throw byAeternum.error;
      if (byAeternum.data) {
        logSyncInfo("player matched by aeternum row", {
          username,
          playerId: byAeternum.data.id,
        });
        return byAeternum.data as ExistingPlayerRow;
      }
    }

    const byUsername = await supabase
      .from("players")
      .select("id,client_id,minecraft_uuid,minecraft_uuid_hash,username,username_lower,last_seen_at")
      .eq("username_lower", usernameLower)
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

  return null;
}

async function upsertPlayer(payload: SyncPayload, world: SyncWorld | null, privacy: PrivacyContext) {
  const username = sanitizeUsername(payload.username);
  const usernameLower = username.toLowerCase();
  const nowIso = new Date().toISOString();
  const canonicalPlayer = await findCanonicalPlayer(payload, privacy);
  const row: Record<string, Json> = {
    client_id: privacy.clientIdHash,
    username,
    last_mod_version: sanitizeText(payload.mod_version, "", 32) || null,
    last_minecraft_version: sanitizeText(payload.minecraft_version, "", 32) || null,
    last_server_name: sanitizeText(world?.display_name, "", 64) || null,
    last_seen_at: nowIso,
    updated_at: nowIso,
  };

  if (privacy.encryptedMinecraftUuid) {
    row.minecraft_uuid = privacy.encryptedMinecraftUuid;
  }
  if (privacy.minecraftUuidHash) {
    row.minecraft_uuid_hash = privacy.minecraftUuidHash;
  }

  const query = canonicalPlayer
    ? supabase.from("players").update(row).eq("id", canonicalPlayer.id)
    : supabase.from("players").upsert(row, { onConflict: "client_id" });

  const { data, error } = await query.select("id").single();
  if (error) throw error;
  return data as { id: string };
}

type ExistingAeternumRow = {
  player_id?: string | null;
  minecraft_uuid?: string | null;
  minecraft_uuid_hash?: string | null;
  username_lower: string;
  player_digs?: number | null;
  total_digs?: number | null;
  latest_update?: string | null;
  is_fake_player?: boolean | null;
};

async function getExistingAeternumRows(serverName: string, usernamesLower: string[]) {
  if (usernamesLower.length === 0) {
    return new Map<string, ExistingAeternumRow>();
  }

  const { data, error } = await supabase
    .from("aeternum_player_stats")
    .select("player_id,minecraft_uuid,minecraft_uuid_hash,username_lower,player_digs,total_digs,latest_update,is_fake_player")
    .eq("server_name", serverName)
    .in("username_lower", usernamesLower);

  if (error) throw error;

  return new Map(
    ((data ?? []) as ExistingAeternumRow[]).map((row) => [row.username_lower, row]),
  );
}

async function getExistingAeternumServerTotal(serverName: string) {
  const { data, error } = await supabase
    .from("aeternum_player_stats")
    .select("total_digs")
    .eq("server_name", serverName)
    .eq("is_fake_player", false)
    .order("total_digs", { ascending: false })
    .limit(1);

  if (error) throw error;
  return sanitizeInt(data?.[0]?.total_digs);
}

async function syncAuthoritativePlayerTotals(playerId: string, authoritativeBlocks: number, syncedAt: string) {
  if (authoritativeBlocks <= 0) {
    return;
  }

  const existing = await supabase
    .from("players")
    .select("total_synced_blocks")
    .eq("id", playerId)
    .maybeSingle();

  if (existing.error) throw existing.error;

  const nextBlocks = Math.max(sanitizeInt(existing.data?.total_synced_blocks), authoritativeBlocks);
  const { error: updateError } = await supabase
    .from("players")
    .update({
      total_synced_blocks: nextBlocks,
      last_seen_at: syncedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playerId);

  if (updateError) throw updateError;

  const leaderboardRows = [
    {
      player_id: playerId,
      leaderboard_type: "aeternum",
      score: nextBlocks,
      updated_at: new Date().toISOString(),
    },
  ];

  const { error: leaderboardError } = await supabase
    .from("leaderboard_entries")
    .upsert(leaderboardRows, { onConflict: "player_id,leaderboard_type" });

  if (leaderboardError) throw leaderboardError;
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
  if (isCanonicalAeternumWorld(world)) {
    return { sourceScope: "public_server", approvalStatus: "approved" };
  }

  if (world.kind === "singleplayer") {
    return { sourceScope: "private_singleplayer", approvalStatus: "approved" };
  }

  if (!isServerLikeKind(world.kind)) {
    return { sourceScope: "unsupported", approvalStatus: "rejected" };
  }

  if (!scan?.compatible) {
    return {
      sourceScope: existing?.source_scope ? normalizeSourceScope(existing.source_scope) : "unsupported",
      approvalStatus: (existing?.approval_status as "pending" | "approved" | "rejected" | undefined) ?? "rejected",
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
  const canonicalAeternum = isCanonicalAeternumWorld(world);
  const worldKey = canonicalAeternum ? "mc.aeternumsmp.net" : sanitizeText(world.key, "", 128);
  const displayName = canonicalAeternum ? "Aeternum" : sanitizeText(world.display_name, "Unknown World", 64);
  const host = canonicalAeternum ? "mc.aeternumsmp.net" : (sanitizeText(world.host, "", 128) || null);

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

async function syncAeternumSidebar(playerId: string, payload: SyncPayload, privacy: PrivacyContext, snapshot: AeternumSidebarSync | null | undefined) {
  if (!snapshot) return;
  if (!isCanonicalAeternumWorld(payload.world)) return;

  const username = sanitizeUsername(payload.username);
  const playerDigs = sanitizeInt(snapshot.player_digs);
  const totalDigs = sanitizeInt(snapshot.total_digs);
  if (!username || playerDigs <= 0) return;

  const latestUpdate = snapshot.captured_at && isIsoDate(snapshot.captured_at)
    ? snapshot.captured_at
    : new Date().toISOString();
  const serverName = canonicalAeternumServerName(snapshot.server_name);
  const existingRows = await getExistingAeternumRows(serverName, [username.toLowerCase()]);
  const existing = existingRows.get(username.toLowerCase());
  if (existing?.is_fake_player) return;
  const existingServerTotal = Math.max(
    sanitizeInt(existing?.total_digs),
    await getExistingAeternumServerTotal(serverName),
  );
  const nextPlayerDigs = Math.max(sanitizeInt(existing?.player_digs), playerDigs);
  const nextServerTotal = totalDigs > 0 && totalDigs >= nextPlayerDigs
    ? Math.max(existingServerTotal, totalDigs)
    : existingServerTotal;

  const { error } = await supabase
    .from("aeternum_player_stats")
    .upsert({
      player_id: playerId,
      minecraft_uuid: privacy.encryptedMinecraftUuid,
      minecraft_uuid_hash: privacy.minecraftUuidHash,
      username,
      username_lower: username.toLowerCase(),
      player_digs: nextPlayerDigs,
      total_digs: nextServerTotal,
      server_name: serverName,
      objective_title: sanitizeText(snapshot.objective_title, "Aeternum", 64),
      latest_update: latestIso(existing?.latest_update, latestUpdate),
      updated_at: new Date().toISOString(),
    }, { onConflict: "username_lower,server_name" });

  if (error) throw error;

  await syncAuthoritativePlayerTotals(playerId, nextPlayerDigs, latestUpdate);

  logSyncInfo("aeternum sidebar synced", {
    username,
    playerId,
    playerDigs: nextPlayerDigs,
    serverTotal: nextServerTotal,
    latestUpdate,
  });
}

async function syncAeternumLeaderboard(playerId: string, payload: SyncPayload, privacy: PrivacyContext, leaderboard: AeternumLeaderboardSync | null | undefined) {
  if (!leaderboard?.entries?.length) return;
  if (!isCanonicalAeternumWorld(payload.world)) return;

  const serverName = canonicalAeternumServerName(leaderboard.server_name);
  const objectiveTitle = sanitizeText(leaderboard.objective_title, "Aeternum", 64);
  const latestUpdate = leaderboard.captured_at && isIsoDate(leaderboard.captured_at)
    ? leaderboard.captured_at
    : new Date().toISOString();
  const totalDigs = sanitizeInt(leaderboard.total_digs);
  const localUsername = sanitizeUsername(payload.username).toLowerCase();
  const filteredFakeUsernames = normalizeFilteredFakeUsernames(
    leaderboard.filtered_fake_usernames,
    sanitizeText,
    MAX_ACCEPTED_LEADERBOARD_ENTRIES,
  );

  if (filteredFakeUsernames.length > 0) {
    const { error: markFakeRowsError } = await supabase
      .from("aeternum_player_stats")
      .update({ is_fake_player: true, player_digs: 0, updated_at: new Date().toISOString() })
      .eq("server_name", serverName)
      .in("username_lower", filteredFakeUsernames);
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

    const nextRank = entry.rank == null ? null : sanitizeInt(entry.rank, 0, 10_000);
    const key = username.toLowerCase();
    if (shouldIncludeLeaderboardUsername(key, filteredFakeUsernames) === false) continue;
    const existing = deduped.get(key);
      const next = {
        username,
        digs,
        rank: nextRank && nextRank > 0 ? nextRank : null,
        sourceServer: canonicalAeternumServerName(entry.source_server || serverName),
      };

    if (!existing
      || next.digs > existing.digs
      || (next.digs === existing.digs && next.rank !== null && (existing.rank === null || next.rank < existing.rank))) {
      deduped.set(key, next);
    }
  }

  if (deduped.size === 0) return;

  const existingRows = await getExistingAeternumRows(serverName, Array.from(deduped.keys()));
  const existingServerTotal = await getExistingAeternumServerTotal(serverName);
  const nextServerTotal = Math.max(existingServerTotal, totalDigs);

  const rows = Array.from(deduped.values())
    .sort((a, b) => b.digs - a.digs || (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.username.localeCompare(b.username))
    .map((entry) => {
      const usernameLower = entry.username.toLowerCase();
      const existing = existingRows.get(usernameLower);
      if (existing?.is_fake_player) {
        return null;
      }
      const isLocalPlayer = usernameLower === localUsername;
      const nextPlayerDigs = Math.max(sanitizeInt(existing?.player_digs), entry.digs);
      return {
      player_id: isLocalPlayer ? playerId : existing?.player_id ?? null,
      minecraft_uuid: isLocalPlayer ? privacy.encryptedMinecraftUuid : existing?.minecraft_uuid ?? null,
      minecraft_uuid_hash: isLocalPlayer ? privacy.minecraftUuidHash : existing?.minecraft_uuid_hash ?? null,
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

  const currentSnapshotUsernames = rows.map((row) => row.username_lower);

  const { error: deleteStaleRowsError } = await supabase
    .from("aeternum_player_stats")
    .delete()
    .eq("server_name", serverName)
    .not("username_lower", "in", `(${currentSnapshotUsernames.map((value) => `"${value}"`).join(",")})`);
  if (deleteStaleRowsError) throw deleteStaleRowsError;

  const { error } = await supabase.from("aeternum_player_stats").upsert(rows, { onConflict: "username_lower,server_name" });
  if (error) throw error;

  const localRow = rows.find((row) => row.username_lower === localUsername);
  if (localRow) {
    await syncAuthoritativePlayerTotals(playerId, sanitizeInt(localRow.player_digs), latestUpdate);
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

async function syncPlayerTotalDigs(playerId: string, payload: SyncPayload, privacy: PrivacyContext, sync: PlayerTotalDigsSync | null | undefined) {
  if (!sync) return;

  // Only write to aeternum_player_stats for canonical Aeternum worlds — prevents
  // other servers (e.g. RedTech) from polluting the Aeternum leaderboard.
  if (!isCanonicalAeternumWorld(payload.world)) return;

  const username = sanitizeUsername(sync.username || payload.username);
  const totalDigs = sanitizeInt(sync.total_digs);
  if (!username || totalDigs < 0) return;

  const serverName = canonicalAeternumServerName(sync.server);
  const objectiveTitle = sanitizeText(sync.objective_title, "Aeternum", 64);
  const latestUpdate = sync.timestamp && isIsoDate(sync.timestamp) ? sync.timestamp : new Date().toISOString();

  const existing = await supabase
    .from("aeternum_player_stats")
    .select("player_digs,total_digs,is_fake_player")
    .eq("username_lower", username.toLowerCase())
    .eq("server_name", serverName)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data?.is_fake_player) return;

  const existingPlayerDigs = sanitizeInt(existing.data?.player_digs);
  const existingServerTotal = sanitizeInt(existing.data?.total_digs);
  const nextPlayerDigs = totalDigs > 0 ? Math.max(existingPlayerDigs, totalDigs) : existingPlayerDigs;
  const nextServerTotal = existingServerTotal > 0 ? existingServerTotal : 0;

  const { error } = await supabase
    .from("aeternum_player_stats")
    .upsert({
      player_id: playerId,
      minecraft_uuid: privacy.encryptedMinecraftUuid,
      minecraft_uuid_hash: privacy.minecraftUuidHash,
      username,
      username_lower: username.toLowerCase(),
      player_digs: nextPlayerDigs,
      total_digs: nextServerTotal,
      server_name: serverName,
      objective_title: objectiveTitle,
      latest_update: latestUpdate,
      updated_at: new Date().toISOString(),
    }, { onConflict: "username_lower,server_name" });

  if (error) throw error;

  await syncAuthoritativePlayerTotals(playerId, nextPlayerDigs, latestUpdate);

  logSyncInfo("player total digs synced", {
    username,
    playerId,
    playerDigs: nextPlayerDigs,
    serverTotal: nextServerTotal,
    latestUpdate,
  });
}

async function recomputePlayerTotals(playerId: string, lifetimeTotals?: SyncLifetimeTotals | null) {
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

  const worldIds = (worldStats ?? []).map((row) => row.world_id).filter(Boolean);
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

  const { data: aeternumStats, error: aeternumStatsError } = await supabase
    .from("aeternum_player_stats")
    .select("player_digs")
    .eq("player_id", playerId)
    .eq("is_fake_player", false);
  if (aeternumStatsError) throw aeternumStatsError;

  const endedSessionBlocks = (sessions ?? []).reduce((sum, row) => sum + sanitizeInt(row.total_blocks), 0);
  const endedSessionPlaySeconds = (sessions ?? []).reduce((sum, row) => sum + sanitizeInt(row.active_seconds, 0, 31_536_000), 0);
  const visibleWorldStats = (worldStats ?? []).filter((row) => {
    const world = worldsById.get(row.world_id as string);
    const isCanonicalAeternum = isCanonicalAeternumWorld({
      key: sanitizeText(world?.world_key, "", 128),
      display_name: sanitizeText(world?.display_name, "", 64),
      kind: "multiplayer",
      host: sanitizeText(world?.host, "", 128) || null,
    });
    if (isCanonicalAeternum) {
      return false;
    }
    const scope = normalizeSourceScope(world?.source_scope);
    if (scope === "private_singleplayer") {
      return true;
    }
    return scope === "public_server" && (world?.approval_status ?? "pending") === "approved";
  });
  const worldBlocks = visibleWorldStats.reduce((sum, row) => sum + sanitizeInt(row.total_blocks), 0);
  const worldSessions = visibleWorldStats.reduce((sum, row) => sum + sanitizeInt(row.total_sessions, 0, 10_000_000), 0);
  const worldPlaySeconds = visibleWorldStats.reduce((sum, row) => sum + sanitizeInt(row.total_play_seconds, 0, 31_536_000), 0);
  const aeternumBlocks = (aeternumStats ?? []).reduce((max, row) => Math.max(max, sanitizeInt(row.player_digs)), 0);

  const totalBlocks = worldBlocks + aeternumBlocks;
  const totalPlaySeconds = lifetimeTotals?.total_play_seconds != null
    ? Math.max(endedSessionPlaySeconds, worldPlaySeconds, sanitizeInt(lifetimeTotals.total_play_seconds, 0, 315_360_000))
    : Math.max(endedSessionPlaySeconds, worldPlaySeconds);
  const totalSessions = lifetimeTotals?.total_sessions != null
    ? Math.max(sessions?.length ?? 0, worldSessions, sanitizeInt(lifetimeTotals.total_sessions, 0, 10_000_000))
    : Math.max(sessions?.length ?? 0, worldSessions);

  const { error: updateError } = await supabase
    .from("players")
    .update({
      total_synced_blocks: totalBlocks,
      total_play_seconds: totalPlaySeconds,
      total_sessions: totalSessions,
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", playerId);
  if (updateError) throw updateError;

  const { error: leaderboardError } = await supabase.from("leaderboard_entries").upsert({
    player_id: playerId,
    leaderboard_type: "global",
    score: totalBlocks,
    updated_at: new Date().toISOString(),
  }, { onConflict: "player_id,leaderboard_type" });
  if (leaderboardError) throw leaderboardError;

  if (aeternumBlocks > 0) {
    const { error: aeternumLeaderboardError } = await supabase.from("leaderboard_entries").upsert({
      player_id: playerId,
      leaderboard_type: "aeternum",
      score: aeternumBlocks,
      updated_at: new Date().toISOString(),
    }, { onConflict: "player_id,leaderboard_type" });
    if (aeternumLeaderboardError) throw aeternumLeaderboardError;
  }

  logSyncInfo("player totals recomputed", {
    playerId,
    totalBlocks,
    lifetimeBlocks: lifetimeTotals?.total_blocks ?? null,
    worldBlocks,
    sessionBlocks: endedSessionBlocks,
    aeternumBlocks,
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

  if (syncSecret) {
    const providedSecret = request.headers.get("x-sync-secret") ?? "";
    if (providedSecret !== syncSecret) {
      logSecurityEvent("aetweaks-sync rejected invalid shared secret");
      return clientErrorResponse(securityHeaders, 401, "Unauthorized.");
    }
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

  try {
    const privacy = await buildPrivacyContext(payload);
    const allowed = await enforceRateLimit(request, privacy);
    if (!allowed) {
      return clientErrorResponse(securityHeaders, 429, "Too many requests. Please retry later.");
    }

    logSyncInfo("sync request received", {
      username: sanitizeUsername(payload.username),
      hasSession: Boolean(payload.session),
      hasSourceScan: Boolean(payload.source_scan?.compatible || payload.source_scan?.scoreboard_title || payload.source_scan?.sample_sidebar_lines?.length),
      hasAeternumLeaderboard: Boolean(payload.aeternum_leaderboard?.entries?.length),
      hasPlayerTotalDigs: Boolean(payload.player_total_digs),
      lifetimeBlocks: sanitizeInt(payload.lifetime_totals?.total_blocks),
      worldBlocks: sanitizeInt(payload.current_world_totals?.total_blocks),
    });

    const player = await upsertPlayer(payload, payload.world ?? null, privacy);
    const world = await upsertWorld(player.id, payload.world ?? null, payload.source_scan);
    const sessionResult = await upsertSession(player.id, world?.id ?? null, payload.session ?? null);
    await updateWorldStats(player.id, world?.id ?? null, payload.session ?? null, payload.current_world_totals, sessionResult.countedSession);
    await syncProjects(player.id, payload.projects);
    await syncDailyGoal(player.id, payload.daily_goal);
    await syncStats(player.id, payload.synced_stats);
    await syncPlayerTotalDigs(player.id, payload, privacy, payload.player_total_digs);
    if (payload.aeternum_leaderboard?.entries?.length) {
      await syncAeternumLeaderboard(player.id, payload, privacy, payload.aeternum_leaderboard);
    } else {
    await syncAeternumSidebar(player.id, payload, privacy, payload.aeternum_sidebar);
    }
    await recomputePlayerTotals(player.id, payload.lifetime_totals);

    logSyncInfo("sync request completed", {
      username: sanitizeUsername(payload.username),
      playerId: player.id,
      worldId: world?.id ?? null,
    });

    return successResponse(securityHeaders);
  } catch (error) {
    logSecurityEvent("aetweaks-sync error", error instanceof Error ? error.message : error);
    return clientErrorResponse(securityHeaders, 500, "Unable to process the sync request.");
  }
});
