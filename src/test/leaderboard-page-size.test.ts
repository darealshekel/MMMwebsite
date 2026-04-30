import { describe, expect, it } from "vitest";
import { DEFAULT_LEADERBOARD_PAGE_SIZE, normalizeLeaderboardPageSize } from "@/lib/leaderboard-page-size";

describe("leaderboard page size", () => {
  it("defaults stale or unsupported page sizes to 20", () => {
    expect(normalizeLeaderboardPageSize(null)).toBe(DEFAULT_LEADERBOARD_PAGE_SIZE);
    expect(normalizeLeaderboardPageSize("")).toBe(DEFAULT_LEADERBOARD_PAGE_SIZE);
    expect(normalizeLeaderboardPageSize("1")).toBe(DEFAULT_LEADERBOARD_PAGE_SIZE);
    expect(normalizeLeaderboardPageSize(30)).toBe(DEFAULT_LEADERBOARD_PAGE_SIZE);
  });

  it("keeps supported view sizes", () => {
    expect(normalizeLeaderboardPageSize("5")).toBe(5);
    expect(normalizeLeaderboardPageSize(10)).toBe(10);
    expect(normalizeLeaderboardPageSize("15")).toBe(15);
    expect(normalizeLeaderboardPageSize(20)).toBe(20);
    expect(normalizeLeaderboardPageSize("50")).toBe(50);
    expect(normalizeLeaderboardPageSize(100)).toBe(100);
  });
});
