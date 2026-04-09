import { sanitizePublicText } from "../../src/lib/security/public-data.js";
import type {
  AeTweaksSnapshot,
  DailyGoalSummary,
  LeaderboardSummary,
  NotificationSummary,
  PlayerSummary,
  ProjectSummary,
  SessionSummary,
  SettingsSummary,
  WorldSummary,
} from "../../src/lib/types.js";
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

type ConnectedAccountRow = {
  user_id: string;
  minecraft_username: string;
  minecraft_uuid_hash: string;
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

type LeaderboardRow = {
  leaderboard_type: string;
  score?: number | null;
  rank_cached?: number | null;
  updated_at: string;
};

type UserSettingsRow = {
  player_id: string;
  hud_enabled?: boolean | null;
  hud_alignment?: string | null;
  hud_scale?: number | null;
  json_settings?: Record<string, unknown> | null;
  updated_at?: string | null;
};

type AeternumPlayerStatRow = {
  player_id?: string | null;
  username: string;
  username_lower?: string;
  player_digs?: number | null;
  total_digs?: number | null;
  server_name?: string | null;
  latest_update: string;
};

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function percent(progress: number, target: number | null | undefined) {
  if (!target || target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((progress / target) * 100)));
}

function emptySnapshot(auth: AuthContext, title: string, description: string): AeTweaksSnapshot {
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

function mapPlayer(primary: PlayerRow, aeternum?: AeternumPlayerStatRow): PlayerSummary {
  return {
    id: primary.id,
    username: sanitizePublicText(primary.username, "Unknown Player"),
    firstSeenAt: primary.first_seen_at,
    lastSeenAt: primary.last_seen_at,
    lastModVersion: sanitizePublicText(primary.last_mod_version ?? null) || null,
    lastMinecraftVersion: sanitizePublicText(primary.last_minecraft_version ?? null) || null,
    lastServerName: sanitizePublicText(primary.last_server_name ?? null) || null,
    totalSyncedBlocks: toNumber(primary.total_synced_blocks),
    aeternumTotalDigs: aeternum ? toNumber(aeternum.player_digs) : null,
    totalSessions: toNumber(primary.total_sessions),
    totalPlaySeconds: toNumber(primary.total_play_seconds),
    trustLevel: primary.trust_level ?? "linked",
  };
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

function mapSessions(rows: SessionRow[]) {
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
      topBlock: sanitizePublicText(row.top_block ?? null) || null,
      status: row.status,
    } satisfies SessionSummary))
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

function mapLeaderboard(rows: LeaderboardRow[]): LeaderboardSummary | null {
  const row = [...rows].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
  if (!row) return null;
  return {
    leaderboardType: row.leaderboard_type,
    score: toNumber(row.score),
    rankCached: row.rank_cached ?? null,
    updatedAt: row.updated_at,
  };
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

  const directLookup = await supabaseAdmin
    .from("players")
    .select("id,username,first_seen_at,last_seen_at,last_mod_version,last_minecraft_version,last_server_name,total_synced_blocks,total_sessions,total_play_seconds,trust_level")
    .eq("minecraft_uuid_hash", uuidHash)
    .order("last_seen_at", { ascending: false });

  if (directLookup.error) throw directLookup.error;
  const directRows = (directLookup.data ?? []) as PlayerRow[];
  if (directRows.length > 0) {
    console.info("[dashboard] player match via uuid", { count: directRows.length });
    return directRows;
  }

  const [accountLookup, aeternumLookup] = await Promise.all([
    supabaseAdmin
      .from("connected_accounts")
      .select("user_id,minecraft_username,minecraft_uuid_hash")
      .eq("user_id", auth.userId)
      .order("updated_at", { ascending: false })
      .limit(1),
    supabaseAdmin
      .from("aeternum_player_stats")
      .select("player_id,username,username_lower,player_digs,total_digs,latest_update")
      .or(`minecraft_uuid_hash.eq.${uuidHash},username_lower.eq.${usernameLower}`)
      .order("latest_update", { ascending: false })
      .limit(5),
  ]);

  if (accountLookup.error) throw accountLookup.error;
  if (aeternumLookup.error) throw aeternumLookup.error;

  const account = (accountLookup.data ?? [])[0] as ConnectedAccountRow | undefined;
  const aeternumRows = (aeternumLookup.data ?? []) as AeternumPlayerStatRow[];
  console.info("[dashboard] fallback lookup", {
    connectedAccount: Boolean(account),
    aeternumMatches: aeternumRows.length,
  });

  const playerIds = [...new Set(aeternumRows.map((row) => row.player_id).filter((value): value is string => Boolean(value)))];
  if (playerIds.length > 0) {
    const aeternumPlayerLookup = await supabaseAdmin
      .from("players")
      .select("id,username,first_seen_at,last_seen_at,last_mod_version,last_minecraft_version,last_server_name,total_synced_blocks,total_sessions,total_play_seconds,trust_level")
      .in("id", playerIds)
      .order("last_seen_at", { ascending: false });

    if (aeternumPlayerLookup.error) throw aeternumPlayerLookup.error;
    const rows = (aeternumPlayerLookup.data ?? []) as PlayerRow[];
    if (rows.length > 0) {
      console.info("[dashboard] player match via aeternum player_id", { count: rows.length });
      return rows;
    }
  }

  const usernameLookup = await supabaseAdmin
    .from("players")
    .select("id,username,first_seen_at,last_seen_at,last_mod_version,last_minecraft_version,last_server_name,total_synced_blocks,total_sessions,total_play_seconds,trust_level")
    .eq("username_lower", usernameLower)
    .order("last_seen_at", { ascending: false });

  if (usernameLookup.error) throw usernameLookup.error;
  const usernameRows = (usernameLookup.data ?? []) as PlayerRow[];
  if (usernameRows.length > 0) {
    console.info("[dashboard] player match via username", { count: usernameRows.length });
    return usernameRows;
  }

  return [];
}

async function resolveAeternumStats(auth: AuthContext): Promise<{
  row: AeternumPlayerStatRow | null;
  leaderboard: LeaderboardSummary | null;
}> {
  const usernameLower = auth.viewer.minecraftUsername.toLowerCase();
  const uuidHash = auth.viewer.minecraftUuidHash;

  const aeternumLookup = await supabaseAdmin
    .from("aeternum_player_stats")
    .select("player_id,username,username_lower,player_digs,total_digs,server_name,latest_update")
    .or(`minecraft_uuid_hash.eq.${uuidHash},username_lower.eq.${usernameLower}`)
    .order("latest_update", { ascending: false })
    .limit(10);

  if (aeternumLookup.error) throw aeternumLookup.error;

  const aeternumRows = (aeternumLookup.data ?? []) as AeternumPlayerStatRow[];
  const row = aeternumRows.sort(
    (a, b) =>
      toNumber(b.player_digs) - toNumber(a.player_digs) ||
      new Date(b.latest_update).getTime() - new Date(a.latest_update).getTime(),
  )[0] ?? null;

  if (!row) {
    console.info("[dashboard] aeternum match missing", { username: auth.viewer.minecraftUsername });
    return { row: null, leaderboard: null };
  }

  const rankLookup = await supabaseAdmin
    .from("aeternum_player_stats")
    .select("username", { count: "exact", head: true })
    .eq("server_name", row.server_name ?? "Aeternum")
    .gt("player_digs", toNumber(row.player_digs));

  if (rankLookup.error) throw rankLookup.error;

  const leaderboard: LeaderboardSummary = {
    leaderboardType: "aeternum",
    score: toNumber(row.player_digs),
    rankCached: (rankLookup.count ?? 0) + 1,
    updatedAt: row.latest_update,
  };

  console.info("[dashboard] aeternum resolved", {
    username: row.username,
    playerDigs: toNumber(row.player_digs),
    rank: leaderboard.rankCached,
  });

  return { row, leaderboard };
}

export async function buildDashboardSnapshot(auth: AuthContext): Promise<AeTweaksSnapshot> {
  const playerRows = await resolvePlayerRows(auth);
  const { row: aeternumRow, leaderboard: aeternumLeaderboard } = await resolveAeternumStats(auth);

  if (playerRows.length === 0) {
    if (aeternumRow) {
      console.info("[dashboard] returning aeternum-only snapshot", {
        username: aeternumRow.username,
      });

      return {
        meta: {
          source: "live",
          title: "Aeternum data found",
          description: `Showing the linked Aeternum stats for ${auth.viewer.minecraftUsername} while session and project history continue syncing.`,
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
          id: auth.userId,
          username: sanitizePublicText(aeternumRow.username, auth.viewer.minecraftUsername),
          firstSeenAt: aeternumRow.latest_update,
          lastSeenAt: aeternumRow.latest_update,
          lastModVersion: null,
          lastMinecraftVersion: null,
          lastServerName: "Aeternum",
          totalSyncedBlocks: toNumber(aeternumRow.player_digs),
          aeternumTotalDigs: toNumber(aeternumRow.player_digs),
          totalSessions: 0,
          totalPlaySeconds: 0,
          trustLevel: "linked",
        },
        projects: [],
        sessions: [],
        dailyGoal: null,
        worlds: [],
        notifications: [],
        leaderboard: aeternumLeaderboard,
        settings: DEFAULT_SETTINGS,
        estimatedBlocksPerHour: 0,
        estimatedFinishSeconds: null,
        lastSyncedAt: aeternumRow.latest_update,
      };
    }

    return emptySnapshot(auth, "Account linked", "Your AeTweaks account is linked. Dashboard data will appear here after the mod syncs data from this Minecraft account.");
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
    leaderboardResult,
    settingsResult,
  ] = await Promise.all([
    supabaseAdmin.from("projects").select("id,player_id,project_key,name,progress,goal,is_active,last_synced_at").in("player_id", playerIds).order("last_synced_at", { ascending: false }),
    supabaseAdmin.from("mining_sessions").select("id,player_id,session_key,world_id,started_at,ended_at,active_seconds,total_blocks,average_bph,peak_bph,best_streak_seconds,top_block,status").in("player_id", playerIds).order("started_at", { ascending: false }).limit(30),
    supabaseAdmin.from("daily_goals").select("player_id,goal_date,target,progress,completed,updated_at").in("player_id", playerIds).order("goal_date", { ascending: false }),
    supabaseAdmin.from("synced_stats").select("player_id,blocks_per_hour,estimated_finish_seconds,updated_at").in("player_id", playerIds).order("updated_at", { ascending: false }),
    supabaseAdmin.from("player_world_stats").select("player_id,world_id,total_blocks,total_sessions,total_play_seconds,last_seen_at").in("player_id", playerIds).order("last_seen_at", { ascending: false }),
    supabaseAdmin.from("notifications").select("id,kind,title,body,created_at").in("player_id", playerIds).order("created_at", { ascending: false }).limit(6),
    supabaseAdmin.from("leaderboard_entries").select("leaderboard_type,score,rank_cached,updated_at").in("player_id", playerIds).order("updated_at", { ascending: false }).limit(5),
    supabaseAdmin.from("user_settings").select("player_id,hud_enabled,hud_alignment,hud_scale,json_settings,updated_at").in("player_id", playerIds),
  ]);

  for (const result of [projectsResult, sessionsResult, dailyGoalsResult, statsResult, worldStatsResult, notificationsResult, leaderboardResult, settingsResult]) {
    if (result.error) throw result.error;
  }

  const worldIds = [...new Set(((worldStatsResult.data ?? []) as PlayerWorldStatRow[]).map((row) => row.world_id))];
  const worldRows = worldIds.length
    ? await supabaseAdmin.from("worlds_or_servers").select("id,display_name,kind").in("id", worldIds)
    : { data: [] as WorldRow[], error: null };
  if (worldRows.error) throw worldRows.error;

  const player = mapPlayer(primary, aeternumRow ?? undefined);
  const worlds = mapWorlds((worldRows.data ?? []) as WorldRow[], (worldStatsResult.data ?? []) as PlayerWorldStatRow[]);
  const sessions = mapSessions((sessionsResult.data ?? []) as SessionRow[]);
  const estimatedFromStats = ((statsResult.data ?? []) as SyncedStatsRow[])[0];
  const estimatedBlocksPerHour = Math.max(
    toNumber(estimatedFromStats?.blocks_per_hour),
    Math.round(sessions.slice(0, 5).reduce((sum, session) => sum + session.averageBph, 0) / Math.max(1, Math.min(5, sessions.length))),
  );
  player.totalSyncedBlocks = player.aeternumTotalDigs != null && player.aeternumTotalDigs > 0
    ? player.aeternumTotalDigs
    : Math.max(player.totalSyncedBlocks, ...(worlds.map((world) => world.totalBlocks)));
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
    ...(worlds.map((world) => world.lastSeenAt)),
    ...sessions.map((session) => session.startedAt),
    ...(aeternumRow ? [aeternumRow.latest_update] : []),
  ].sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  return {
    meta: {
      source: "live",
      title: "Account linked and secured",
      description: `Showing only ${auth.viewer.minecraftUsername}'s AeTweaks data from the linked Minecraft account.`,
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
    leaderboard: aeternumLeaderboard ?? mapLeaderboard((leaderboardResult.data ?? []) as LeaderboardRow[]),
    settings: mapSettings((settingsResult.data ?? []) as UserSettingsRow[]),
    estimatedBlocksPerHour,
    estimatedFinishSeconds: estimatedFromStats?.estimated_finish_seconds ?? null,
    lastSyncedAt,
  };
}
