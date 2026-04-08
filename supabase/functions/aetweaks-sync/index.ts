import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const syncSecret = Deno.env.get("AE_SYNC_SHARED_SECRET") ?? "";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(data: Json, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function sanitizeInt(value: unknown, fallback = 0, max = 1_000_000_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, Math.round(parsed)));
}

function sanitizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function sanitizeUsername(value: unknown) {
  const username = sanitizeText(value);
  return /^[A-Za-z0-9_]{3,16}$/.test(username) ? username : "";
}

function isIsoDate(value: string) {
  return !Number.isNaN(Date.parse(value));
}

async function upsertPlayer(payload: SyncPayload, world: SyncWorld | null) {
  const row = {
    client_id: payload.client_id,
    minecraft_uuid: payload.minecraft_uuid ?? null,
    username: payload.username,
    last_mod_version: payload.mod_version ?? null,
    last_minecraft_version: payload.minecraft_version ?? null,
    last_server_name: world?.display_name ?? null,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("players")
    .upsert(row, { onConflict: "client_id" })
    .select("*")
    .single();

  if (error) throw error;
  return data as { id: string };
}

async function upsertWorld(world: SyncWorld | null) {
  if (!world) return null;

  const { data, error } = await supabase
    .from("worlds_or_servers")
    .upsert({
      world_key: world.key,
      display_name: world.display_name,
      kind: world.kind,
      host: world.host ?? null,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "world_key" })
    .select("*")
    .single();

  if (error) throw error;
  return data as { id: string };
}

async function upsertSession(playerId: string, worldId: string | null, session: SyncSession | null) {
  if (!session) return { sessionId: null, wasNew: false };

  const existing = await supabase
    .from("mining_sessions")
    .select("id")
    .eq("player_id", playerId)
    .eq("session_key", session.session_key)
    .maybeSingle();

  if (existing.error) throw existing.error;

  const { data, error } = await supabase
    .from("mining_sessions")
    .upsert({
      player_id: playerId,
      world_id: worldId,
      session_key: session.session_key,
      started_at: session.started_at,
      ended_at: session.ended_at ?? null,
      active_seconds: sanitizeInt(session.active_seconds, 0, 31_536_000),
      total_blocks: sanitizeInt(session.total_blocks),
      average_bph: sanitizeInt(session.average_bph, 0, 72_000),
      peak_bph: sanitizeInt(session.peak_bph, 0, 72_000),
      best_streak_seconds: sanitizeInt(session.best_streak_seconds, 0, 31_536_000),
      top_block: session.top_block ?? null,
      status: session.status,
      synced_at: new Date().toISOString(),
    }, { onConflict: "player_id,session_key" })
    .select("id")
    .single();

  if (error) throw error;

  const sessionId = data.id as string;

  if (session.block_breakdown) {
    const deleteBreakdown = await supabase.from("session_block_breakdown").delete().eq("session_id", sessionId);
    if (deleteBreakdown.error) throw deleteBreakdown.error;

    if (session.block_breakdown.length > 0) {
      const { error: insertBreakdownError } = await supabase.from("session_block_breakdown").insert(
        session.block_breakdown.map((entry) => ({
          session_id: sessionId,
          block_id: sanitizeText(entry.block_id),
          count: sanitizeInt(entry.count),
        })),
      );
      if (insertBreakdownError) throw insertBreakdownError;
    }
  }

  if (session.rate_points) {
    const deleteRatePoints = await supabase.from("session_rate_points").delete().eq("session_id", sessionId);
    if (deleteRatePoints.error) throw deleteRatePoints.error;

    if (session.rate_points.length > 0) {
      const { error: insertRateError } = await supabase.from("session_rate_points").insert(
        session.rate_points.map((point) => ({
          session_id: sessionId,
          point_index: sanitizeInt(point.point_index, 0, 100_000),
          blocks_per_hour: sanitizeInt(point.blocks_per_hour, 0, 72_000),
          elapsed_seconds: sanitizeInt(point.elapsed_seconds, 0, 31_536_000),
        })),
      );
      if (insertRateError) throw insertRateError;
    }
  }

  return { sessionId, wasNew: !existing.data };
}

async function updateWorldStats(playerId: string, worldId: string | null, session: SyncSession | null, worldTotals: SyncCurrentWorldTotals | null | undefined) {
  if (!worldId) return;

  const current = await supabase
    .from("player_world_stats")
    .select("*")
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

  for (const project of projects) {
    const { error } = await supabase.from("projects").upsert({
      player_id: playerId,
      project_key: sanitizeText(project.project_key),
      name: sanitizeText(project.name, "Project"),
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
    goal_date: dailyGoal.goal_date,
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
    blocks_per_hour: sanitizeInt(stats.blocks_per_hour, 0, 72_000),
    estimated_finish_seconds: stats.estimated_finish_seconds == null ? null : sanitizeInt(stats.estimated_finish_seconds, 0, 315_360_000),
    current_project_name: stats.current_project_name ?? null,
    current_project_progress: stats.current_project_progress == null ? null : sanitizeInt(stats.current_project_progress),
    current_project_goal: stats.current_project_goal == null ? null : sanitizeInt(stats.current_project_goal),
    daily_progress: stats.daily_progress == null ? null : sanitizeInt(stats.daily_progress),
    daily_target: stats.daily_target == null ? null : sanitizeInt(stats.daily_target),
    updated_at: new Date().toISOString(),
  }, { onConflict: "player_id" });

  if (error) throw error;
}

async function syncAeternumSidebar(playerId: string, payload: SyncPayload, snapshot: AeternumSidebarSync | null | undefined) {
  if (!snapshot) return;

  const playerDigs = sanitizeInt(snapshot.player_digs);
  const totalDigs = sanitizeInt(snapshot.total_digs);
  if (playerDigs <= 0 || totalDigs < playerDigs) return;

  const username = sanitizeText(payload.username);
  if (!username) return;

  const latestUpdate = snapshot.captured_at && isIsoDate(snapshot.captured_at)
    ? snapshot.captured_at
    : new Date().toISOString();

  const { error } = await supabase
    .from("aeternum_player_stats")
    .upsert({
      player_id: playerId,
      minecraft_uuid: payload.minecraft_uuid ?? null,
      username,
      username_lower: username.toLowerCase(),
      player_digs: playerDigs,
      total_digs: totalDigs,
      server_name: sanitizeText(snapshot.server_name, "Aeternum"),
      objective_title: sanitizeText(snapshot.objective_title, "Aeternum"),
      latest_update: latestUpdate,
      updated_at: new Date().toISOString(),
    }, { onConflict: "username_lower,server_name" });

  if (error) throw error;
}

async function syncAeternumLeaderboard(playerId: string, payload: SyncPayload, leaderboard: AeternumLeaderboardSync | null | undefined) {
  if (!leaderboard?.entries || leaderboard.entries.length === 0) return;

  const serverName = sanitizeText(leaderboard.server_name, "Aeternum");
  const objectiveTitle = sanitizeText(leaderboard.objective_title, "Aeternum");
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

  for (const entry of leaderboard.entries) {
    const username = sanitizeUsername(entry.username);
    const digs = sanitizeInt(entry.digs);
    if (!username || digs <= 0) continue;

    const key = username.toLowerCase();
    const nextRank = entry.rank == null ? null : sanitizeInt(entry.rank, 0, 10_000);
    const existing = deduped.get(key);
    const next = {
      username,
      digs,
      rank: nextRank && nextRank > 0 ? nextRank : null,
      sourceServer: sanitizeText(entry.source_server, serverName) || serverName,
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
      minecraft_uuid: entry.username.toLowerCase() === localUsername ? payload.minecraft_uuid ?? null : null,
      username: entry.username,
      username_lower: entry.username.toLowerCase(),
      player_digs: entry.digs,
      total_digs: totalDigs,
      server_name: serverName,
      objective_title: objectiveTitle,
      latest_update: latestUpdate,
      updated_at: new Date().toISOString(),
    }));

  const { error } = await supabase
    .from("aeternum_player_stats")
    .upsert(rows, { onConflict: "username_lower,server_name" });

  if (error) throw error;
}

async function syncPlayerTotalDigs(playerId: string, payload: SyncPayload, sync: PlayerTotalDigsSync | null | undefined) {
  if (!sync) return;

  const username = sanitizeUsername(sync.username || payload.username);
  const totalDigs = sanitizeInt(sync.total_digs);
  if (!username || totalDigs < 0) return;

  const serverName = sanitizeText(sync.server, "Aeternum");
  const objectiveTitle = sanitizeText(sync.objective_title, "Aeternum");
  const latestUpdate = sync.timestamp && isIsoDate(sync.timestamp)
    ? sync.timestamp
    : new Date().toISOString();

  const existing = await supabase
    .from("aeternum_player_stats")
    .select("player_digs,total_digs,latest_update")
    .eq("username_lower", username.toLowerCase())
    .eq("server_name", serverName)
    .maybeSingle();

  if (existing.error) throw existing.error;

  const existingPlayerDigs = sanitizeInt(existing.data?.player_digs);
  const nextPlayerDigs = totalDigs > 0 ? Math.max(existingPlayerDigs, totalDigs) : existingPlayerDigs;

  const { error } = await supabase
    .from("aeternum_player_stats")
    .upsert({
      player_id: playerId,
      minecraft_uuid: payload.minecraft_uuid ?? null,
      username,
      username_lower: username.toLowerCase(),
      player_digs: nextPlayerDigs,
      total_digs: nextPlayerDigs,
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
    .select("total_blocks, active_seconds")
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
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase service configuration is missing" }, 500);
  }

  if (syncSecret) {
    const providedSecret = request.headers.get("x-sync-secret") ?? "";
    if (providedSecret !== syncSecret) {
      return json({ error: "Invalid sync secret" }, 401);
    }
  }

  let payload: SyncPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!sanitizeText(payload.client_id) || !sanitizeText(payload.username)) {
    return json({ error: "client_id and username are required" }, 400);
  }

  if (payload.session) {
    if (!sanitizeText(payload.session.session_key) || !isIsoDate(payload.session.started_at)) {
      return json({ error: "session_key and started_at are required for session sync" }, 400);
    }
  }

  try {
    const player = await upsertPlayer(payload, payload.world ?? null);
    const world = await upsertWorld(payload.world ?? null);
    const sessionInfo = await upsertSession(player.id, world?.id ?? null, payload.session ?? null);
    await updateWorldStats(player.id, world?.id ?? null, payload.session ?? null, payload.current_world_totals);
    await syncProjects(player.id, payload.projects);
    await syncDailyGoal(player.id, payload.daily_goal);
    await syncStats(player.id, payload.synced_stats);
    await syncPlayerTotalDigs(player.id, payload, payload.player_total_digs);
    if (payload.aeternum_leaderboard?.entries?.length) {
      await syncAeternumLeaderboard(player.id, payload, payload.aeternum_leaderboard);
    } else {
      await syncAeternumSidebar(player.id, payload, payload.aeternum_sidebar);
    }
    await recomputePlayerTotals(player.id, payload.lifetime_totals);

    return json({
      ok: true,
      player_id: player.id,
      world_id: world?.id ?? null,
      session_id: sessionInfo.sessionId,
      source: "aetweaks-sync",
    });
  } catch (error) {
    console.error("aetweaks-sync error", error);
    return json({
      error: error instanceof Error ? error.message : "Unknown sync error",
    }, 500);
  }
});
