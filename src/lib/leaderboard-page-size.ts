export const DEFAULT_LEADERBOARD_PAGE_SIZE = 20;

export const LEADERBOARD_PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 50, 100] as const;

export type LeaderboardPageSize = (typeof LEADERBOARD_PAGE_SIZE_OPTIONS)[number];

export function normalizeLeaderboardPageSize(value: string | number | null | undefined): LeaderboardPageSize {
  const parsed = typeof value === "number" ? value : Number(value);
  const size = Number.isFinite(parsed) ? Math.floor(parsed) : DEFAULT_LEADERBOARD_PAGE_SIZE;
  return LEADERBOARD_PAGE_SIZE_OPTIONS.includes(size as LeaderboardPageSize)
    ? (size as LeaderboardPageSize)
    : DEFAULT_LEADERBOARD_PAGE_SIZE;
}
