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
    order: "latest_update.desc,player_digs.desc,total_digs.desc",
    limit: 200,
  });

  const deduped = new Map<string, AeternumLeaderboardRow>();
  for (const row of rows) {
    if (!row.username || toNumber(row.player_digs) <= 0) continue;
    const key = (row.username_lower || row.username.toLowerCase()).trim();
    const existing = deduped.get(key);
    if (!existing
      || toNumber(row.player_digs) > toNumber(existing.player_digs)
      || (toNumber(row.player_digs) === toNumber(existing.player_digs)
        && new Date(row.latest_update).getTime() > new Date(existing.latest_update).getTime())) {
      deduped.set(key, row);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => toNumber(b.player_digs) - toNumber(a.player_digs) || new Date(b.latest_update).getTime() - new Date(a.latest_update).getTime() || a.username.localeCompare(b.username))
    .slice(0, 30)
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
  const totalRows = await selectRows<Pick<AeternumLeaderboardRow, "player_digs" | "total_digs">>("aeternum_player_stats", {
    select: "player_digs,total_digs",
  });

  const maxReportedTotal = totalRows.reduce((max, row) => Math.max(max, toNumber(row.total_digs)), 0);
  const totalDigs = maxReportedTotal > 0 ? maxReportedTotal : null;

  return {
    rows,
    totalDigs,
    playerCount: rows.length,
    sourceServer: rows[0]?.sourceServer ?? "Aeternum",
    objectiveLabel: "Digs Leaderboard",
    highlightedPlayer: appEnv.defaultPlayerUsername || null,
  };
}
