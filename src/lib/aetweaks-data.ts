import { appEnv, hasSupabaseEnv } from "@/lib/env";
import { demoSnapshot } from "@/lib/demo-data";
import type {
  AeTweaksSnapshot,
  DailyGoalSummary,
  LeaderboardSummary,
  LeaderboardRowSummary,
  NotificationSummary,
  PlayerSummary,
  ProjectSummary,
  SessionSummary,
  SettingsSummary,
  SyncMeta,
  WorldSummary,
} from "@/lib/types";

type PlayerRow = {
  id: string;
  client_id: string;
  minecraft_uuid?: string | null;
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
  project_key: string;
  name: string;
  progress?: number | null;
  goal?: number | null;
  is_active?: boolean | null;
  last_synced_at: string;
};

type SessionRow = {
  id: string;
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
  goal_date: string;
  target: number;
  progress?: number | null;
  completed?: boolean | null;
};

type WorldRow = {
  id: string;
  display_name: string;
  kind: "singleplayer" | "multiplayer" | "realm" | "unknown";
  host?: string | null;
};

type PlayerWorldStatRow = {
  world_id: string;
  total_blocks?: number | null;
  total_sessions?: number | null;
  total_play_seconds?: number | null;
  last_seen_at: string;
};

type SyncedStatsRow = {
  blocks_per_hour?: number | null;
  estimated_finish_seconds?: number | null;
};

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body?: string | null;
  created_at: string;
};

type LeaderboardRow = {
  leaderboard_type: string;
  score?: number | null;
  rank_cached?: number | null;
  updated_at: string;
};

type UserSettingsRow = {
  hud_enabled?: boolean | null;
  hud_alignment?: string | null;
  hud_scale?: number | null;
  json_settings?: Record<string, unknown> | null;
};

type PlayerLeaderboardRow = Pick<PlayerRow, "id" | "username" | "last_seen_at" | "total_synced_blocks" | "total_sessions">;
type AeternumPlayerStatRow = {
  player_id?: string | null;
  server_name: string;
  username: string;
  username_lower: string;
  player_digs?: number | null;
  total_digs?: number | null;
  latest_update: string;
};

class EmptyDataError extends Error {}

const DEFAULT_SETTINGS: SettingsSummary = {
  autoSyncMiningData: true,
  crossServerAggregation: true,
  realTimeHudSync: false,
  leaderboardOptIn: true,
  publicProfile: true,
  sessionSharing: false,
  hudEnabled: true,
  hudAlignment: "top-right",
  hudScale: 1,
};

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function percent(progress: number, target: number | null | undefined) {
  if (!target || target <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((progress / target) * 100)));
}

function buildHeaders() {
  return {
    apikey: appEnv.supabaseAnonKey,
    Authorization: `Bearer ${appEnv.supabaseAnonKey}`,
    "Content-Type": "application/json",
  };
}

function buildUrl(path: string, params?: Record<string, string | number | undefined>) {
  const url = new URL(`${appEnv.supabaseUrl}/rest/v1/${path}`);

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

async function restSelect<T>(path: string, params?: Record<string, string | number | undefined>) {
  const response = await fetch(buildUrl(path, params), { headers: buildHeaders() });
  if (!response.ok) {
    throw new Error(`${path} query failed (${response.status})`);
  }

  return (await response.json()) as T[];
}

async function resolvePlayerRow() {
  const common = { select: "*" };

  if (appEnv.defaultClientId) {
    const byClientId = await restSelect<PlayerRow>("players", {
      ...common,
      client_id: `eq.${appEnv.defaultClientId}`,
      limit: 1,
    });
    if (byClientId[0]) {
      return byClientId[0];
    }
  }

  if (appEnv.defaultPlayerUsername) {
    const byUsername = await restSelect<PlayerRow>("players", {
      ...common,
      username_lower: `eq.${appEnv.defaultPlayerUsername.toLowerCase()}`,
      order: "last_seen_at.desc",
      limit: 1,
    });
    if (byUsername[0]) {
      return byUsername[0];
    }
  }

  const latest = await restSelect<PlayerRow>("players", {
    ...common,
    order: "last_seen_at.desc",
    limit: 1,
  });

  if (!latest[0]) {
    throw new EmptyDataError("No synced players found yet.");
  }

  return latest[0];
}

function mapPlayer(row: PlayerRow, aeternumRow?: AeternumPlayerStatRow): PlayerSummary {
  return {
    id: row.id,
    clientId: row.client_id,
    minecraftUuid: row.minecraft_uuid ?? null,
    username: row.username,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastModVersion: row.last_mod_version ?? null,
    lastMinecraftVersion: row.last_minecraft_version ?? null,
    lastServerName: row.last_server_name ?? null,
    totalSyncedBlocks: toNumber(row.total_synced_blocks),
    aeternumTotalDigs: aeternumRow ? toNumber(aeternumRow.player_digs, 0) : null,
    totalSessions: toNumber(row.total_sessions),
    totalPlaySeconds: toNumber(row.total_play_seconds),
    trustLevel: row.trust_level ?? "anonymous",
  };
}

function mapProjects(rows: ProjectRow[]): ProjectSummary[] {
  return rows
    .map((row) => {
      const progress = toNumber(row.progress);
      const goal = row.goal == null ? null : toNumber(row.goal);
      const isComplete = goal !== null && goal > 0 && progress >= goal;
      return {
        id: row.id,
        key: row.project_key,
        name: row.name,
        progress,
        goal,
        percent: percent(progress, goal),
        isActive: Boolean(row.is_active),
        lastSyncedAt: row.last_synced_at,
        status: isComplete ? "complete" : row.is_active ? "active" : "idle",
      } satisfies ProjectSummary;
    })
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.progress - a.progress);
}

function mapSessions(rows: SessionRow[]): SessionSummary[] {
  return rows
    .map((row) => ({
      id: row.id,
      sessionKey: row.session_key,
      worldId: row.world_id ?? null,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? null,
      activeSeconds: toNumber(row.active_seconds),
      totalBlocks: toNumber(row.total_blocks),
      averageBph: toNumber(row.average_bph),
      peakBph: toNumber(row.peak_bph),
      bestStreakSeconds: toNumber(row.best_streak_seconds),
      topBlock: row.top_block ?? null,
      status: row.status,
    }))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

function mapDailyGoal(row?: DailyGoalRow): DailyGoalSummary | null {
  if (!row) {
    return null;
  }

  const progress = toNumber(row.progress);
  return {
    goalDate: row.goal_date,
    target: toNumber(row.target),
    progress,
    completed: Boolean(row.completed),
    percent: percent(progress, row.target),
  };
}

function mergeWorlds(worlds: WorldRow[], stats: PlayerWorldStatRow[]): WorldSummary[] {
  const byId = new Map(worlds.map((world) => [world.id, world]));

  return stats
    .map((row) => {
      const world = byId.get(row.world_id);
      if (!world) {
        return null;
      }

      return {
        id: world.id,
        displayName: world.display_name,
        kind: world.kind,
        host: world.host ?? null,
        totalBlocks: toNumber(row.total_blocks),
        totalSessions: toNumber(row.total_sessions),
        totalPlaySeconds: toNumber(row.total_play_seconds),
        lastSeenAt: row.last_seen_at,
      } satisfies WorldSummary;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b!.lastSeenAt).getTime() - new Date(a!.lastSeenAt).getTime()) as WorldSummary[];
}

function mapNotifications(rows: NotificationRow[]): NotificationSummary[] {
  return rows
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body ?? null,
      createdAt: row.created_at,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function mapLeaderboard(row?: LeaderboardRow): LeaderboardSummary | null {
  if (!row) {
    return null;
  }

  return {
    leaderboardType: row.leaderboard_type,
    score: toNumber(row.score),
    rankCached: row.rank_cached ?? null,
    updatedAt: row.updated_at,
  };
}

function mapSettings(row?: UserSettingsRow): SettingsSummary {
  const json =
    row?.json_settings && typeof row.json_settings === "object" && !Array.isArray(row.json_settings)
      ? row.json_settings
      : {};
  const getBoolean = (key: string, fallback: boolean) =>
    typeof json[key] === "boolean" ? (json[key] as boolean) : fallback;

  return {
    autoSyncMiningData: getBoolean("autoSyncMiningData", DEFAULT_SETTINGS.autoSyncMiningData),
    crossServerAggregation: getBoolean("crossServerAggregation", DEFAULT_SETTINGS.crossServerAggregation),
    realTimeHudSync: getBoolean("realTimeHudSync", DEFAULT_SETTINGS.realTimeHudSync),
    leaderboardOptIn: getBoolean("leaderboardOptIn", DEFAULT_SETTINGS.leaderboardOptIn),
    publicProfile: getBoolean("publicProfile", DEFAULT_SETTINGS.publicProfile),
    sessionSharing: getBoolean("sessionSharing", DEFAULT_SETTINGS.sessionSharing),
    hudEnabled: row?.hud_enabled ?? DEFAULT_SETTINGS.hudEnabled,
    hudAlignment: row?.hud_alignment ?? DEFAULT_SETTINGS.hudAlignment,
    hudScale: toNumber(row?.hud_scale, DEFAULT_SETTINGS.hudScale),
  };
}

function buildMeta(source: SyncMeta["source"], title: string, description: string): SyncMeta {
  return { source, title, description };
}

export async function fetchAeTweaksSnapshot(): Promise<AeTweaksSnapshot> {
  if (!hasSupabaseEnv) {
    return demoSnapshot;
  }

  try {
    const playerRow = await resolvePlayerRow();
    const aeternumRows = await restSelect<AeternumPlayerStatRow>("aeternum_player_stats", {
      select: "*",
      username_lower: `eq.${playerRow.username.toLowerCase()}`,
      server_name: "eq.Aeternum",
      order: "latest_update.desc",
      limit: 1,
    });
    const player = mapPlayer(playerRow, aeternumRows[0]);

    const [projectRows, sessionRows, dailyGoalRows, syncedStatsRows, worldStatRows, notificationRows, leaderboardRows, settingsRows] =
      await Promise.all([
        restSelect<ProjectRow>("projects", { select: "*", player_id: `eq.${player.id}`, order: "is_active.desc,last_synced_at.desc" }),
        restSelect<SessionRow>("mining_sessions", { select: "*", player_id: `eq.${player.id}`, order: "started_at.desc", limit: 30 }),
        restSelect<DailyGoalRow>("daily_goals", { select: "*", player_id: `eq.${player.id}`, order: "goal_date.desc", limit: 1 }),
        restSelect<SyncedStatsRow>("synced_stats", { select: "*", player_id: `eq.${player.id}`, limit: 1 }),
        restSelect<PlayerWorldStatRow>("player_world_stats", { select: "*", player_id: `eq.${player.id}`, order: "last_seen_at.desc" }),
        restSelect<NotificationRow>("notifications", { select: "*", player_id: `eq.${player.id}`, order: "created_at.desc", limit: 6 }),
        restSelect<LeaderboardRow>("leaderboard_entries", { select: "*", player_id: `eq.${player.id}`, order: "updated_at.desc", limit: 1 }),
        restSelect<UserSettingsRow>("user_settings", { select: "*", player_id: `eq.${player.id}`, limit: 1 }),
      ]);

    const worldIds = [...new Set(worldStatRows.map((row) => row.world_id).filter(Boolean))];
    const worldRows = worldIds.length
      ? await restSelect<WorldRow>("worlds_or_servers", { select: "*", id: `in.(${worldIds.join(",")})` })
      : [];
    const worlds = mergeWorlds(worldRows, worldStatRows);

    const sessions = mapSessions(sessionRows);
    const syncedStats = syncedStatsRows[0];
    const estimatedBlocksPerHour =
      Math.max(0, toNumber(syncedStats?.blocks_per_hour)) ||
      Math.round(
        sessions.slice(0, 5).reduce((sum, session) => sum + session.averageBph, 0) /
          Math.max(1, Math.min(5, sessions.length)),
      );
    player.totalSyncedBlocks = Math.max(
      player.totalSyncedBlocks,
      worlds.reduce((sum, world) => sum + world.totalBlocks, 0),
    );
    player.totalSessions = Math.max(player.totalSessions, worlds.reduce((sum, world) => sum + world.totalSessions, 0));
    player.totalPlaySeconds = Math.max(
      player.totalPlaySeconds,
      worlds.reduce((sum, world) => sum + world.totalPlaySeconds, 0),
    );

    return {
      meta: buildMeta("live", "Live sync connected", `Showing synced AeTweaks data for ${player.username}.`),
      player,
      projects: mapProjects(projectRows),
      sessions,
      dailyGoal: mapDailyGoal(dailyGoalRows[0]),
      worlds,
      notifications: mapNotifications(notificationRows),
      leaderboard: mapLeaderboard(leaderboardRows[0]),
      settings: mapSettings(settingsRows[0]),
      estimatedBlocksPerHour,
      estimatedFinishSeconds: syncedStats?.estimated_finish_seconds ?? null,
    };
  } catch (error) {
    if (error instanceof EmptyDataError) {
      return {
        ...demoSnapshot,
        meta: buildMeta("empty", "No synced players yet", "Supabase is connected, but no AeTweaks sync records have arrived yet."),
        player: null,
        projects: [],
        sessions: [],
        dailyGoal: null,
        worlds: [],
        notifications: [],
        leaderboard: null,
        estimatedBlocksPerHour: 0,
        estimatedFinishSeconds: null,
        settings: DEFAULT_SETTINGS,
      };
    }

    return {
      ...demoSnapshot,
      meta: buildMeta("error", "Supabase data unavailable", error instanceof Error ? error.message : "The dashboard could not load real sync data."),
    };
  }
}

export async function fetchAeternumLeaderboard(): Promise<LeaderboardRowSummary[]> {
  if (!hasSupabaseEnv) {
    return [];
  }

  const aeternumRows = await restSelect<AeternumPlayerStatRow>("aeternum_player_stats", {
    select: "*",
    server_name: "eq.Aeternum",
    order: "player_digs.desc,total_digs.desc,latest_update.desc",
    limit: 10,
  });

  if (aeternumRows.length === 0) {
    return [];
  }

  return aeternumRows
    .map((row, index) => {
      return {
        playerId: row.player_id ?? null,
        username: row.username,
        skinFaceUrl: `https://minotar.net/avatar/${encodeURIComponent(row.username)}/32`,
        lastUpdated: row.latest_update,
        blocksMined: toNumber(row.player_digs),
        totalDigs: toNumber(row.total_digs),
        rank: index + 1,
        sourceServer: row.server_name,
      } satisfies LeaderboardRowSummary;
    });
}

export async function fetchAeternumTotalDigs(): Promise<number> {
  if (!hasSupabaseEnv) {
    return 0;
  }

  const rows = await restSelect<AeternumPlayerStatRow>("aeternum_player_stats", {
    select: "total_digs",
    server_name: "eq.Aeternum",
  });

  return rows.reduce((max, row) => Math.max(max, toNumber(row.total_digs)), 0);
}
