import { appEnv, hasSupabaseEnv } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { apiCredentials, apiUrl, isLocalProductionPreview, isLocalRuntime, logLocalApiFailure, readResponseBody } from "@/lib/local-runtime";
import { buildLocalOwnerSnapshot, LOCAL_OWNER_VIEWER } from "@/lib/local-owner";
import type { AeTweaksSnapshot, LeaderboardRowSummary, SettingsSummary, ViewerSummary } from "@/lib/types";
import { shouldIncludeLeaderboardUsername } from "../../shared/leaderboard-ingestion";

type AeternumPlayerStatRow = {
  player_id?: string | null;
  server_name: string;
  username: string;
  username_lower?: string | null;
  player_digs?: number | null;
  total_digs?: number | null;
  latest_update: string;
  is_fake_player?: boolean | null;
};

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildHeaders() {
  return {
    apikey: appEnv.supabaseAnonKey,
    Authorization: `Bearer ${appEnv.supabaseAnonKey}`,
    "Content-Type": "application/json",
  };
}

function buildSupabaseUrl(path: string, params?: Record<string, string | number | undefined>) {
  const url = new URL(`${appEnv.supabaseUrl}/rest/v1/${path}`);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function isValidAeternumPlayerStat(row: AeternumPlayerStatRow, serverTotal: number) {
  const usernameLower = (row.username_lower ?? row.username ?? "").trim().toLowerCase();
  const blocks = toNumber(row.player_digs);
  return shouldIncludeLeaderboardUsername(usernameLower, [])
    && blocks > 0
    && row.is_fake_player !== true
    && !(serverTotal > 0 && blocks > serverTotal);
}

const defaultSettings: SettingsSummary = {
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

function blankSnapshot(source: AeTweaksSnapshot["meta"]["source"], title: string, description: string): AeTweaksSnapshot {
  return {
    meta: {
      source,
      title,
      description,
    },
    viewer: null,
    player: null,
    projects: [],
    sessions: [],
    dailyGoal: null,
    worlds: [],
    notifications: [],
    leaderboard: null,
    settings: defaultSettings,
    estimatedBlocksPerHour: 0,
    estimatedFinishSeconds: null,
    lastSyncedAt: null,
  };
}

async function restSelect<T>(path: string, params?: Record<string, string | number | undefined>) {
  const response = await fetch(buildSupabaseUrl(path, params), { headers: buildHeaders() });
  if (!response.ok) {
    throw new Error(`${path} query failed (${response.status})`);
  }
  return (await response.json()) as T[];
}

function authRequiredSnapshot(): AeTweaksSnapshot {
  return blankSnapshot("auth_required", "Sign in required", "Connect your Minecraft account to open your private MMM dashboard.");
}

export async function fetchAeTweaksSnapshot(): Promise<AeTweaksSnapshot> {
  if (isLocalProductionPreview()) {
    try {
      const response = await fetchWithTimeout(apiUrl("/api/dashboard"), {
        credentials: apiCredentials(),
        headers: { Accept: "application/json" },
        timeoutMs: 2_000,
        timeoutMessage: "Local owner dashboard request timed out.",
      });
      if (response.ok) {
        return (await response.json()) as AeTweaksSnapshot;
      }
      logLocalApiFailure("Local owner dashboard", {
        url: apiUrl("/api/dashboard"),
        status: response.status,
        body: await readResponseBody(response),
      });
    } catch (error) {
      logLocalApiFailure("Local owner dashboard", {
        url: apiUrl("/api/dashboard"),
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return buildLocalOwnerSnapshot();
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(apiUrl("/api/dashboard"), {
      credentials: apiCredentials(),
      headers: { Accept: "application/json" },
      timeoutMs: 8_000,
      timeoutMessage: "Dashboard request timed out.",
    });
  } catch (error) {
    logLocalApiFailure("Dashboard", {
      url: "/api/dashboard",
      error: error instanceof Error ? error.message : String(error),
    });
    if (isLocalRuntime()) {
      return authRequiredSnapshot();
    }
    return blankSnapshot("error", "Dashboard unavailable", "Your private MMM dashboard could not be loaded right now.");
  }

  if (response.status === 401) {
    return authRequiredSnapshot();
  }

  if (!response.ok) {
    const body = await readResponseBody(response);
    logLocalApiFailure("Dashboard", {
      url: "/api/dashboard",
      status: response.status,
      body,
    });
    if (isLocalRuntime()) {
      return authRequiredSnapshot();
    }
    return blankSnapshot("error", "Dashboard unavailable", "Your private MMM dashboard could not be loaded right now.");
  }

  return (await response.json()) as AeTweaksSnapshot;
}

export async function fetchCurrentUser(): Promise<ViewerSummary | null> {
  if (isLocalProductionPreview()) {
    try {
      const response = await fetchWithTimeout(apiUrl("/api/me"), {
        credentials: apiCredentials(),
        cache: "no-store",
        timeoutMs: 2_000,
        timeoutMessage: "Local owner session request timed out.",
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        const payload = (await response.json()) as { authenticated: boolean; user?: ViewerSummary };
        return payload.authenticated ? payload.user ?? LOCAL_OWNER_VIEWER : null;
      }
      logLocalApiFailure("Local owner user", {
        url: apiUrl("/api/me"),
        status: response.status,
        body: await readResponseBody(response),
      });
    } catch (error) {
      logLocalApiFailure("Local owner user", {
        url: apiUrl("/api/me"),
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return LOCAL_OWNER_VIEWER;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(apiUrl("/api/me"), {
      credentials: apiCredentials(),
      cache: "no-store",
      timeoutMs: 8_000,
      timeoutMessage: "MMM could not verify your login state in time. Please refresh and try again.",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    logLocalApiFailure("Current user", {
      url: "/api/me",
      error: error instanceof Error ? error.message : String(error),
    });
    if (isLocalRuntime()) {
      return null;
    }
    throw error;
  }

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const body = await readResponseBody(response);
    logLocalApiFailure("Current user", {
      url: "/api/me",
      status: response.status,
      body,
    });
    if (isLocalRuntime()) {
      return null;
    }
    throw new Error("Unable to load current user.");
  }

  const payload = (await response.json()) as { authenticated: boolean; user?: ViewerSummary };
  return payload.authenticated ? payload.user ?? null : null;
}

export async function fetchAeternumLeaderboard(): Promise<LeaderboardRowSummary[]> {
  if (!hasSupabaseEnv) {
    return [];
  }

  const aeternumRows = await restSelect<AeternumPlayerStatRow>("aeternum_player_stats", {
    select: "player_id,server_name,username,username_lower,player_digs,total_digs,latest_update,is_fake_player",
    is_fake_player: "eq.false",
    order: "latest_update.desc,player_digs.desc,total_digs.desc",
    limit: 200,
  });

  const serverTotal = aeternumRows.reduce((max, row) => Math.max(max, toNumber(row.total_digs)), 0);
  const byUsername = new Map<string, AeternumPlayerStatRow>();
  for (const row of aeternumRows) {
    if (!row.username || !isValidAeternumPlayerStat(row, serverTotal)) continue;
    const key = (row.username_lower ?? row.username).toLowerCase();
    const existing = byUsername.get(key);
    if (!existing
      || toNumber(row.player_digs) > toNumber(existing.player_digs)
      || (toNumber(row.player_digs) === toNumber(existing.player_digs)
        && new Date(row.latest_update).getTime() > new Date(existing.latest_update).getTime())) {
      byUsername.set(key, row);
    }
  }

  return Array.from(byUsername.values())
    .sort((a, b) => toNumber(b.player_digs) - toNumber(a.player_digs) || new Date(b.latest_update).getTime() - new Date(a.latest_update).getTime() || a.username.localeCompare(b.username))
    .slice(0, 30)
    .map((row, index) => ({
    playerId: row.player_id ?? null,
    username: row.username,
    skinFaceUrl: `https://minotar.net/avatar/${encodeURIComponent(row.username)}/32`,
    lastUpdated: row.latest_update,
    blocksMined: toNumber(row.player_digs),
    totalDigs: toNumber(row.player_digs),
    rank: index + 1,
    sourceServer: row.server_name,
    sourceKey: `aeternum:${row.server_name.toLowerCase()}`,
    sourceCount: 1,
    viewKind: "source" as const,
  }));
}

export async function fetchAeternumTotalDigs(): Promise<number> {
  if (!hasSupabaseEnv) {
    return 0;
  }

  const rows = await restSelect<AeternumPlayerStatRow>("aeternum_player_stats", {
    select: "username,username_lower,player_digs,total_digs,is_fake_player",
    is_fake_player: "eq.false",
  });

  return rows.reduce((max, row) => Math.max(max, toNumber(row.total_digs)), 0);
}
