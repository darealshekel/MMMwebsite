import { isPlaceholderLeaderboardUsername } from "../../shared/leaderboard-ingestion.js";

type JsonRecord = Record<string, unknown>;

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePlayerKey(value: unknown) {
  return String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s*\(new\)\s*$/i, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isVisiblePlayerKey(key: string) {
  return key !== "" && !isPlaceholderLeaderboardUsername(key);
}

function sourceRows(input: JsonRecord | JsonRecord[] | null | undefined) {
  if (Array.isArray(input)) {
    return input;
  }
  return input && Array.isArray(input.rows) ? (input.rows as JsonRecord[]) : [];
}

function rowPlayerKey(row: JsonRecord) {
  const usernameKey = normalizePlayerKey(row.username ?? row.playerName ?? row.minecraft_username);
  if (isVisiblePlayerKey(usernameKey)) {
    return usernameKey;
  }

  const playerIdKey = String(row.playerId ?? row.player_id ?? "").trim().toLowerCase();
  return playerIdKey || "";
}

export function getUniqueSourceRows(input: JsonRecord | JsonRecord[] | null | undefined) {
  const byPlayer = new Map<string, JsonRecord>();

  for (const row of sourceRows(input)) {
    const key = rowPlayerKey(row);
    if (!key) {
      continue;
    }
    const usernameKey = normalizePlayerKey(row.username ?? row.playerName ?? row.minecraft_username);
    if (usernameKey && !isVisiblePlayerKey(usernameKey)) {
      continue;
    }

    const blocksMined = Math.max(0, toNumber(row.blocksMined ?? row.score ?? row.totalDigs));
    const existing = byPlayer.get(key);
    if (!existing || blocksMined >= Math.max(0, toNumber(existing.blocksMined ?? existing.score ?? existing.totalDigs))) {
      byPlayer.set(key, {
        ...row,
        blocksMined,
      });
    }
  }

  return [...byPlayer.values()];
}

export function getSourceStats(input: JsonRecord | JsonRecord[] | null | undefined) {
  const rows = getUniqueSourceRows(input);
  const rowTotalBlocks = rows.reduce((sum, row) => sum + Math.max(0, toNumber(row.blocksMined ?? row.score ?? row.totalDigs)), 0);
  const sourceTotal = !Array.isArray(input) ? toNumber(input?.totalBlocks, Number.NaN) : Number.NaN;
  const totalBlocks = Number.isFinite(sourceTotal) && sourceTotal > 0 ? sourceTotal : rowTotalBlocks;

  return {
    totalBlocks,
    rowTotalBlocks,
    playerCount: rows.length,
  };
}
