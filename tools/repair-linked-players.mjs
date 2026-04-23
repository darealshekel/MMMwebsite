import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve("C:/Users/mult0/Downloads/mining-tracker-mod (7)/aetweaks-site");
const ENV_FILE = path.join(ROOT, ".env.vercel.production");
const envRaw = fs.readFileSync(ENV_FILE, "utf8");

function getEnv(name) {
  const line = envRaw.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  if (!line) return "";

  let value = line.slice(name.length + 1).trim();
  if (value.startsWith("\"") && value.endsWith("\"")) {
    value = value.slice(1, -1);
  }

  return value.replace(/\\r\\n/g, "").trim();
}

const supabase = createClient(getEnv("VITE_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function lower(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

async function pickCanonicalPlayer(usernameLower, minecraftUuidHash) {
  if (minecraftUuidHash) {
    const byUuid = await supabase
      .from("players")
      .select("id,last_seen_at,total_synced_blocks")
      .eq("minecraft_uuid_hash", minecraftUuidHash)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byUuid.error) throw byUuid.error;
    if (byUuid.data) return byUuid.data;
  }

  const aeternum = await supabase
    .from("aeternum_player_stats")
    .select("player_id,latest_update")
    .eq("server_name", "Aeternum")
    .eq("username_lower", usernameLower)
    .order("latest_update", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (aeternum.error) throw aeternum.error;
  if (aeternum.data?.player_id) {
    const byAeternum = await supabase
      .from("players")
      .select("id,last_seen_at,total_synced_blocks")
      .eq("id", aeternum.data.player_id)
      .maybeSingle();

    if (byAeternum.error) throw byAeternum.error;
    if (byAeternum.data) return byAeternum.data;
  }

  const byUsername = await supabase
    .from("players")
    .select("id,last_seen_at,total_synced_blocks")
    .eq("username_lower", usernameLower)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byUsername.error) throw byUsername.error;
  return byUsername.data ?? null;
}

async function repairAccount(account) {
  const usernameLower = lower(account.minecraft_username);
  if (!usernameLower) return { username: account.minecraft_username, repaired: false, reason: "missing_username" };

  const canonical = await pickCanonicalPlayer(usernameLower, account.minecraft_uuid_hash);
  if (!canonical) {
    return { username: account.minecraft_username, repaired: false, reason: "no_player_row" };
  }

  const aeternumRows = await supabase
    .from("aeternum_player_stats")
    .select("player_digs,total_digs,latest_update")
    .eq("server_name", "Aeternum")
    .eq("username_lower", usernameLower)
    .order("latest_update", { ascending: false });

  if (aeternumRows.error) throw aeternumRows.error;

  const authoritativeDigs = Math.max(0, ...(aeternumRows.data ?? []).map((row) => Number(row.player_digs ?? 0)));
  const latestUpdate = (aeternumRows.data ?? [])
    .map((row) => row.latest_update)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? new Date().toISOString();

  const nextBlocks = Math.max(Number(canonical.total_synced_blocks ?? 0), authoritativeDigs);

  const { error: playerError } = await supabase
    .from("players")
    .update({
      username: account.minecraft_username,
      minecraft_uuid: account.minecraft_uuid,
      minecraft_uuid_hash: account.minecraft_uuid_hash,
      total_synced_blocks: nextBlocks,
      updated_at: new Date().toISOString(),
    })
    .eq("id", canonical.id);
  if (playerError) throw playerError;

  const { error: aeternumError } = await supabase
    .from("aeternum_player_stats")
    .update({
      player_id: canonical.id,
      minecraft_uuid: account.minecraft_uuid,
      minecraft_uuid_hash: account.minecraft_uuid_hash,
      updated_at: new Date().toISOString(),
    })
    .eq("server_name", "Aeternum")
    .eq("username_lower", usernameLower);
  if (aeternumError) throw aeternumError;

  const { error: leaderboardError } = await supabase.rpc("submit_source_score", {
    p_player_id: canonical.id,
    p_source_slug: "aeternum",
    p_source_display_name: "Aeternum",
    p_source_type: "server",
    p_score: authoritativeDigs > 0 ? authoritativeDigs : nextBlocks,
    p_is_public: true,
    p_is_approved: true,
  });
  if (leaderboardError) throw leaderboardError;

  return {
    username: account.minecraft_username,
    repaired: true,
    playerId: canonical.id,
    authoritativeDigs,
    latestUpdate,
  };
}

async function main() {
  const { data: accounts, error } = await supabase
    .from("connected_accounts")
    .select("user_id,minecraft_uuid,minecraft_uuid_hash,minecraft_username,updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const results = [];
  for (const account of accounts ?? []) {
    results.push(await repairAccount(account));
  }

  console.log(JSON.stringify({ repaired: results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
