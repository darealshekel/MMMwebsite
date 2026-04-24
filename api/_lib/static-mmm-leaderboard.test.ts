import { describe, expect, it } from "vitest";
import { buildStaticLeaderboardResponse } from "./static-mmm-leaderboard.js";

describe("static MMM leaderboard search", () => {
  it("filters Digs rankings by player name without changing featured rows", () => {
    const unfiltered = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?pageSize=100"));
    expect(unfiltered).toBeTruthy();

    const target = unfiltered!.rows.find((row) => Number(row.rank ?? 0) > 3);
    expect(target).toBeTruthy();

    const filtered = buildStaticLeaderboardResponse(
      new URL(`https://mmm.test/api/leaderboard?pageSize=100&query=${encodeURIComponent(String(target!.username ?? ""))}`),
    );

    expect(filtered?.rows.some((row) => String(row.username ?? "").toLowerCase() === String(target!.username ?? "").toLowerCase())).toBe(true);
    expect(filtered?.featuredRows.map((row) => row.username)).toEqual(unfiltered!.featuredRows.map((row) => row.username));
  });

  it("does not treat source names as player search matches on the Digs page", () => {
    const unfiltered = buildStaticLeaderboardResponse(new URL("https://mmm.test/api/leaderboard?pageSize=100"));
    expect(unfiltered).toBeTruthy();

    const sourceName = String(unfiltered!.rows.find((row) => String(row.sourceServer ?? "").trim())?.sourceServer ?? "");
    expect(sourceName).not.toBe("");

    const filtered = buildStaticLeaderboardResponse(
      new URL(`https://mmm.test/api/leaderboard?pageSize=100&query=${encodeURIComponent(sourceName)}`),
    );

    expect(filtered?.rows.every((row) => String(row.username ?? "").toLowerCase().includes(sourceName.toLowerCase()))).toBe(true);
  });
});
