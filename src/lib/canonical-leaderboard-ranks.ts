import { fetchLeaderboardSummary } from "@/lib/leaderboard-repository";
import type { LeaderboardRowSummary } from "@/lib/types";
import { canonicalPlayerName } from "../../shared/player-identity.js";

export const CANONICAL_RANK_WINDOW_PAGE_SIZE = 100;

export type CanonicalRankWindow = {
  startIndex: number;
  rows: LeaderboardRowSummary[];
};

export function normalizeLeaderboardPlayerName(value: string | null | undefined) {
  return canonicalPlayerName(value);
}

export function dedupeLeaderboardRows(rows: LeaderboardRowSummary[]) {
  const seenPlayers = new Set<string>();
  return rows.filter((player) => {
    const key = normalizeLeaderboardPlayerName(player.username);
    if (!key) return true;
    if (seenPlayers.has(key)) return false;
    seenPlayers.add(key);
    return true;
  });
}

export function expectedRowsForPage(page: number, pageSize: number, totalRows: number, totalPages: number) {
  if (page < totalPages) return pageSize;
  return Math.max(0, Math.min(pageSize, totalRows - (page - 1) * pageSize));
}

export function canonicalWindowPageForIndex(startIndex: number) {
  const windowStart = Math.max(0, startIndex - CANONICAL_RANK_WINDOW_PAGE_SIZE);
  return Math.floor(windowStart / CANONICAL_RANK_WINDOW_PAGE_SIZE) + 1;
}

export async function fetchCanonicalMainRankWindow(windowPage: number): Promise<CanonicalRankWindow> {
  const firstPage = await fetchLeaderboardSummary({
    page: windowPage,
    pageSize: CANONICAL_RANK_WINDOW_PAGE_SIZE,
  });
  const followupPages = [windowPage + 1, windowPage + 2]
    .filter((candidatePage) => candidatePage <= firstPage.totalPages);
  const followups = await Promise.all(
    followupPages.map((candidatePage) =>
      fetchLeaderboardSummary({
        page: candidatePage,
        pageSize: CANONICAL_RANK_WINDOW_PAGE_SIZE,
      }),
    ),
  );

  return {
    startIndex: (windowPage - 1) * CANONICAL_RANK_WINDOW_PAGE_SIZE,
    rows: [firstPage, ...followups].flatMap((response) => response.rows),
  };
}

export function canonicalRowsForPageFromWindow(
  window: CanonicalRankWindow,
  requestedStartIndex: number,
  expectedRowCount: number,
) {
  const uniqueWindowRows = dedupeLeaderboardRows(window.rows);
  const localStartIndex = Math.max(0, requestedStartIndex - window.startIndex);
  const windowRows = uniqueWindowRows.slice(localStartIndex, localStartIndex + expectedRowCount);
  const firstRankOnPage = requestedStartIndex + 1;

  return windowRows.map((player, index) => ({
    ...player,
    rank: firstRankOnPage + index,
  }));
}

export function canonicalizeRowsFromWindows(
  rows: LeaderboardRowSummary[],
  windows: CanonicalRankWindow[],
) {
  if (!rows.length || !windows.length) return rows;

  const canonicalRowsByPlayer = new Map<string, LeaderboardRowSummary>();
  for (const window of windows) {
    const uniqueWindowRows = dedupeLeaderboardRows(window.rows);
    uniqueWindowRows.forEach((player, index) => {
      const key = normalizeLeaderboardPlayerName(player.username);
      if (!key || canonicalRowsByPlayer.has(key)) return;
      canonicalRowsByPlayer.set(key, {
        ...player,
        rank: window.startIndex + index + 1,
      });
    });
  }

  return rows.map((row) => {
    const canonicalRow = canonicalRowsByPlayer.get(normalizeLeaderboardPlayerName(row.username));
    return canonicalRow
      ? {
          ...row,
          blocksMined: canonicalRow.blocksMined,
          totalDigs: canonicalRow.totalDigs,
          rank: canonicalRow.rank,
          sourceCount: canonicalRow.sourceCount,
          lastUpdated: canonicalRow.lastUpdated,
        }
      : row;
  });
}
