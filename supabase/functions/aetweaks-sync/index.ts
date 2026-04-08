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

interface SyncPayload {
  client_id: string;
  minecraft_uuid?: string | null;
  username: string;
  mod_version?: string | null;
  minecraft_version?: string | null;
  world?: SyncWorld | null;
  lifetime_totals?: SyncLifetimeTotals | null;
  current_world_totals?: SyncCurrentWorldTotals | null;
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
};

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const MAX_LEADERBOARD_ENTRIES = 50;
const MAX_PROJECTS = 25;
const MAX_BREAKDOWN_ENTRIES = 128;
const MAX_RATE_POINTS = 720;

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

function sanitizeUsername(value: unknown) {
  const username = sanitizeText(value, "", 16);
  return /^[A-Za-z0-9_]{3,16}$/.test(username) ? username : "";
}

function isIsoDate(value: string) {
  return !Number.isNaN(Date.parse(value));
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

  if ((payload.aeternum_leaderboard?.entries?.length ?? 0) > MAX_LEADERBOARD_ENTRIES) {
    return "Leaderboard payload is too large.";
  }

  return null;
}

async function buildPrivacyContext(payload: SyncPayload): Promise<PrivacyContext> {
  return {
    clientIdHash: await hashDeterministic(payload.client_id, deterministicHashSecret),
    encryptedMinecraftUuid: payload.minecraft_uuid
      ? await encryptAtRest(payload.minecraft_uuid, encryptionKeys, primaryEncryptionKeyId)
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

async function upsertPlayer(payload: SyncPayload, world: SyncWorld | null, privacy: PrivacyContext) {
  const row = {
    client_id: privacy.clientIdHash,
    minecraft_uuid: privacy.encryptedMinecraftUuid,
    username: sanitizeUsername(payload.username),
    last_mod_version: sanitizeText(payload.mod_version, "", 32) || null,
    last_minecraft_version: sanitizeText(payload.minecraft_version, "", 32) || null,
    last_server_name: sanitizeText(world?.display_name, "", 64) || null,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("players")
    .upsert(row, { onConflict: "client_id" })
    .select("id")
    .single();

  if (error) throw error;
  return data as { id: string };
}

async function upsertWorld(world: SyncWorld | null) {
  if (!world) return null;

  const { data, error } = await supabase
    .from("worlds_or_servers")
    .upsert({
      world_key: sanitizeText(world.key, "", 128),
      display_name: sanitizeText(world.display_name, "Unknown World", 64),
      kind: world.kind,
      host: null,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "world_key" })
    .select("id")
    .single();

  if (error) throw error;
  return data as { id: string };
}

async function upsertSession(playerId: string, worldId: string | null, session: SyncSession | null) {
  if (!session) return { sessionId: null };

  const { data, error } = await supabase
    .from("mining_sessions")
    .upsert({
      player_id: playerId,
      world_id: worldId,
      session_key: sanitizeText(session.session_key, "", 128),
      started_at: session.started_at,
      ended_at: session.ended_at ?? null,
      active_seconds: sanitizeInt(session.active_seconds, 0, 31_536_000),
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

  return { sessionId };
}

async function updateWorldStats(playerId: string, worldId: string | null, session: SyncSession | null, worldTotals: SyncCurrentWorldTotals | null | undefined) {
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
  const nextTotalSessions = session && session.status === "ended"
    ? sanitizeInt(row.total_sessions, 0, 10_000_000) + 1
    : sanitizeInt(row.total_sessions, 0, 10_000_000);
  const nextTotalPlaySeconds = session && session.status === "ended"
    ? sanitizeInt(row.total_play_seconds, 0, 31_536_000) + sanitizeInt(session.active_seconds, 0, 31_536_000)
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

  const username = sanitizeUsername(payload.username);
  const playerDigs = sanitizeInt(snapshot.player_digs);
  const totalDigs = sanitizeInt(snapshot.total_digs);
  if (!username || playerDigs <= 0 || totalDigs < playerDigs) return;

  const latestUpdate = snapshot.captured_at && isIsoDate(snapshot.captured_at)
    ? snapshot.captured_at
    : new Date().toISOString();

  const { error } = await supabase
    .from("aeternum_player_stats")
    .upsert({
      player_id: playerId,
      minecraft_uuid: privacy.encryptedMinecraftUuid,
      username,
      username_lower: username.toLowerCase(),
      player_digs: playerDigs,
      total_digs: totalDigs,
      server_name: sanitizeText(snapshot.server_name, "Aeternum", 64),
      objective_title: sanitizeText(snapshot.objective_title, "Aeternum", 64),
      latest_update: latestUpdate,
      updated_at: new Date().toISOString(),
    }, { onConflict: "username_lower,server_name" });

  if (error) throw error;
}

async function syncAeternumLeaderboard(playerId: string, payload: SyncPayload, privacy: PrivacyContext, leaderboard: AeternumLeaderboardSync | null | undefined) {
  if (!leaderboard?.entries?.length) return;

  const serverName = sanitizeText(leaderboard.server_name, "Aeternum", 64);
  const objectiveTitle = sanitizeText(leaderboard.objective_title, "Aeternum", 64);
  const latestUpdate = leaderboard.captured_at && isIsoDate(leaderboard.captured_at)
    ? leaderboard.captured_at
    : new Date().toISOString();
  const totalDigs = sanitizeInt(leaderboard.total_digs);
  const localUsername = sanitizeUsername(payload.username).toLowerCase();

  const deduped = new Map<string, {
    username: string;
    digs: number;
    rank: number | null;
    sourceServer: string;
  }>();

  for (const entry of leaderboard.entries.slice(0, MAX_LEADERBOARD_ENTRIES)) {
    const username = sanitizeUsername(entry.username);
    const digs = sanitizeInt(entry.digs);
    if (!username || digs <= 0) continue;

    const nextRank = entry.rank == null ? null : sanitizeInt(entry.rank, 0, 10_000);
    const key = username.toLowerCase();
    const existing = deduped.get(key);
    const next = {
      username,
      digs,
      rank: nextRank && nextRank > 0 ? nextRank : null,
      sourceServer: sanitizeText(entry.source_server, serverName, 64) || serverName,
    };

    if (!existing
      || next.digs > existing.digs
      || (next.digs === existing.digs && next.rank !== null && (existing.rank === null || next.rank < existing.rank))) {
      deduped.set(key, next);
    }
  }

  if (deduped.size === 0) return;

  const rows = Array.from(deduped.values())
    .sort((a, b) => b.digs - a.digs || (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.username.localeCompare(b.username))
    .map((entry) => ({
      player_id: entry.username.toLowerCase() === localUsername ? playerId : null,
      minecraft_uuid: entry.username.toLowerCase() === localUsername ? privacy.encryptedMinecraftUuid : null,
      username: entry.username,
      username_lower: entry.username.toLowerCase(),
      player_digs: entry.digs,
      total_digs: totalDigs || null,
      server_name: serverName,
      objective_title: objectiveTitle,
      latest_update: latestUpdate,
      updated_at: new Date().toISOString(),
    }));

  const { error } = await supabase.from("aeternum_player_stats").upsert(rows, { onConflict: "username_lower,server_name" });
  if (error) throw error;
}

async function syncPlayerTotalDigs(playerId: string, payload: SyncPayload, privacy: PrivacyContext, sync: PlayerTotalDigsSync | null | undefined) {
  if (!sync) return;

  const username = sanitizeUsername(sync.username || payload.username);
  const totalDigs = sanitizeInt(sync.total_digs);
  if (!username || totalDigs < 0) return;

  const serverName = sanitizeText(sync.server, "Aeternum", 64);
  const objectiveTitle = sanitizeText(sync.objective_title, "Aeternum", 64);
  const latestUpdate = sync.timestamp && isIsoDate(sync.timestamp) ? sync.timestamp : new Date().toISOString();

  const existing = await supabase
    .from("aeternum_player_stats")
    .select("player_digs,total_digs")
    .eq("username_lower", username.toLowerCase())
    .eq("server_name", serverName)
    .maybeSingle();

  if (existing.error) throw existing.error;

  const existingPlayerDigs = sanitizeInt(existing.data?.player_digs);
  const existingServerTotal = sanitizeInt(existing.data?.total_digs);
  const nextPlayerDigs = totalDigs > 0 ? Math.max(existingPlayerDigs, totalDigs) : existingPlayerDigs;

  const { error } = await supabase
    .from("aeternum_player_stats")
    .upsert({
      player_id: playerId,
      minecraft_uuid: privacy.encryptedMinecraftUuid,
      username,
      username_lower: username.toLowerCase(),
      player_digs: nextPlayerDigs,
      total_digs: existingServerTotal > 0 ? existingServerTotal : null,
      server_name: serverName,
      objective_title: objectiveTitle,
      latest_update: latestUpdate,
      updated_at: new Date().toISOString(),
    }, { onConflict: "username_lower,server_name" });

  if (error) throw error;
}

async function recomputePlayerTotals(playerId: string, lifetimeTotals?: SyncLifetimeTotals | null) {
  const { data: sessions, error } = await supabase
    .from("mining_sessions")
    .select("total_blocks,active_seconds")
    .eq("player_id", playerId)
    .eq("status", "ended");
  if (error) throw error;

  const { data: worldStats, error: worldStatsError } = await supabase
    .from("player_world_stats")
    .select("total_blocks,total_sessions,total_play_seconds")
    .eq("player_id", playerId);
  if (worldStatsError) throw worldStatsError;

  const endedSessionBlocks = (sessions ?? []).reduce((sum, row) => sum + sanitizeInt(row.total_blocks), 0);
  const endedSessionPlaySeconds = (sessions ?? []).reduce((sum, row) => sum + sanitizeInt(row.active_seconds, 0, 31_536_000), 0);
  const worldBlocks = (worldStats ?? []).reduce((sum, row) => sum + sanitizeInt(row.total_blocks), 0);
  const worldSessions = (worldStats ?? []).reduce((sum, row) => sum + sanitizeInt(row.total_sessions, 0, 10_000_000), 0);
  const worldPlaySeconds = (worldStats ?? []).reduce((sum, row) => sum + sanitizeInt(row.total_play_seconds, 0, 31_536_000), 0);

  const totalBlocks = lifetimeTotals?.total_blocks != null
    ? Math.max(endedSessionBlocks, worldBlocks, sanitizeInt(lifetimeTotals.total_blocks))
    : Math.max(endedSessionBlocks, worldBlocks);
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

    const player = await upsertPlayer(payload, payload.world ?? null, privacy);
    const world = await upsertWorld(payload.world ?? null);
    await upsertSession(player.id, world?.id ?? null, payload.session ?? null);
    await updateWorldStats(player.id, world?.id ?? null, payload.session ?? null, payload.current_world_totals);
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

    return successResponse(securityHeaders);
  } catch (error) {
    logSecurityEvent("aetweaks-sync error", error instanceof Error ? error.message : error);
    return clientErrorResponse(securityHeaders, 500, "Unable to process the sync request.");
  }
});
