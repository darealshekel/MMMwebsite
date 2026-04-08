import { appEnv, hasSupabaseEnv } from "@/lib/env";
import { selectRows } from "@/lib/api-client";
import type { LeaderboardRowSummary } from "@/lib/types";

type AeternumLeaderboardRow = {
  player_id?: string | null;
  username: string;
  username_lower: string;
  player_digs?: number | null;
  total_digs?: number | null;
  latest_update: string;
  server_name: string;
};

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function fetchAeternumLeaderboardRows(): Promise<LeaderboardRowSummary[]> {
  if (!hasSupabaseEnv) {
    return [];
  }

  const rows = await selectRows<AeternumLeaderboardRow>("aeternum_player_stats", {
    select: "player_id,username,username_lower,player_digs,total_digs,latest_update,server_name",
    server_name: "eq.Aeternum",
    order: "player_digs.desc,total_digs.desc,latest_update.desc",
  });

  return rows
    .filter((row) => row.username && toNumber(row.player_digs) > 0)
    .map((row, index) => ({
      playerId: row.player_id ?? null,
      username: row.username,
      skinFaceUrl: `https://minotar.net/avatar/${encodeURIComponent(row.username)}/48`,
      lastUpdated: row.latest_update,
      blocksMined: toNumber(row.player_digs),
      totalDigs: toNumber(row.total_digs),
      rank: index + 1,
      sourceServer: row.server_name,
    }))
    .sort((a, b) => a.rank - b.rank || b.blocksMined - a.blocksMined || a.username.localeCompare(b.username));
}

export async function fetchAeternumLeaderboardSummary() {
  const rows = await fetchAeternumLeaderboardRows();

  const totalDigs = rows.reduce((max, row) => Math.max(max, row.totalDigs), 0);
  return {
    rows,
    totalDigs,
    playerCount: rows.length,
    sourceServer: rows[0]?.sourceServer ?? "Aeternum",
    objectiveLabel: "Digs Leaderboard",
    highlightedPlayer: appEnv.defaultPlayerUsername || null,
  };
}
