import { appEnv, hasSupabaseEnv } from "@/lib/env";
import { demoSnapshot } from "@/lib/demo-data";
import type { AeTweaksSnapshot, LeaderboardRowSummary, ViewerSummary } from "@/lib/types";

type AeternumPlayerStatRow = {
  player_id?: string | null;
  server_name: string;
  username: string;
  player_digs?: number | null;
  total_digs?: number | null;
  latest_update: string;
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

async function restSelect<T>(path: string, params?: Record<string, string | number | undefined>) {
  const response = await fetch(buildSupabaseUrl(path, params), { headers: buildHeaders() });
  if (!response.ok) {
    throw new Error(`${path} query failed (${response.status})`);
  }
  return (await response.json()) as T[];
}

function authRequiredSnapshot(): AeTweaksSnapshot {
  return {
    ...demoSnapshot,
    meta: {
      source: "auth_required",
      title: "Sign in required",
      description: "Connect your Minecraft account with Microsoft to open your private AeTweaks dashboard.",
    },
    viewer: null,
    player: null,
    projects: [],
    sessions: [],
    dailyGoal: null,
    worlds: [],
    notifications: [],
    leaderboard: null,
    estimatedBlocksPerHour: 0,
    estimatedFinishSeconds: null,
    lastSyncedAt: null,
  };
}

export async function fetchAeTweaksSnapshot(): Promise<AeTweaksSnapshot> {
  const response = await fetch("/api/dashboard", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (response.status === 401) {
    return authRequiredSnapshot();
  }

  if (!response.ok) {
    return {
      ...demoSnapshot,
      viewer: null,
      meta: {
        source: "error",
        title: "Dashboard unavailable",
        description: "Your private AeTweaks dashboard could not be loaded right now.",
      },
    };
  }

  return (await response.json()) as AeTweaksSnapshot;
}

export async function fetchCurrentUser(): Promise<ViewerSummary | null> {
  const response = await fetch("/api/me", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
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
    select: "player_id,server_name,username,player_digs,total_digs,latest_update",
    server_name: "eq.Aeternum",
    order: "player_digs.desc,total_digs.desc,latest_update.desc",
    limit: 30,
  });

  return aeternumRows.map((row, index) => ({
    playerId: row.player_id ?? null,
    username: row.username,
    skinFaceUrl: `https://minotar.net/avatar/${encodeURIComponent(row.username)}/32`,
    lastUpdated: row.latest_update,
    blocksMined: toNumber(row.player_digs),
    totalDigs: toNumber(row.total_digs),
    rank: index + 1,
    sourceServer: row.server_name,
  }));
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
