import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve("C:/Users/mult0/Downloads/mining-tracker-mod (7)/aetweaks-site");
const ENV_FILE = path.join(ROOT, ".env.vercel.production");
const envRaw = fs.readFileSync(ENV_FILE, "utf8");

function getEnv(name) {
  const line = envRaw.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  if (!line) {
    return "";
  }

  let value = line.slice(name.length + 1).trim();
  if (value.startsWith("\"") && value.endsWith("\"")) {
    value = value.slice(1, -1);
  }

  return value.replace(/\\r\\n/g, "").trim();
}

const env = {
  supabaseUrl: getEnv("VITE_SUPABASE_URL"),
  supabaseServiceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  appBaseUrl: getEnv("APP_BASE_URL"),
  sessionSecret: getEnv("SESSION_SIGNING_SECRET"),
};

if (!env.supabaseUrl || !env.supabaseServiceRoleKey || !env.appBaseUrl || !env.sessionSecret) {
  throw new Error("Missing required environment variables for sync verification.");
}

const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomToken(bytes = 32) {
  return toBase64Url(crypto.randomBytes(bytes));
}

function hmac(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function signPayload(payload) {
  const raw = toBase64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = hmac(raw, env.sessionSecret);
  return `${raw}.${signature}`;
}

async function postSync(payload) {
  const response = await fetch(`${env.supabaseUrl}/functions/v1/aetweaks-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

async function fetchAeternumRow(username) {
  const { data, error } = await supabase
    .from("aeternum_player_stats")
    .select("player_id,username,player_digs,total_digs,server_name,latest_update")
    .eq("username_lower", username.toLowerCase())
    .eq("server_name", "Aeternum")
    .order("latest_update", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function fetchPlayerRowById(playerId) {
  const { data, error } = await supabase
    .from("players")
    .select("id,username,total_synced_blocks,last_seen_at")
    .eq("id", playerId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function fetchServerTotal() {
  const { data, error } = await supabase
    .from("aeternum_player_stats")
    .select("total_digs")
    .eq("server_name", "Aeternum")
    .order("total_digs", { ascending: false })
    .limit(1);

  if (error) throw error;
  return Number(data?.[0]?.total_digs ?? 0);
}

async function cleanupSyntheticPlayer(username, playerId = null) {
  const usernameLower = username.toLowerCase();

  const runDelete = async (label, query) => {
    const { error } = await query;
    if (error) {
      throw new Error(`Failed to clean ${label}: ${error.message}`);
    }
  };

  await runDelete(
    "aeternum_player_stats",
    supabase.from("aeternum_player_stats").delete().eq("username_lower", usernameLower).eq("server_name", "Aeternum"),
  );
  await runDelete(
    "connected_accounts",
    supabase.from("connected_accounts").delete().eq("minecraft_username", username),
  );

  if (!playerId) {
    return;
  }

  await runDelete("leaderboard_entries", supabase.from("leaderboard_entries").delete().eq("player_id", playerId));
  await runDelete("player_world_stats", supabase.from("player_world_stats").delete().eq("player_id", playerId));
  await runDelete("synced_stats", supabase.from("synced_stats").delete().eq("player_id", playerId));
  await runDelete("notifications", supabase.from("notifications").delete().eq("player_id", playerId));
  await runDelete("daily_goals", supabase.from("daily_goals").delete().eq("player_id", playerId));
  await runDelete("projects", supabase.from("projects").delete().eq("player_id", playerId));
  await runDelete("mining_sessions", supabase.from("mining_sessions").delete().eq("player_id", playerId));
  await runDelete("user_settings", supabase.from("user_settings").delete().eq("player_id", playerId));
  await runDelete("players", supabase.from("players").delete().eq("id", playerId));
}

async function createDashboardSession(username) {
  const { data: account, error } = await supabase
    .from("connected_accounts")
    .select("user_id,minecraft_username,minecraft_uuid_hash")
    .eq("minecraft_username", username)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!account) {
    throw new Error(`No connected account found for ${username}.`);
  }

  const sessionToken = randomToken(32);
  const csrfToken = randomToken(24);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const sessionTokenHash = hmac(sessionToken, account.minecraft_uuid_hash);
  const csrfTokenHash = hmac(csrfToken, account.minecraft_uuid_hash);

  const { data: sessionRow, error: sessionError } = await supabase
    .from("auth_sessions")
    .insert({
      user_id: account.user_id,
      session_token_hash: sessionTokenHash,
      csrf_token_hash: csrfTokenHash,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (sessionError) throw sessionError;

  const signedSession = signPayload({
    u: account.user_id,
    t: sessionToken,
    c: csrfToken,
    e: expiresAt.getTime(),
  });

  const cookie = [
    `aetweaks_session=${signedSession}`,
    `aetweaks_csrf=${csrfToken}`,
  ].join("; ");

  return { sessionId: sessionRow.id, cookie, userId: account.user_id };
}

async function fetchWithCookie(url, cookie) {
  const response = await fetch(url, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function main() {
  const baseUsername = "codexsync";
  const username = `${baseUsername}${Math.floor(Date.now() / 1000).toString().slice(-5)}`.slice(0, 16);
  const clientId = `codex-${Date.now()}`;
  const initialPlayerDigs = 123_456;
  const updatedPlayerDigs = 123_999;
  const initialServerTotal = 235_500_000;
  const updatedServerTotal = 235_500_321;
  let sessionId = null;
  let syntheticPlayerId = null;

  const basePayload = {
    client_id: clientId,
    username,
    minecraft_uuid: null,
    mod_version: "1.0.4",
    minecraft_version: "1.21.4",
    world: {
      key: "play.aeternum.net",
      display_name: "Aeternum",
      kind: "multiplayer",
      host: "play.aeternum.net",
    },
    lifetime_totals: {
      total_blocks: 500,
    },
    current_world_totals: {
      world_key: "play.aeternum.net",
      display_name: "Aeternum",
      kind: "multiplayer",
      host: "play.aeternum.net",
      total_blocks: 500,
      last_seen_at: new Date().toISOString(),
    },
  };

  const firstSync = await postSync({
    ...basePayload,
    player_total_digs: {
      username,
      total_digs: initialPlayerDigs,
      server: "Some Other Label",
      timestamp: new Date().toISOString(),
      objective_title: "Duggaed",
    },
    aeternum_leaderboard: {
      server_name: "Wrong Label",
      objective_title: "Duggaed",
      total_digs: initialServerTotal,
      captured_at: new Date().toISOString(),
      entries: [
        { username, digs: initialPlayerDigs, rank: 25 },
        { username: "DarkAnyebu", digs: 2016497, rank: 7 },
        { username: "Jotauro", digs: 1965667, rank: 8 },
      ],
    },
  });

  if (!firstSync.ok) {
    throw new Error(`First sync failed (${firstSync.status}): ${firstSync.text}`);
  }

  const secondSync = await postSync({
    ...basePayload,
    player_total_digs: {
      username,
      total_digs: updatedPlayerDigs,
      server: "Aeternum",
      timestamp: new Date().toISOString(),
      objective_title: "Duggaed",
    },
    aeternum_leaderboard: {
      server_name: "Aeternum",
      objective_title: "Duggaed",
      total_digs: updatedServerTotal,
      captured_at: new Date().toISOString(),
      entries: [
        { username, digs: updatedPlayerDigs, rank: 24 },
        { username: "DarkAnyebu", digs: 2016497, rank: 7 },
        { username: "Jotauro", digs: 1965667, rank: 8 },
      ],
    },
  });

  if (!secondSync.ok) {
    throw new Error(`Second sync failed (${secondSync.status}): ${secondSync.text}`);
  }

  const staleSync = await postSync({
    ...basePayload,
    player_total_digs: {
      username,
      total_digs: initialPlayerDigs - 1000,
      server: "Aeternum",
      timestamp: new Date().toISOString(),
      objective_title: "Duggaed",
    },
    aeternum_leaderboard: {
      server_name: "Aeternum",
      objective_title: "Duggaed",
      total_digs: initialServerTotal - 1000,
      captured_at: new Date().toISOString(),
      entries: [
        { username, digs: initialPlayerDigs - 1000, rank: 30 },
        { username: "DarkAnyebu", digs: 2016497, rank: 7 },
        { username: "Jotauro", digs: 1965667, rank: 8 },
      ],
    },
  });

  if (!staleSync.ok) {
    throw new Error(`Stale sync failed (${staleSync.status}): ${staleSync.text}`);
  }

  const syncedAeternumRow = await fetchAeternumRow(username);
  if (!syncedAeternumRow) {
    throw new Error("Expected synced Aeternum row to exist.");
  }

  const syncedPlayerRow = await fetchPlayerRowById(syncedAeternumRow.player_id);
  const currentServerTotal = await fetchServerTotal();

  if (Number(syncedAeternumRow.player_digs) !== updatedPlayerDigs) {
    throw new Error(`Expected player_digs ${updatedPlayerDigs}, received ${syncedAeternumRow.player_digs}`);
  }
  if (Number(syncedAeternumRow.total_digs) < updatedServerTotal) {
    throw new Error(`Expected total_digs >= ${updatedServerTotal}, received ${syncedAeternumRow.total_digs}`);
  }
  if (Number(syncedPlayerRow?.total_synced_blocks ?? 0) < updatedPlayerDigs) {
    throw new Error(`Expected players.total_synced_blocks >= ${updatedPlayerDigs}, received ${syncedPlayerRow?.total_synced_blocks}`);
  }
  if (currentServerTotal < updatedServerTotal) {
    throw new Error(`Expected live Aeternum server total >= ${updatedServerTotal}, received ${currentServerTotal}`);
  }

  try {
    const { sessionId: createdSessionId, cookie } = await createDashboardSession("5hekel");
    sessionId = createdSessionId;
    syntheticPlayerId = syncedAeternumRow.player_id ?? null;

    const unauthenticated = await fetch(`${env.appBaseUrl}/api/dashboard`, {
      headers: { Accept: "application/json" },
    });
    if (unauthenticated.status !== 401) {
      throw new Error(`Expected unauthenticated dashboard status 401, received ${unauthenticated.status}`);
    }

    const meResponse = await fetchWithCookie(`${env.appBaseUrl}/api/me`, cookie);
    if (meResponse.status !== 200 || !meResponse.body?.authenticated) {
      throw new Error(`Expected authenticated /api/me response, received ${meResponse.status}`);
    }

    const dashboardResponse = await fetchWithCookie(`${env.appBaseUrl}/api/dashboard`, cookie);
    if (dashboardResponse.status !== 200 || !dashboardResponse.body?.player) {
      throw new Error(`Expected authenticated dashboard payload, received ${dashboardResponse.status}`);
    }

    const dashboardPlayer = dashboardResponse.body.player;
    if (dashboardPlayer.username.toLowerCase() !== "5hekel") {
      throw new Error(`Expected dashboard player username 5hekel, received ${dashboardPlayer.username}`);
    }
    if (Number(dashboardPlayer.totalSyncedBlocks) < Number(dashboardPlayer.aeternumTotalDigs ?? 0)) {
      throw new Error("Dashboard totalSyncedBlocks is lower than authoritative Aeternum digs.");
    }
    if (!dashboardResponse.body.leaderboard) {
      throw new Error("Expected dashboard leaderboard data to be present.");
    }

    const refreshedDashboard = await fetchWithCookie(`${env.appBaseUrl}/api/dashboard`, cookie);
    if (refreshedDashboard.status !== 200 || !refreshedDashboard.body?.player) {
      throw new Error(`Expected dashboard refresh to remain authenticated, received ${refreshedDashboard.status}`);
    }

    console.log(JSON.stringify({
      syncChecks: {
        username,
        playerDigs: syncedAeternumRow.player_digs,
        serverTotal: syncedAeternumRow.total_digs,
        playerTotalSyncedBlocks: syncedPlayerRow?.total_synced_blocks ?? null,
      },
      dashboardChecks: {
        username: dashboardPlayer.username,
        totalSyncedBlocks: dashboardPlayer.totalSyncedBlocks,
        aeternumTotalDigs: dashboardPlayer.aeternumTotalDigs,
        leaderboardType: dashboardResponse.body.leaderboard.leaderboardType,
        sessions: dashboardResponse.body.sessions.length,
        projects: dashboardResponse.body.projects.length,
      },
    }, null, 2));
  } finally {
    if (!syntheticPlayerId) {
      syntheticPlayerId = (await fetchAeternumRow(username))?.player_id ?? null;
    }
    if (sessionId) {
      await supabase.from("auth_sessions").delete().eq("id", sessionId);
    }
    await cleanupSyntheticPlayer(username, syntheticPlayerId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
