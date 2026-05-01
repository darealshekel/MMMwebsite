import { sanitizePublicText } from "../../src/lib/security/public-data.js";
import {
  isQualifyingCompletedSession,
  MIN_SESSION_DURATION_SECONDS,
  normalizeSessionDurationSeconds,
} from "../../shared/session-filters.js";
import type {
  MMMSnapshot,
  DailyGoalSummary,
  LeaderboardSummary,
  NotificationSummary,
  PlayerSummary,
  ProjectSummary,
  SessionSummary,
  SettingsSummary,
  WorldSummary,
} from "../../src/lib/types.js";
import { getStaticDashboardPlayerData } from "./static-mmm-leaderboard.js";
import { applyStaticManualOverridesToDashboardPlayerData } from "./static-mmm-overrides.js";
import type { SourceApprovalStatus, SourceScope } from "./source-approval.js";
import { supabaseAdmin } from "./server.js";
import type { AuthContext } from "./session.js";
import { DEFAULT_SETTINGS } from "./session.js";

type PlayerRow = {
  id: string;
  username: string;
  first_seen_at: string;
  last_seen_at: string;
  last_mod_version?: string | null;
  last_minecraft_version?: string | null;
  last_server_name?: string | null;
  total_synced_blocks?: number | null;
  total_sessions?: number | null;
  total_play_seconds?: number | null;
  trust_level?: string | null;
};

type ProjectRow = {
  id: string;
  player_id: string;
  project_key: string;
  name: string;
  progress?: number | null;
  goal?: number | null;
  is_active?: boolean | null;
  last_synced_at: string;
};

type SessionRow = {
  id: string;
  player_id: string;
  session_key: string;
  world_id?: string | null;
  started_at: string;
  ended_at?: string | null;
  active_seconds?: number | null;
  total_blocks?: number | null;
  average_bph?: number | null;
  peak_bph?: number | null;
  best_streak_seconds?: number | null;
  top_block?: string | null;
  status: "active" | "paused" | "ended";
};

type DailyGoalRow = {
  player_id: string;
  goal_date: string;
  target: number;
  progress?: number | null;
  completed?: boolean | null;
  updated_at: string;
};

type WorldRow = {
  id: string;
  display_name: string;
  kind: "singleplayer" | "multiplayer" | "realm" | "unknown";
  source_scope?: SourceScope | null;
  approval_status?: SourceApprovalStatus | null;
};

type PlayerWorldStatRow = {
  player_id: string;
  world_id: string;
  total_blocks?: number | null;
  total_sessions?: number | null;
  total_play_seconds?: number | null;
  last_seen_at: string;
};

type SyncedStatsRow = {
  player_id: string;
  blocks_per_hour?: number | null;
  estimated_finish_seconds?: number | null;
  updated_at: string;
};

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body?: string | null;
  created_at: string;
};

type UserSettingsRow = {
  player_id: string;
  hud_enabled?: boolean | null;
  hud_alignment?: string | null;
  hud_scale?: number | null;
  json_settings?: Record<string, unknown> | null;
  updated_at?: string | null;
};

type GlobalLeaderboardEntryRow = {
  player_id: string | null;
  score?: number | null;
  rank_cached?: number | null;
  updated_at: string;
};

type SinglePlayerLeaderboardData = {
  playerId: string;
  username: string;
  totalBlocks: number;
  rank: number | null;
  sourceServer: string;
  sourceCount: number;
  lastUpdated: string;
  servers: Array<{
    id: string;
    displayName: string;
    totalBlocks: number;
    rank: number;
    lastUpdated: string;
  }>;
};

const DASHBOARD_CACHE_FRESH_MS = 10_000;
const DASHBOARD_CACHE_MAX_STALE_MS = 60_000;
let notificationsTableUnavailable = false;
let userSettingsTableUnavailable = false;

type DashboardSnapshotCacheEntry = {
  cachedAt: number;
  snapshot: MMMSnapshot;
  refresh?: Promise<void>;
};

const dashboardSnapshotCache = new Map<string, DashboardSnapshotCacheEntry>();

function dashboardCacheKey(auth: AuthContext) {
  return [
    auth.userId,
    auth.viewer.minecraftUuidHash,
    auth.viewer.minecraftUsername,
    auth.viewer.role,
    String(auth.viewer.isAdmin),
  ].join("|");
}

export function invalidateDashboardSnapshotCache(userId?: string | null) {
  if (!userId) {
    dashboardSnapshotCache.clear();
    return;
  }

  for (const key of dashboardSnapshotCache.keys()) {
    if (key.startsWith(`${userId}|`)) {
      dashboardSnapshotCache.delete(key);
    }
  }
}

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isMissingSupabaseTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  return record.code === "PGRST205" && String(record.message ?? "").includes("Could not find the table");
}

async function loadDashboardNotifications(playerIds: string[]) {
  if (notificationsTableUnavailable) {
    return { data: [] as NotificationRow[], error: null };
  }

  const result = await supabaseAdmin
    .from("notifications")
    .select("id,kind,title,body,created_at")
    .in("player_id", playerIds)
    .order("created_at", { ascending: false })
    .limit(6);

  if (result.error && isMissingSupabaseTableError(result.error)) {
    notificationsTableUnavailable = true;
    console.info("[dashboard] optional notifications table is unavailable; continuing without notifications", {
      table: "notifications",
      playerIds: playerIds.length,
    });
    return { data: [] as NotificationRow[], error: null };
  }

  return result;
}

async function loadDashboardSettings(playerIds: string[]) {
  if (userSettingsTableUnavailable) {
    return { data: [] as UserSettingsRow[], error: null };
  }

  const result = await supabaseAdmin
    .from("user_settings")
    .select("player_id,hud_enabled,hud_alignment,hud_scale,json_settings,updated_at")
    .in("player_id", playerIds);

  if (result.error && isMissingSupabaseTableError(result.error)) {
    userSettingsTableUnavailable = true;
    console.info("[dashboard] optional user settings table is unavailable; using defaults", {
      table: "user_settings",
      playerIds: playerIds.length,
    });
    return { data: [] as UserSettingsRow[], error: null };
  }

  return result;
}

function percent(progress: number, target: number | null | undefined) {
  if (!target || target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((progress / target) * 100)));
}

function emptySnapshot(auth: AuthContext, title: string, description: string): MMMSnapshot {
  return {
    meta: {
      source: "empty",
      title,
      description,
    },
    viewer: {
      userId: auth.userId,
      username: auth.viewer.minecraftUsername,
      avatarUrl: auth.viewer.avatarUrl,
      provider: auth.viewer.provider,
      role: auth.viewer.role,
      isAdmin: auth.viewer.isAdmin,
    },
    player: null,
    projects: [],
    sessions: [],
    dailyGoal: null,
    worlds: [],
    notifications: [],
    leaderboard: null,
    settings: DEFAULT_SETTINGS,
    estimatedBlocksPerHour: 0,
    estimatedFinishSeconds: null,
    lastSyncedAt: null,
  };
}

function mapPlayer(primary: PlayerRow): PlayerSummary {
  return {
    id: primary.id,
    username: sanitizePublicText(primary.username, "Unknown Player"),
    firstSeenAt: primary.first_seen_at,
    lastSeenAt: primary.last_seen_at,
    lastModVersion: sanitizePublicText(primary.last_mod_version ?? null) || null,
    lastMinecraftVersion: sanitizePublicText(primary.last_minecraft_version ?? null) || null,
    lastServerName: sanitizePublicText(primary.last_server_name ?? null) || null,
    totalSyncedBlocks: toNumber(primary.total_synced_blocks),
    aeternumTotalDigs: null,
    totalSessions: toNumber(primary.total_sessions),
    totalPlaySeconds: toNumber(primary.total_play_seconds),
    trustLevel: primary.trust_level ?? "linked",
  };
}

function mergeDashboardPlayerRows(...groups: PlayerRow[][]) {
  const byId = new Map<string, PlayerRow>();

  for (const row of groups.flat()) {
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, row);
      continue;
    }

    const existingScore = toNumber(existing.total_synced_blocks);
    const rowScore = toNumber(row.total_synced_blocks);
    const existingSeen = new Date(existing.last_seen_at ?? 0).getTime();
    const rowSeen = new Date(row.last_seen_at ?? 0).getTime();
    byId.set(row.id, rowScore > existingScore || (rowScore === existingScore && rowSeen > existingSeen) ? row : existing);
  }

  return [...byId.values()].sort((a, b) => {
    const blockDelta = toNumber(b.total_synced_blocks) - toNumber(a.total_synced_blocks);
    if (blockDelta !== 0) return blockDelta;

    const modDelta = Number(Boolean(b.last_mod_version || b.last_minecraft_version)) - Number(Boolean(a.last_mod_version || a.last_minecraft_version));
    if (modDelta !== 0) return modDelta;

    return new Date(b.last_seen_at ?? 0).getTime() - new Date(a.last_seen_at ?? 0).getTime();
  });
}

function isSourceVisibleInPrivateDashboard(row: Pick<WorldRow, "source_scope" | "approval_status">) {
  const scope = row.source_scope ?? "public_server";
  if (scope === "unsupported") return false;
  return (row.approval_status ?? "pending") !== "rejected";
}

function mapSettings(rows: UserSettingsRow[]): SettingsSummary {
  const row = [...rows].sort((a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime())[0];
  if (!row) return DEFAULT_SETTINGS;

  const json = row.json_settings && typeof row.json_settings === "object" && !Array.isArray(row.json_settings) ? row.json_settings : {};
  const getBoolean = (key: string, fallback: boolean) => (typeof json[key] === "boolean" ? (json[key] as boolean) : fallback);

  return {
    autoSyncMiningData: getBoolean("autoSyncMiningData", DEFAULT_SETTINGS.autoSyncMiningData),
    crossServerAggregation: getBoolean("crossServerAggregation", DEFAULT_SETTINGS.crossServerAggregation),
    realTimeHudSync: getBoolean("realTimeHudSync", DEFAULT_SETTINGS.realTimeHudSync),
    leaderboardOptIn: getBoolean("leaderboardOptIn", DEFAULT_SETTINGS.leaderboardOptIn),
    publicProfile: getBoolean("publicProfile", DEFAULT_SETTINGS.publicProfile),
    sessionSharing: getBoolean("sessionSharing", DEFAULT_SETTINGS.sessionSharing),
    hudEnabled: row.hud_enabled ?? DEFAULT_SETTINGS.hudEnabled,
    hudAlignment: row.hud_alignment ?? DEFAULT_SETTINGS.hudAlignment,
    hudScale: toNumber(row.hud_scale, DEFAULT_SETTINGS.hudScale),
  };
}

function mapProjects(rows: ProjectRow[]) {
  const byKey = new Map<string, ProjectSummary>();

  for (const row of rows) {
    const progress = toNumber(row.progress);
    const goal = row.goal == null ? null : toNumber(row.goal);
    const candidate: ProjectSummary = {
      id: row.id,
      key: row.project_key,
      name: sanitizePublicText(row.name, "Project"),
      progress,
      goal,
      percent: percent(progress, goal),
      isActive: Boolean(row.is_active),
      lastSyncedAt: row.last_synced_at,
      status: goal !== null && goal > 0 && progress >= goal ? "complete" : row.is_active ? "active" : "idle",
    };

    const existing = byKey.get(candidate.key);
    if (!existing || new Date(candidate.lastSyncedAt).getTime() > new Date(existing.lastSyncedAt).getTime() || candidate.progress > existing.progress) {
      byKey.set(candidate.key, candidate);
    }
  }

  return Array.from(byKey.values()).sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) ||
      new Date(b.lastSyncedAt).getTime() - new Date(a.lastSyncedAt).getTime() ||
      b.progress - a.progress,
  );
}

export function mapSessions(rows: SessionRow[]) {
  return rows
    .map((row) => ({
      id: row.id,
      sessionKey: row.session_key,
      worldId: row.world_id ?? null,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? null,
      activeSeconds: normalizeSessionDurationSeconds(row.active_seconds),
      totalBlocks: toNumber(row.total_blocks),
      averageBph: toNumber(row.average_bph),
      peakBph: toNumber(row.peak_bph),
      bestStreakSeconds: toNumber(row.best_streak_seconds),
      topBlock: sanitizePublicText(row.top_block ?? null) || null,
      status: row.status,
    } satisfies SessionSummary))
    .filter((row) => isQualifyingCompletedSession(row))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

function mapDailyGoal(rows: DailyGoalRow[]): DailyGoalSummary | null {
  const grouped = new Map<string, DailyGoalSummary>();
  for (const row of rows) {
    const progress = toNumber(row.progress);
    const candidate: DailyGoalSummary = {
      goalDate: row.goal_date,
      target: toNumber(row.target),
      progress,
      completed: Boolean(row.completed),
      percent: percent(progress, row.target),
    };
    const existing = grouped.get(row.goal_date);
    if (!existing || candidate.progress > existing.progress) {
      grouped.set(row.goal_date, candidate);
    }
  }
  return Array.from(grouped.values()).sort((a, b) => new Date(b.goalDate).getTime() - new Date(a.goalDate).getTime())[0] ?? null;
}

function mapWorlds(worldRows: WorldRow[], statRows: PlayerWorldStatRow[]): WorldSummary[] {
  const worldsById = new Map(worldRows.map((row) => [row.id, row]));
  const merged = new Map<string, WorldSummary>();

  for (const row of statRows) {
    const world = worldsById.get(row.world_id);
    if (!world) continue;

    const existing = merged.get(row.world_id);
    const candidate: WorldSummary = {
      id: world.id,
      displayName: sanitizePublicText(world.display_name, "Unknown World"),
      kind: world.kind,
      totalBlocks: toNumber(row.total_blocks),
      totalSessions: toNumber(row.total_sessions),
      totalPlaySeconds: toNumber(row.total_play_seconds),
      lastSeenAt: row.last_seen_at,
    };

    if (!existing) {
      merged.set(row.world_id, candidate);
      continue;
    }

    merged.set(row.world_id, {
      ...candidate,
      totalBlocks: Math.max(existing.totalBlocks, candidate.totalBlocks),
      totalSessions: Math.max(existing.totalSessions, candidate.totalSessions),
      totalPlaySeconds: Math.max(existing.totalPlaySeconds, candidate.totalPlaySeconds),
      lastSeenAt: new Date(existing.lastSeenAt).getTime() > new Date(candidate.lastSeenAt).getTime() ? existing.lastSeenAt : candidate.lastSeenAt,
    });
  }

  return Array.from(merged.values()).sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
}

function mapNotifications(rows: NotificationRow[]): NotificationSummary[] {
  return rows
    .map((row) => ({
      id: row.id,
      kind: sanitizePublicText(row.kind, "sync"),
      title: sanitizePublicText(row.title, "Notification"),
      body: sanitizePublicText(row.body ?? null) || null,
      createdAt: row.created_at,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);
}

async function resolvePlayerRows(auth: AuthContext): Promise<PlayerRow[]> {
  const username = auth.viewer.minecraftUsername;
  const usernameLower = username.toLowerCase();
  const uuidHash = auth.viewer.minecraftUuidHash;

  console.info("[dashboard] resolve start", {
    userId: auth.userId,
    username,
    uuidHashPrefix: uuidHash.slice(0, 10),
  });

  const [directLookup, usernameLookup] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select("id,username,first_seen_at,last_seen_at,last_mod_version,last_minecraft_version,last_server_name,total_synced_blocks,total_sessions,total_play_seconds,trust_level")
      .eq("minecraft_uuid_hash", uuidHash)
      .order("last_seen_at", { ascending: false }),
    supabaseAdmin
      .from("users")
      .select("id,username,first_seen_at,last_seen_at,last_mod_version,last_minecraft_version,last_server_name,total_synced_blocks,total_sessions,total_play_seconds,trust_level")
      .eq("username_lower", usernameLower)
      .order("last_seen_at", { ascending: false }),
  ]);

  if (directLookup.error) throw directLookup.error;
  if (usernameLookup.error) throw usernameLookup.error;

  const directRows = (directLookup.data ?? []) as PlayerRow[];
  const usernameRows = (usernameLookup.data ?? []) as PlayerRow[];
  console.info("[dashboard] player match via uuid", { count: directRows.length });
  console.info("[dashboard] fallback lookup", {
    usernameMatches: usernameRows.length,
  });

  console.info("[dashboard] player match via username", { count: usernameRows.length });

  const mergedRows = mergeDashboardPlayerRows(directRows, usernameRows);
  console.info("[dashboard] merged player rows", {
    count: mergedRows.length,
    primaryPlayerId: mergedRows[0]?.id ?? null,
    primaryBlocks: toNumber(mergedRows[0]?.total_synced_blocks),
  });

  return mergedRows;
}

async function resolveLeaderboardPreview(auth: AuthContext, playerRows: PlayerRow[]): Promise<LeaderboardSummary | null> {
  const playerIds = playerRows.map((row) => row.id).filter(Boolean);
  if (playerIds.length === 0) return null;

  const entryLookup = await supabaseAdmin
    .from("leaderboard_entries")
    .select("player_id,score,rank_cached,updated_at")
    .in("player_id", playerIds)
    .is("source_id", null)
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (entryLookup.error) throw entryLookup.error;
  const match = entryLookup.data as GlobalLeaderboardEntryRow | null;
  if (!match) {
    return null;
  }

  let rankCached = typeof match.rank_cached === "number" ? match.rank_cached : null;
  const score = toNumber(match.score);
  if (rankCached == null && score > 0) {
    const rankLookup = await supabaseAdmin
      .from("leaderboard_entries")
      .select("id", { count: "exact", head: true })
      .is("source_id", null)
      .gt("score", score);
    if (!rankLookup.error && typeof rankLookup.count === "number") {
      rankCached = rankLookup.count + 1;
    }
  }

  return {
    leaderboardType: "global",
    score,
    rankCached,
    updatedAt: match.updated_at,
  };
}

async function resolveSinglePlayerLeaderboardData(username: string): Promise<SinglePlayerLeaderboardData | null> {
  const staticPlayer = await applyStaticManualOverridesToDashboardPlayerData(getStaticDashboardPlayerData(username));
  if (!staticPlayer) {
    return null;
  }
  return staticPlayer as SinglePlayerLeaderboardData;
}

function leaderboardPreviewFromSinglePlayer(staticPlayer: SinglePlayerLeaderboardData): LeaderboardSummary {
  return {
    leaderboardType: "global",
    score: toNumber(staticPlayer.totalBlocks),
    rankCached: staticPlayer.rank == null ? null : toNumber(staticPlayer.rank),
    updatedAt: staticPlayer.lastUpdated ?? "",
  };
}

async function buildStaticLeaderboardSnapshot(
  auth: AuthContext,
  existingStaticPlayer?: SinglePlayerLeaderboardData | null,
): Promise<MMMSnapshot | null> {
  const staticPlayer = existingStaticPlayer ?? await resolveSinglePlayerLeaderboardData(auth.viewer.minecraftUsername);
  if (!staticPlayer) {
    return null;
  }

  const lastUpdated = staticPlayer.lastUpdated || null;
  const worlds: WorldSummary[] = staticPlayer.servers.map((server) => ({
    id: server.id,
    displayName: sanitizePublicText(server.displayName, "Unknown Source"),
    kind: server.displayName === "SSP/HSP" ? "singleplayer" : "multiplayer",
    totalBlocks: toNumber(server.totalBlocks),
    totalSessions: 0,
    totalPlaySeconds: 0,
    lastSeenAt: server.lastUpdated || staticPlayer.lastUpdated,
  }));

  return {
    meta: {
      source: "live",
      title: "Leaderboard data",
      description: `Showing real MMM leaderboard totals for ${staticPlayer.username}. Mod session data will appear after this account syncs it.`,
    },
    viewer: {
      userId: auth.userId,
      username: auth.viewer.minecraftUsername,
      avatarUrl: auth.viewer.avatarUrl,
      provider: auth.viewer.provider,
      role: auth.viewer.role,
      isAdmin: auth.viewer.isAdmin,
    },
    player: {
      id: staticPlayer.playerId,
      username: sanitizePublicText(staticPlayer.username, auth.viewer.minecraftUsername),
      firstSeenAt: lastUpdated ?? "",
      lastSeenAt: lastUpdated ?? "",
      lastModVersion: null,
      lastMinecraftVersion: null,
      lastServerName: sanitizePublicText(staticPlayer.sourceServer, "") || null,
      totalSyncedBlocks: staticPlayer.totalBlocks,
      aeternumTotalDigs: null,
      totalSessions: 0,
      totalPlaySeconds: 0,
      trustLevel: "leaderboard",
    },
    projects: [],
    sessions: [],
    dailyGoal: null,
    worlds,
    notifications: [],
    leaderboard: {
      leaderboardType: "global",
      score: staticPlayer.totalBlocks,
      rankCached: staticPlayer.rank,
      updatedAt: lastUpdated ?? "",
    },
    settings: DEFAULT_SETTINGS,
    estimatedBlocksPerHour: 0,
    estimatedFinishSeconds: null,
    lastSyncedAt: lastUpdated,
  };
}

async function refreshDashboardSnapshotCache(key: string, auth: AuthContext) {
  const snapshot = await buildDashboardSnapshot(auth);
  dashboardSnapshotCache.set(key, {
    cachedAt: Date.now(),
    snapshot,
  });
  return snapshot;
}

export async function buildCachedDashboardSnapshot(auth: AuthContext, options: { forceRefresh?: boolean } = {}) {
  const key = dashboardCacheKey(auth);
  const cached = dashboardSnapshotCache.get(key);
  const now = Date.now();

  if (!options.forceRefresh && cached) {
    const age = now - cached.cachedAt;
    if (age <= DASHBOARD_CACHE_MAX_STALE_MS) {
      if (age > DASHBOARD_CACHE_FRESH_MS && !cached.refresh) {
        cached.refresh = refreshDashboardSnapshotCache(key, auth)
          .then(() => undefined)
          .catch((error) => {
            console.warn("[dashboard] background snapshot refresh failed", error instanceof Error ? error.message : error);
          })
          .finally(() => {
            const latest = dashboardSnapshotCache.get(key);
            if (latest) {
              delete latest.refresh;
            }
          });
      }
      return cached.snapshot;
    }
  }

  return refreshDashboardSnapshotCache(key, auth);
}

export async function buildDashboardSnapshot(auth: AuthContext): Promise<MMMSnapshot> {
  if (!auth.viewer.minecraftUuidHash) {
    return emptySnapshot(
      auth,
      "Minecraft claim needed",
      "Log in with Discord, submit a Minecraft username or UUID claim, and wait for an admin to approve it before dashboard mining data appears.",
    );
  }

  try {
    const [playerRows, singlePlayerLeaderboard] = await Promise.all([
      resolvePlayerRows(auth),
      resolveSinglePlayerLeaderboardData(auth.viewer.minecraftUsername),
    ]);
    const databaseLeaderboardPreview = !singlePlayerLeaderboard && playerRows.length > 0
      ? await resolveLeaderboardPreview(auth, playerRows)
      : null;
    const leaderboardPreview = singlePlayerLeaderboard
      ? leaderboardPreviewFromSinglePlayer(singlePlayerLeaderboard)
      : databaseLeaderboardPreview;

    if (playerRows.length === 0) {
      return await buildStaticLeaderboardSnapshot(auth, singlePlayerLeaderboard)
        ?? emptySnapshot(auth, "Account linked", "Your MMM account is linked. Dashboard data will appear here after the mod syncs data from this Minecraft account.");
    }

    const playerIds = playerRows.map((row) => row.id);
    const primary = playerRows[0];

    const [
      projectsResult,
      sessionsResult,
      dailyGoalsResult,
      statsResult,
      worldStatsResult,
      notificationsResult,
      settingsResult,
    ] = await Promise.all([
      supabaseAdmin.from("projects").select("id,player_id,project_key,name,progress,goal,is_active,last_synced_at").in("player_id", playerIds).order("last_synced_at", { ascending: false }),
      supabaseAdmin
        .from("mining_sessions")
        .select("id,player_id,session_key,world_id,started_at,ended_at,active_seconds,total_blocks,average_bph,peak_bph,best_streak_seconds,top_block,status")
        .in("player_id", playerIds)
        .eq("status", "ended")
        .gte("active_seconds", MIN_SESSION_DURATION_SECONDS)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(60),
      supabaseAdmin.from("daily_goals").select("player_id,goal_date,target,progress,completed,updated_at").in("player_id", playerIds).order("goal_date", { ascending: false }),
      supabaseAdmin.from("synced_stats").select("player_id,blocks_per_hour,estimated_finish_seconds,updated_at").in("player_id", playerIds).order("updated_at", { ascending: false }),
      supabaseAdmin.from("player_world_stats").select("player_id,world_id,total_blocks,total_sessions,total_play_seconds,last_seen_at").in("player_id", playerIds).order("last_seen_at", { ascending: false }),
      loadDashboardNotifications(playerIds),
      loadDashboardSettings(playerIds),
    ]);

  for (const result of [projectsResult, sessionsResult, dailyGoalsResult, statsResult, worldStatsResult, notificationsResult, settingsResult]) {
    if (result.error) throw result.error;
  }

  const worldIds = [...new Set(((worldStatsResult.data ?? []) as PlayerWorldStatRow[]).map((row) => row.world_id))];
  const worldRows = worldIds.length
    ? await supabaseAdmin.from("worlds_or_servers").select("id,display_name,kind,source_scope,approval_status").in("id", worldIds)
    : { data: [] as WorldRow[], error: null };
  if (worldRows.error) throw worldRows.error;

  const visibleWorldRows = ((worldRows.data ?? []) as WorldRow[]).filter(isSourceVisibleInPrivateDashboard);
  const visibleWorldIds = new Set(visibleWorldRows.map((row) => row.id));
  const visibleWorldStats = ((worldStatsResult.data ?? []) as PlayerWorldStatRow[]).filter((row) => visibleWorldIds.has(row.world_id));

  const player = mapPlayer(primary);
  const worlds = mapWorlds(visibleWorldRows, visibleWorldStats);
  const sessions = mapSessions((sessionsResult.data ?? []) as SessionRow[]);
  const estimatedFromStats = ((statsResult.data ?? []) as SyncedStatsRow[])[0];
  const estimatedBlocksPerHour = Math.max(
    toNumber(estimatedFromStats?.blocks_per_hour),
    Math.round(sessions.slice(0, 5).reduce((sum, session) => sum + session.averageBph, 0) / Math.max(1, Math.min(5, sessions.length))),
  );
  // The public Single Players leaderboard is the canonical total shown on the dashboard.
  player.totalSyncedBlocks = leaderboardPreview?.score
    ?? Math.max(player.totalSyncedBlocks, worlds.reduce((sum, world) => sum + world.totalBlocks, 0));
  player.totalSessions = Math.max(player.totalSessions, ...(worlds.map((world) => world.totalSessions)));
  player.totalPlaySeconds = Math.max(player.totalPlaySeconds, ...(worlds.map((world) => world.totalPlaySeconds)));

  console.info("[dashboard] aggregate results", {
    userId: auth.userId,
    username: auth.viewer.minecraftUsername,
    playerRows: playerRows.length,
    sessions: sessions.length,
    activeProjects: mapProjects((projectsResult.data ?? []) as ProjectRow[]).filter((project) => project.isActive).length,
    totalBlocks: player.totalSyncedBlocks,
  });

  const lastSyncedAt = [
    player.lastSeenAt,
    singlePlayerLeaderboard?.lastUpdated ?? null,
    ...(worlds.map((world) => world.lastSeenAt)),
    ...sessions.map((session) => session.startedAt),
  ].filter((value): value is string => Boolean(value)).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

    return {
      meta: {
        source: "live",
        title: "Account linked and secured",
        description: `Showing ${auth.viewer.minecraftUsername}'s MMM data from the linked Minecraft account.`,
      },
      viewer: {
        userId: auth.userId,
        username: auth.viewer.minecraftUsername,
        avatarUrl: auth.viewer.avatarUrl,
        provider: auth.viewer.provider,
        role: auth.viewer.role,
        isAdmin: auth.viewer.isAdmin,
      },
      player,
      projects: mapProjects((projectsResult.data ?? []) as ProjectRow[]),
      sessions,
      dailyGoal: mapDailyGoal((dailyGoalsResult.data ?? []) as DailyGoalRow[]),
      worlds,
      notifications: mapNotifications((notificationsResult.data ?? []) as NotificationRow[]),
      leaderboard: leaderboardPreview,
      settings: mapSettings((settingsResult.data ?? []) as UserSettingsRow[]),
      estimatedBlocksPerHour,
      estimatedFinishSeconds: estimatedFromStats?.estimated_finish_seconds ?? null,
      lastSyncedAt,
    };
  } catch (error) {
    console.warn("[dashboard] falling back to static leaderboard data", error instanceof Error ? error.message : error);
    return await buildStaticLeaderboardSnapshot(auth)
      ?? emptySnapshot(auth, "Dashboard data unavailable", "No real MMM leaderboard or synced mod data is available for this linked Minecraft account yet.");
  }
}
