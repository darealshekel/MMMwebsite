import { appEnv, hasSupabaseEnv } from "@/lib/env";
import { demoSnapshot } from "@/lib/demo-data";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
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
  const response = await fetchWithTimeout("/api/me", {
    credentials: "include",
    cache: "no-store",
    timeoutMs: 8_000,
    timeoutMessage: "AeTweaks could not verify your login state in time. Please refresh and try again.",
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
    is_fake_player: "eq.false",
    order: "latest_update.desc,player_digs.desc,total_digs.desc",
    limit: 200,
  });

  const byUsername = new Map<string, AeternumPlayerStatRow>();
  for (const row of aeternumRows) {
    if (!row.username || toNumber(row.player_digs) <= 0) continue;
    const key = row.username.toLowerCase();
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
    totalDigs: toNumber(row.total_digs),
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
    select: "total_digs",
    is_fake_player: "eq.false",
  });

  return rows.reduce((max, row) => Math.max(max, toNumber(row.total_digs)), 0);
}
